begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

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
insert into public.incident_recipients(incident_id, relationship_id, guardian_user_id, guardian_name, guardian_phone)
select
  '20000000-0000-4000-8000-000000000001',
  id,
  '10000000-0000-4000-8000-000000000002',
  'Guardian',
  '+919876543210'
from public.guardian_relationships
where protected_user_id = '10000000-0000-4000-8000-000000000001';
insert into public.incident_escalation_events(incident_id, kind, status, message)
values ('20000000-0000-4000-8000-000000000001', 'initial_delivery', 'completed', 'Test delivery event');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated","email":"unrelated@core-alert.test"}', true);
select is((select count(*) from public.profiles), 1::bigint, 'unrelated account sees only its own profile');
select is((select count(*) from public.incidents), 0::bigint, 'unrelated account cannot read incident');
select is((select count(*) from public.incident_locations), 0::bigint, 'unrelated account cannot read location history');
select is((select count(*) from public.incident_guardians), 0::bigint, 'unrelated account cannot read guardian assignment');
select is((select count(*) from public.incident_recipients), 0::bigint, 'unrelated account cannot read guardian delivery state');
select is((select count(*) from public.incident_escalation_events), 0::bigint, 'unrelated account cannot read escalation history');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","email":"guardian@core-alert.test"}', true);
select is((select count(*) from public.incidents), 1::bigint, 'assigned guardian can read incident');
select is((select count(*) from public.incident_locations), 1::bigint, 'assigned guardian can read location history');
select is((select count(*) from public.profiles), 1::bigint, 'guardian still cannot select protected medical profile directly');
select is((select count(*) from public.incident_recipients), 1::bigint, 'assigned guardian can read their delivery state');
select is((select count(*) from public.incident_escalation_events), 1::bigint, 'assigned guardian can read incident escalation history');

select * from finish();
rollback;
