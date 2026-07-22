begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users(id, email, encrypted_password, aud, role)
values
  ('10000000-0000-4000-8000-000000000001', 'owner@core-alert.test', '', 'authenticated', 'authenticated'),
  ('10000000-0000-4000-8000-000000000002', 'guardian@core-alert.test', '', 'authenticated', 'authenticated'),
  ('10000000-0000-4000-8000-000000000003', 'unrelated@core-alert.test', '', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.guardian_relationships(protected_user_id, guardian_user_id, guardian_name, guardian_email, status)
values ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Guardian', 'guardian@core-alert.test', 'accepted');

insert into public.incidents(id, user_id, activation_source, is_demo, incident_latitude, incident_longitude)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'manual-test', true, 19.076, 72.8777);
insert into public.incident_guardians(incident_id, guardian_user_id)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002');
insert into public.incident_locations(incident_id, latitude, longitude)
values ('20000000-0000-4000-8000-000000000001', 19.076, 72.8777);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","email":"unrelated@core-alert.test"}', true);
select is((select count(*) from public.profiles), 1::bigint, 'unrelated account sees only its own profile');
select is((select count(*) from public.incidents), 0::bigint, 'unrelated account cannot read incident');
select is((select count(*) from public.incident_locations), 0::bigint, 'unrelated account cannot read location history');
select is((select count(*) from public.incident_guardians), 0::bigint, 'unrelated account cannot read guardian assignment');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","email":"guardian@core-alert.test"}', true);
select is((select count(*) from public.incidents), 1::bigint, 'assigned guardian can read incident');
select is((select count(*) from public.incident_locations), 1::bigint, 'assigned guardian can read location history');
select is((select count(*) from public.profiles), 1::bigint, 'guardian still cannot select protected medical profile directly');

select * from finish();
rollback;
