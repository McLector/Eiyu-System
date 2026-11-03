begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

-- Tracker writes go through public.apply_tracker_write (S02 contract). Fixture
-- rows are legacy (no provenance), i.e. custom roots covered by an explicit grant.
create function pg_temp.gw(op text, args jsonb, targets jsonb default '[]')
returns jsonb language sql set search_path = '' as $$
  select public.apply_tracker_write(
    op,
    args || jsonb_build_object('p_expected_targets', targets),
    public.get_tracker_processing_access()->'revision'
  );
$$;
create function pg_temp.hw(op text, habit uuid, extra jsonb default '{}')
returns jsonb language sql set search_path = '' as $$
  select pg_temp.gw(
    op,
    jsonb_build_object('p_habit_id', habit) || extra,
    jsonb_build_array(jsonb_build_object('kind', 'habit', 'id', habit, 'inputKind', 'custom'))
  );
$$;
create function pg_temp.sd(stage uuid, done boolean) returns jsonb
language sql set search_path = '' as $$
  select pg_temp.gw(
    'set_long_quest_stage_done_receipt',
    jsonb_build_object('p_stage_id', stage, 'p_done', done, 'p_request_id', gen_random_uuid()),
    jsonb_build_array(jsonb_build_object('kind', 'chain',
      'id', (select s.long_quest_id from public.long_quest_stages s where s.id = stage), 'inputKind', 'custom'))
  );
$$;
-- Storage upload path bound to the caller's current tracker tuple (S02 contract).
create function pg_temp.media_path(file text) returns text
language sql set search_path = '' as $$
  select auth.uid()::text || '/d2900000-0000-4000-8000-000000000301/'
    || (r->>'ageVersion') || '-' || (r->>'consentVersion') || '-' || (r->>'authorityVersion') || '/' || file
  from (select public.get_tracker_processing_access()->'revision' r) x;
$$;
select is(private.tracker_age_on('2014-10-20','2026-10-19'),false,'day before age12 remains restricted');
select is(private.tracker_age_on('2014-10-20','2026-10-20'),true,'age12 civil-date boundary is inclusive');
select is(private.tracker_age_on('2088-02-29','2100-02-28'),false,'leap birthday waits until March1 in a nonleap year');
select is(private.tracker_age_on('2088-02-29','2100-03-01'),true,'leap birthday reaches age12 on March1');
select ok(not has_function_privilege('anon','public.tracker_writes_allowed()','EXECUTE'),'anonymous clients cannot inspect tracker access');
select ok(not has_function_privilege('authenticated','private.tracker_writes_allowed(uuid)','EXECUTE'),'clients cannot inspect another owner through the private helper');

-- All fixtures are transactional. No retained phone/account data is changed.
insert into auth.users(id,email,raw_user_meta_data) values
 ('d2900000-0000-4000-8000-000000000001','tracker-pause@example.invalid','{"birth_date":"2000-01-01"}'),
 ('d2900000-0000-4000-8000-000000000002','tracker-unknown@example.invalid','{}'),
 ('d2900000-0000-4000-8000-000000000003','tracker-twelve@example.invalid','{"birth_date":"2000-01-01"}');
-- Explicit synthetic age-purpose grants; no optional AI/authority grant.
insert into private.processing_consent(user_id,age_granted,age_notice) values
 ('d2900000-0000-4000-8000-000000000001',true,'2026-10-20-age-v1'),
 ('d2900000-0000-4000-8000-000000000002',true,'2026-10-20-age-v1'),
 ('d2900000-0000-4000-8000-000000000003',true,'2026-10-20-age-v1');
update public.profiles set time_zone='Asia/Manila' where user_id::text like 'd290%';
insert into public.habits(id,user_id,name,easy_version,stat,days) values
 ('d2900000-0000-4000-8000-000000000101','d2900000-0000-4000-8000-000000000001','Retained tracker quest','Read a line','INT','{0,1,2,3,4,5,6}');
insert into public.long_quests(id,user_id,name,stat) values
 ('d2900000-0000-4000-8000-000000000201','d2900000-0000-4000-8000-000000000001','Retained long quest','INT');
insert into public.long_quest_stages(id,long_quest_id,user_id,name,position) values
 ('d2900000-0000-4000-8000-000000000202','d2900000-0000-4000-8000-000000000201','d2900000-0000-4000-8000-000000000001','Retained stage',0);
insert into public.gym_routines(id,user_id,name) values
 ('d2900000-0000-4000-8000-000000000301','d2900000-0000-4000-8000-000000000001','Retained routine');
insert into public.gym_exercises(id,routine_id,user_id,name,position,sets,reps,rest_seconds,rir) values
 ('d2900000-0000-4000-8000-000000000302','d2900000-0000-4000-8000-000000000301','d2900000-0000-4000-8000-000000000001','Retained exercise',0,3,'8',60,2);

select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values('d2900000-0000-4000-8000-000000000099','tracker-new-under12@example.invalid',jsonb_build_object('birth_date',((statement_timestamp() at time zone 'Asia/Manila')::date-interval '11 years')::date::text))$$,'ET002',null,'new declared under12 signup is rejected');
select is((select count(*) from auth.users where id='d2900000-0000-4000-8000-000000000099'),0::bigint,'rejected signup leaves no Auth account');
select is((select count(*) from public.profiles where user_id='d2900000-0000-4000-8000-000000000099'),0::bigint,'rejected signup leaves no profile');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d2900000-0000-4000-8000-000000000001","role":"authenticated"}',true);
-- Fixtures are legacy (custom/fitness roots): explicit owner grants are required.
select public.set_tracker_processing_consent(
  'custom-tracker', true, '2026-10-23-custom-tracker-v1',
  public.get_tracker_processing_access()->'revision'
);
select public.set_tracker_processing_consent('fitness-tracking', true, '2026-10-23-fitness-tracking-v1', public.get_tracker_processing_access()->'revision');
select pg_temp.gw('prepare-day', '{}');
select lives_ok($$select public.get_habits_for_date((statement_timestamp() at time zone 'Asia/Manila')::date)$$,'adult board read prepares existing fixture');
select lives_ok($$select pg_temp.hw('complete_habit','d2900000-0000-4000-8000-000000000101',jsonb_build_object('p_completed_on',(statement_timestamp() at time zone 'Asia/Manila')::date,'p_kind','full'))$$,'adult can complete before correction');
reset role;
insert into public.habits(id,user_id,name,quest_type,easy_version,days,stat,scheduled_date) values('d2900000-0000-4000-8000-000000000102','d2900000-0000-4000-8000-000000000001','Retained overdue quest','one_time',null,'{}','INT',(statement_timestamp() at time zone 'Asia/Manila')::date-1);
set local role authenticated;
select lives_ok(format($$insert into storage.objects(bucket_id,name,owner_id) values('gym-exercise-media',%L,'d2900000-0000-4000-8000-000000000001')$$,pg_temp.media_path('d2900001-0000-4000-8000-000000000001.gif')),'adult storage metadata control is writable');
select is(public.set_account_birthday(((statement_timestamp() at time zone 'Asia/Manila')::date-interval '11 years')::date)->>'trackerWritesPaused','true','under12 correction is accepted and pauses writes');
select is(public.get_account_age()->>'adultDeclared','false','tracker pause does not weaken adult AI denial');
select is((select count(*) from public.habits),2::bigint,'existing quests remain readable');
select is((select count(*) from public.habit_completions),1::bigint,'existing completion remains readable');
select is((select count(*) from public.gym_routines),1::bigint,'existing workout remains readable');
select lives_ok($$select public.get_habits_for_date((statement_timestamp() at time zone 'Asia/Manila')::date)$$,'board read remains available while paused');
select lives_ok($$select public.get_open_habit_recoveries()$$,'recovery-history read remains available while paused');
-- Preparation moved behind the gateway, which refuses while paused (ET001).
select throws_ok($$select pg_temp.gw('prepare-day','{}')$$,'ET001',null,'day preparation is refused while paused');
select is((select quest_type::text from public.habits where id='d2900000-0000-4000-8000-000000000102'),'one_time','refused preparation does not roll over stored tracker data while paused');
select throws_ok($$insert into public.habits(user_id,name,easy_version,stat) values('d2900000-0000-4000-8000-000000000001','Denied quest','Read a line','INT')$$,'42501',null,'direct quest creation denied');
select throws_ok($$select pg_temp.gw('habit-save','{"p_id":"d2900000-0000-4000-8000-000000000103","p_create":true,"p_mode":"basic","p_input":{"stat":"INT","difficulty":"Easy","time":"08:00","days":[1]}}')$$,'ET001',null,'gateway quest creation denied while paused');
select throws_ok($$update public.habits set name='Denied edit' where id='d2900000-0000-4000-8000-000000000101'$$,'42501',null,'direct quest edit denied');
select throws_ok($$select pg_temp.gw('habit-save','{"p_id":"d2900000-0000-4000-8000-000000000101","p_create":false,"p_mode":"custom","p_input":{"name":"Denied edit","easyVersion":"Read a line","stat":"INT","difficulty":"Medium","time":"08:00","days":[0,1,2,3,4,5,6]}}','[{"kind":"habit","id":"d2900000-0000-4000-8000-000000000101","inputKind":"custom"}]')$$,'ET001',null,'gateway quest edit denied while paused');
select set_config('request.jwt.claim.role','service_role',true);
select throws_ok($$update public.habits set name='Denied role claim edit' where id='d2900000-0000-4000-8000-000000000101'$$,'42501',null,'request claim text cannot bypass the actual authenticated database role');
select set_config('request.jwt.claim.role','authenticated',true);
select throws_ok($$delete from public.habits where id='d2900000-0000-4000-8000-000000000101'$$,'42501',null,'existing direct tracker deletion prohibition retained');
select throws_ok($$select pg_temp.hw('undo_habit_completion','d2900000-0000-4000-8000-000000000101',jsonb_build_object('p_completed_on',(statement_timestamp() at time zone 'Asia/Manila')::date))$$,'ET001',null,'security-definer undo denied');
select throws_ok($$select pg_temp.gw('reorder_quests','{"p_quest_type":"habit","p_ids":["d2900000-0000-4000-8000-000000000101"]}','[{"kind":"habit","id":"d2900000-0000-4000-8000-000000000101","inputKind":"custom"}]')$$,'ET001',null,'bulk reorder denied');
select throws_ok($$select pg_temp.hw('archive_habit','d2900000-0000-4000-8000-000000000101')$$,'ET001',null,'security-definer archive denied');
select throws_ok($$select pg_temp.gw('set_long_quest_stage_done_receipt',jsonb_build_object('p_stage_id','d2900000-0000-4000-8000-000000000202','p_done',true,'p_request_id',gen_random_uuid()),'[{"kind":"chain","id":"d2900000-0000-4000-8000-000000000201","inputKind":"custom"}]')$$,'ET001',null,'security-definer stage completion denied');
select throws_ok($$select pg_temp.gw('start_gym_session','{"p_routine_id":"d2900000-0000-4000-8000-000000000301"}')$$,'ET001',null,'security-definer workout creation denied');
select throws_ok($$select pg_temp.gw('remove_gym_exercise','{"p_id":"d2900000-0000-4000-8000-000000000302"}')$$,'ET001',null,'security-definer workout removal denied');
select throws_ok(format($$insert into storage.objects(bucket_id,name,owner_id) values('gym-exercise-media',%L,'d2900000-0000-4000-8000-000000000001')$$,pg_temp.media_path('d2900002-0000-4000-8000-000000000001.gif')),'42501',null,'paused storage upload metadata denied');
select is((select name from public.habits where id='d2900000-0000-4000-8000-000000000101'),'Retained tracker quest','failed writes preserve quest');
select is((select count(*) from public.habit_completions),1::bigint,'denied undo preserves completion');
select is((select done from public.long_quest_stages where id='d2900000-0000-4000-8000-000000000202'),false,'denied stage preserves progress');
select is((select count(*) from public.gym_sessions),0::bigint,'denied workout leaves no draft');
select is((select count(*) from public.gym_exercises),1::bigint,'denied removal preserves exercise');
select lives_ok($$select public.get_mailbox_status()$$,'mailbox status remains available');
select is(public.set_account_birthday('2000-01-01')->>'trackerWritesPaused','false','trusted adult correction clears age pause without independent review');
select lives_ok($$select pg_temp.gw('habit-save','{"p_id":"d2900000-0000-4000-8000-000000000101","p_create":false,"p_mode":"custom","p_input":{"name":"Corrected owner edit","easyVersion":"Read a line","stat":"INT","difficulty":"Medium","time":"08:00","days":[0,1,2,3,4,5,6]}}','[{"kind":"habit","id":"d2900000-0000-4000-8000-000000000101","inputKind":"custom"}]')$$,'corrected owner can resume writes');

select set_config('request.jwt.claims','{"sub":"d2900000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.get_account_age()->>'trackerWritesPaused','false','legacy unknown keeps tracker access');
select lives_ok($$select pg_temp.gw('habit-save','{"p_id":"d2900000-0000-4000-8000-000000000104","p_create":true,"p_mode":"basic","p_input":{"stat":"INT","difficulty":"Easy","time":"08:00","days":[1]}}')$$,'legacy unknown can still track without mailbox proof');
select set_config('request.jwt.claims','{"sub":"d2900000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.set_account_birthday(((statement_timestamp() at time zone 'Asia/Manila')::date-interval '12 years')::date)->>'trackerWritesPaused','false','exact twelfth birthday permits tracking');
select lives_ok($$select pg_temp.gw('habit-save','{"p_id":"d2900000-0000-4000-8000-000000000105","p_create":true,"p_mode":"basic","p_input":{"stat":"INT","difficulty":"Easy","time":"08:00","days":[1]}}')$$,'age12 tracker remains available');
select is(public.get_account_age()->>'adultDeclared','false','age12 remains AI denied');
reset role;
set local role postgres;
select set_config('request.jwt.claims','{"sub":"d2900000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update private.account_age set birth_date=((statement_timestamp() at time zone 'Asia/Manila')::date-interval '11 years')::date where user_id='d2900000-0000-4000-8000-000000000001';
select lives_ok($$delete from auth.users where id='d2900000-0000-4000-8000-000000000001'$$,'privileged account deletion still cascades even with retained request claims');
select is((select count(*) from public.habits where user_id='d2900000-0000-4000-8000-000000000001'),0::bigint,'authorized account deletion removes owned tracker rows');
select * from finish();
rollback;
