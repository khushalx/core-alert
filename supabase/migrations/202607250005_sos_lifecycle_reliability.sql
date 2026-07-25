begin;

-- Keep every incident row, but normalize legacy duplicate active rows before
-- enforcing the invariant. The newest active incident remains authoritative.
with ranked_active as (
  select
    id,
    row_number() over (
      partition by user_id
      order by started_at desc, created_at desc, id desc
    ) as active_rank
  from public.incidents
  where status = 'active'
)
update public.incidents as incidents
set
  status = 'resolved',
  ended_at = coalesce(incidents.ended_at, now())
from ranked_active
where incidents.id = ranked_active.id
  and ranked_active.active_rank > 1;

create unique index if not exists one_active_incident_per_user
  on public.incidents(user_id)
  where status = 'active';

create unique index if not exists one_initial_delivery_per_incident
  on public.incident_escalation_events(incident_id, kind)
  where kind = 'initial_delivery';

create or replace function public.create_or_restore_incident(
  activation_id uuid,
  requested_activation_source text,
  requested_is_demo boolean,
  requested_latitude double precision default null,
  requested_longitude double precision default null,
  requested_accuracy double precision default null
)
returns public.incidents
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  incident public.incidents%rowtype;
begin
  if caller is null then raise exception 'AUTH_REQUIRED'; end if;
  if activation_id is null then raise exception 'ACTIVATION_ID_REQUIRED'; end if;

  -- Serialize activation attempts for one protected user. This covers two
  -- clients racing before either transaction has inserted its incident.
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));

  select * into incident
  from public.incidents
  where user_id = caller and native_activation_id = activation_id
  limit 1;
  if found then return incident; end if;

  select * into incident
  from public.incidents
  where user_id = caller and status = 'active'
  order by started_at desc
  limit 1
  for update;
  if found then return incident; end if;

  insert into public.incidents(
    user_id,
    status,
    activation_source,
    is_demo,
    native_activation_id,
    incident_latitude,
    incident_longitude,
    last_latitude,
    last_longitude,
    location_accuracy
  )
  values (
    caller,
    'active',
    requested_activation_source,
    requested_is_demo,
    activation_id,
    requested_latitude,
    requested_longitude,
    requested_latitude,
    requested_longitude,
    requested_accuracy
  )
  returning * into incident;

  if requested_latitude is not null and requested_longitude is not null then
    insert into public.incident_locations(incident_id, latitude, longitude, accuracy)
    values (incident.id, requested_latitude, requested_longitude, requested_accuracy);
  end if;
  return incident;
end;
$$;

create or replace function public.resolve_incident_idempotent(target_incident_id uuid)
returns public.incidents
language plpgsql
security definer
set search_path = public
as $$
declare
  incident public.incidents%rowtype;
begin
  select * into incident
  from public.incidents
  where id = target_incident_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'NOT_INCIDENT_OWNER'; end if;

  if incident.status = 'active' then
    update public.incidents
    set status = 'resolved', ended_at = coalesce(ended_at, now())
    where id = incident.id
    returning * into incident;
  elsif incident.status <> 'resolved' then
    raise exception 'INCIDENT_NOT_ACTIVE';
  end if;
  return incident;
end;
$$;

create or replace function public.append_active_incident_location(
  target_incident_id uuid,
  requested_latitude double precision,
  requested_longitude double precision,
  requested_accuracy double precision default null,
  requested_recorded_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.incidents
  set
    last_latitude = requested_latitude,
    last_longitude = requested_longitude,
    location_accuracy = requested_accuracy
  where id = target_incident_id
    and user_id = auth.uid()
    and status = 'active';
  if not found then raise exception 'INCIDENT_NOT_ACTIVE'; end if;

  insert into public.incident_locations(
    incident_id,
    latitude,
    longitude,
    accuracy,
    recorded_at
  )
  values (
    target_incident_id,
    requested_latitude,
    requested_longitude,
    requested_accuracy,
    requested_recorded_at
  );
end;
$$;

revoke all on function public.create_or_restore_incident(
  uuid, text, boolean, double precision, double precision, double precision
) from public;
revoke all on function public.resolve_incident_idempotent(uuid) from public;
revoke all on function public.append_active_incident_location(
  uuid, double precision, double precision, double precision, timestamptz
) from public;
grant execute on function public.create_or_restore_incident(
  uuid, text, boolean, double precision, double precision, double precision
) to authenticated;
grant execute on function public.resolve_incident_idempotent(uuid) to authenticated;
grant execute on function public.append_active_incident_location(
  uuid, double precision, double precision, double precision, timestamptz
) to authenticated;

commit;
