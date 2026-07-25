begin;

create table if not exists public.incident_evidence (
  id uuid primary key,
  incident_id uuid not null references public.incidents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('video', 'audio')),
  mime_type text not null check (mime_type in ('video/mp4', 'audio/mp4')),
  status text not null default 'pending'
    check (status in ('pending', 'uploaded', 'failed')),
  byte_size bigint not null default 0
    check (byte_size between 0 and 157286400),
  duration_ms bigint not null default 0
    check (duration_ms between 0 and 3600000),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null,
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists incident_evidence_incident_idx
  on public.incident_evidence(incident_id, captured_at);
create index if not exists incident_evidence_user_idx
  on public.incident_evidence(user_id, created_at desc);

drop trigger if exists incident_evidence_set_updated_at on public.incident_evidence;
create trigger incident_evidence_set_updated_at
before update on public.incident_evidence
for each row execute function private.set_updated_at();

alter table public.incident_evidence enable row level security;

drop policy if exists incident_evidence_read_allowed on public.incident_evidence;
create policy incident_evidence_read_allowed
on public.incident_evidence for select to authenticated
using (
  user_id = (select auth.uid())
  or private.is_assigned_guardian(incident_id, (select auth.uid()))
);

-- Metadata writes are restricted to the device-authenticated Edge Function.
revoke all on public.incident_evidence from anon, authenticated;
grant select on public.incident_evidence to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'incident-evidence',
  'incident-evidence',
  false,
  157286400,
  array['video/mp4', 'audio/mp4']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists incident_evidence_objects_read_allowed on storage.objects;
create policy incident_evidence_objects_read_allowed
on storage.objects for select to authenticated
using (
  bucket_id = 'incident-evidence'
  and exists (
    select 1
    from public.incident_evidence evidence
    where evidence.storage_path = storage.objects.name
      and evidence.status = 'uploaded'
      and (
        evidence.user_id = (select auth.uid())
        or private.is_assigned_guardian(evidence.incident_id, (select auth.uid()))
      )
  )
);

do $$
begin
  alter publication supabase_realtime add table public.incident_evidence;
exception when duplicate_object then null;
end $$;

commit;
