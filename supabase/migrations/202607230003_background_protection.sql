begin;

create table if not exists public.protection_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  installation_id uuid not null,
  secret_hash text not null,
  platform text not null default 'android' check (platform = 'android'),
  enabled boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, installation_id)
);

alter table public.incidents
  add column if not exists native_activation_id uuid;
create unique index if not exists incidents_native_activation_unique
  on public.incidents(user_id, native_activation_id)
  where native_activation_id is not null;

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  recipient_id uuid references public.incident_recipients(id) on delete set null,
  guardian_user_id uuid references public.profiles(id) on delete set null,
  push_token_id uuid references public.device_push_tokens(id) on delete set null,
  provider text not null default 'expo' check (provider in ('expo', 'twilio')),
  provider_ticket_id text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'failed', 'actioned')),
  provider_error text,
  action text check (action in ('seen', 'responding', 'cannot_respond', 'open_location')),
  actioned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists protection_devices_user_idx
  on public.protection_devices(user_id, enabled);
create index if not exists notification_deliveries_incident_idx
  on public.notification_deliveries(incident_id, created_at);
create index if not exists notification_deliveries_guardian_idx
  on public.notification_deliveries(guardian_user_id, created_at desc);

drop trigger if exists protection_devices_set_updated_at on public.protection_devices;
create trigger protection_devices_set_updated_at before update on public.protection_devices
for each row execute function private.set_updated_at();
drop trigger if exists notification_deliveries_set_updated_at on public.notification_deliveries;
create trigger notification_deliveries_set_updated_at before update on public.notification_deliveries
for each row execute function private.set_updated_at();

alter table public.protection_devices enable row level security;
alter table public.notification_deliveries enable row level security;

-- Device credentials are managed only by Edge Functions using the service role.
revoke all on public.protection_devices from anon, authenticated;

drop policy if exists notification_deliveries_read_allowed on public.notification_deliveries;
create policy notification_deliveries_read_allowed on public.notification_deliveries
for select to authenticated using (
  guardian_user_id = (select auth.uid())
  or private.owns_incident(incident_id, (select auth.uid()))
);

revoke all on public.notification_deliveries from anon, authenticated;
grant select on public.notification_deliveries to authenticated;

create or replace function public.acknowledge_incident_from_notification(
  target_incident_id uuid,
  response text
)
returns setof public.incident_guardians
language plpgsql
security definer
set search_path = public
as $$
begin
  if response not in ('seen', 'responding', 'cannot_respond', 'open_location') then
    raise exception 'INVALID_RESPONSE';
  end if;

  if response <> 'open_location' then
    update public.incident_guardians
    set acknowledgement_status = response,
        acknowledged_at = now()
    where incident_id = target_incident_id
      and guardian_user_id = auth.uid();
  elsif not exists (
    select 1 from public.incident_guardians
    where incident_id = target_incident_id and guardian_user_id = auth.uid()
  ) then
    raise exception 'NOT_ASSIGNED_GUARDIAN';
  end if;

  if not found and response <> 'open_location' then
    raise exception 'NOT_ASSIGNED_GUARDIAN';
  end if;

  update public.notification_deliveries
  set status = 'actioned',
      action = response,
      actioned_at = now()
  where incident_id = target_incident_id
    and guardian_user_id = auth.uid()
    and provider = 'expo';

  return query
  select * from public.incident_guardians
  where incident_id = target_incident_id
    and guardian_user_id = auth.uid();
end;
$$;

grant execute on function public.acknowledge_incident_from_notification(uuid, text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.notification_deliveries;
exception when duplicate_object then null;
end $$;

commit;
