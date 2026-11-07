begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
-- Local S02 Task 3, as changed by 065 (open tracker): withdrawing a custom or fitness permission no longer pauses
-- protected roots, so preparation treats custom roots like basic ones. Read paths never prepare anything; the
-- explicit prepare-day operation filters before effects; Storage uploads bind
-- the owner, routine and current tracker tuple. Synthetic users only.
insert into auth.users(id,email,raw_user_meta_data) values
 ('da230200-0000-4000-8000-000000000001','prep-adult@example.invalid','{"birth_date":"2000-01-01"}'),
 ('da230200-0000-4000-8000-000000000002','prep-other@example.invalid','{"birth_date":"2000-01-01"}');
create temp table snap(label text,habit_id uuid,occ integer,win integer,streak jsonb,pos integer,upd timestamptz);
create temp table stat_snap(label text,stats jsonb);
create temp table kept(k text primary key,v jsonb);
grant all on kept to authenticated;
create function pg_temp.take(p_label text) returns void language sql as $$
 insert into snap select p_label,h.id,
  (select count(*)::integer from public.habit_occurrences o where o.habit_id=h.id),
  (select count(*)::integer from public.habit_recovery_windows w where w.habit_id=h.id),
  (select to_jsonb(s)-'updated_at' from public.streaks s where s.habit_id=h.id),h.position,h.updated_at
 from public.habits h where h.user_id='da230200-0000-4000-8000-000000000001';
 insert into stat_snap select p_label,jsonb_object_agg(stat,xp) from public.stats where user_id='da230200-0000-4000-8000-000000000001';
$$;
create function pg_temp.same(p_a text,p_b text,p_habit uuid) returns boolean language sql as $$
 select (select (occ,win,streak,pos,upd)::text from snap where label=p_a and habit_id=p_habit)
  is not distinct from (select (occ,win,streak,pos,upd)::text from snap where label=p_b and habit_id=p_habit);
$$;
create function pg_temp.occ(p_label text,p_habit uuid) returns integer language sql as $$
 select occ from snap where label=p_label and habit_id=p_habit;
$$;
create function pg_temp.cmd(op text,args jsonb,targets jsonb,rev jsonb) returns jsonb
language sql security invoker set search_path='' as $$
 select public.apply_tracker_write(op,args||jsonb_build_object('p_expected_targets',targets),rev);
$$;
grant execute on function pg_temp.cmd(text,jsonb,jsonb,jsonb) to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','da230200-0000-4000-8000-000000000001',true);
select public.initialize_account_time_zone('UTC');
-- Basic habits H1/H3, protected habit H2 and a fitness routine.
select pg_temp.cmd('habit-save','{"p_id":"da230200-0000-4000-8000-000000000010","p_create":true,"p_mode":"basic","p_input":{"stat":"STR","difficulty":"Easy","time":"08:00","days":[0,1,2,3,4,5,6]}}','[]',public.get_tracker_processing_access()->'revision');
select pg_temp.cmd('habit-save','{"p_id":"da230200-0000-4000-8000-000000000013","p_create":true,"p_mode":"basic","p_input":{"stat":"DEX","difficulty":"Easy","time":"09:00","days":[0,1,2,3,4,5,6]}}','[]',public.get_tracker_processing_access()->'revision');
select public.set_tracker_processing_consent('custom-tracker',true,'2026-10-23-custom-tracker-v1',public.get_tracker_processing_access()->'revision');
select public.set_tracker_processing_consent('fitness-tracking',true,'2026-10-23-fitness-tracking-v1',public.get_tracker_processing_access()->'revision');
select pg_temp.cmd('habit-save','{"p_id":"da230200-0000-4000-8000-000000000011","p_create":true,"p_mode":"custom","p_input":{"name":"Protected quest","easyVersion":"small","stat":"INT","difficulty":"Easy","time":"07:00","days":[0,1,2,3,4,5,6]}}','[]',public.get_tracker_processing_access()->'revision');
select pg_temp.cmd('gym-routine-save','{"p_id":"da230200-0000-4000-8000-000000000030","p_create":true,"p_name":"Synthetic routine","p_unit":"kg"}','[]',public.get_tracker_processing_access()->'revision');
select pg_temp.cmd('chain-save','{"p_id":"da230200-0000-4000-8000-000000000040","p_request_id":"da230200-0000-4000-8000-000000000041","p_create":true,"p_mode":"basic","p_input":{"stat":"WIS","strictOrder":true,"stages":[{"id":"da230200-0000-4000-8000-000000000042"}]}}','[]',public.get_tracker_processing_access()->'revision');
-- Storage while fitness is granted: valid tuple path accepted.
insert into kept values('rev_granted',public.get_tracker_processing_access()->'revision');
select lives_ok($$insert into storage.objects(bucket_id,name) values('gym-exercise-media',
 'da230200-0000-4000-8000-000000000001/da230200-0000-4000-8000-000000000030/'||(select (v->>'ageVersion')||'-'||(v->>'consentVersion')||'-'||(v->>'authorityVersion') from kept where k='rev_granted')||'/da230200-0000-4000-8000-0000000000a1.gif')$$,
 'current tuple path is accepted for the owner routine');
select throws_ok($$insert into storage.objects(bucket_id,name) values('gym-exercise-media',
 'da230200-0000-4000-8000-000000000001/da230200-0000-4000-8000-000000000030/0-0-0/da230200-0000-4000-8000-0000000000a2.gif')$$,'42501',null,'old tuple path is denied');
select throws_ok($$insert into storage.objects(bucket_id,name) values('gym-exercise-media',
 'da230200-0000-4000-8000-000000000001/da230200-0000-4000-8000-000000000030/da230200-0000-4000-8000-0000000000a3.gif')$$,'42501',null,'legacy three-segment upload path is denied');
select throws_ok($$insert into storage.objects(bucket_id,name) values('gym-exercise-media',
 'da230200-0000-4000-8000-000000000002/da230200-0000-4000-8000-000000000030/'||(select (v->>'ageVersion')||'-'||(v->>'consentVersion')||'-'||(v->>'authorityVersion') from kept where k='rev_granted')||'/da230200-0000-4000-8000-0000000000a4.gif')$$,'42501',null,'another owner folder is denied');
select throws_ok($$insert into storage.objects(bucket_id,name) values('gym-exercise-media',
 'da230200-0000-4000-8000-000000000001/da230200-0000-4000-8000-0000000000ff/'||(select (v->>'ageVersion')||'-'||(v->>'consentVersion')||'-'||(v->>'authorityVersion') from kept where k='rev_granted')||'/da230200-0000-4000-8000-0000000000a5.gif')$$,'42501',null,'an unowned routine is denied');
select throws_ok($$insert into storage.objects(bucket_id,name) values('gym-exercise-media',
 'da230200-0000-4000-8000-000000000001/da230200-0000-4000-8000-000000000030/'||(select (v->>'ageVersion')||'-'||(v->>'consentVersion')||'-'||(v->>'authorityVersion') from kept where k='rev_granted')||'/da230200-0000-4000-8000-0000000000a6.png')$$,'42501',null,'unsupported extension is denied');
update storage.objects set name='da230200-0000-4000-8000-000000000001/da230200-0000-4000-8000-000000000030/0-0-0/da230200-0000-4000-8000-0000000000a1.gif' where bucket_id='gym-exercise-media' and name like '%0000000000a1.gif';
select is((select count(*)::integer from storage.objects where bucket_id='gym-exercise-media' and name like '%/0-0-0/%'),0,'update cannot rename onto an old tuple path');
-- Rewind schedules so preparation would have real work, then withdraw both optional purposes.
reset role;
alter table public.habits disable trigger habits_set_schedule_start;
update public.habits set schedule_start_on=current_date-4 where user_id='da230200-0000-4000-8000-000000000001' and quest_type='habit';
alter table public.habits enable trigger habits_set_schedule_start;
update public.habits set position=7 where id='da230200-0000-4000-8000-000000000011';
update public.streaks set last_processed_on=current_date-5 where user_id='da230200-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','da230200-0000-4000-8000-000000000001',true);
select public.set_tracker_processing_consent('custom-tracker',false,'2026-10-23-custom-tracker-v1',public.get_tracker_processing_access()->'revision');
select public.set_tracker_processing_consent('fitness-tracking',false,'2026-10-23-fitness-tracking-v1',public.get_tracker_processing_access()->'revision');
insert into kept values('rev_paused',public.get_tracker_processing_access()->'revision');
select lives_ok($$insert into storage.objects(bucket_id,name) values('gym-exercise-media',
 'da230200-0000-4000-8000-000000000001/da230200-0000-4000-8000-000000000030/'||(select (v->>'ageVersion')||'-'||(v->>'consentVersion')||'-'||(v->>'authorityVersion') from kept where k='rev_paused')||'/da230200-0000-4000-8000-0000000000a7.gif')$$,'open tracker: a withdrawn fitness grant no longer blocks the current tuple path');
reset role;
select pg_temp.take('s0');
set local role authenticated;
select set_config('request.jwt.claim.sub','da230200-0000-4000-8000-000000000001',true);
-- Public reads do not materialize anything.
select lives_ok($$select count(*) from public.get_habits_for_date(current_date)$$,'board read works after both permissions are withdrawn');
select lives_ok($$select count(*) from public.get_open_habit_recoveries()$$,'open-recovery read still works');
select lives_ok($$select public.read_history_range(current_date-7,current_date+1)$$,'history read still works');
reset role;
select pg_temp.take('s1');
select ok(pg_temp.same('s0','s1','da230200-0000-4000-8000-000000000010'),'Board/recovery/history reads leave the basic root unchanged');
select ok(pg_temp.same('s0','s1','da230200-0000-4000-8000-000000000011'),'reads leave the custom root unchanged');
select is((select count(*)::integer from public.habit_occurrences where user_id='da230200-0000-4000-8000-000000000001'),0,'reads fabricate no occurrence');
-- Timezone change keeps account semantics, and prepares the custom root exactly as it does a basic one.
set local role authenticated;
select set_config('request.jwt.claim.sub','da230200-0000-4000-8000-000000000001',true);
select lives_ok($$select public.set_account_time_zone('Etc/UTC')$$,'timezone change still works');
select is((select time_zone from public.profiles where user_id=auth.uid()),'Etc/UTC','timezone semantics preserved');
reset role;
select pg_temp.take('s2');
select is(pg_temp.occ('s2','da230200-0000-4000-8000-000000000011'),pg_temp.occ('s2','da230200-0000-4000-8000-000000000010'),'timezone change treats the custom root like the basic one');
-- prepare-day prepares custom roots too: nothing is paused any more.
set local role authenticated;
select set_config('request.jwt.claim.sub','da230200-0000-4000-8000-000000000001',true);
select is(pg_temp.cmd('prepare-day','{}','[]',(select v from kept where k='rev_paused')),
 '{"basicPrepared":true,"protectedPrepared":true,"accessChanged":false}'::jsonb,'matching revision reports the actual preparation');
reset role;
select pg_temp.take('s3');
select ok(pg_temp.occ('s3','da230200-0000-4000-8000-000000000010')>0,'basic root is prepared');
select ok((select win from snap where label='s3' and habit_id='da230200-0000-4000-8000-000000000010')>0,'basic missed day opens its recovery window');
select ok(pg_temp.occ('s3','da230200-0000-4000-8000-000000000011')>0,'open tracker: the custom root is prepared');
select is(pg_temp.occ('s3','da230200-0000-4000-8000-000000000011'),pg_temp.occ('s3','da230200-0000-4000-8000-000000000010'),'the custom root gets as many occurrences as the basic root');
select ok((select win from snap where label='s3' and habit_id='da230200-0000-4000-8000-000000000011')>0,'a missed day on the custom root opens its recovery window like a basic one');
select is((select count(*)::integer from public.weekly_quests where user_id='da230200-0000-4000-8000-000000000001'),1,'weekly quest is created: protected aggregates need no permission');
-- Basic progress works and moves only its own stat.
set local role authenticated;
select set_config('request.jwt.claim.sub','da230200-0000-4000-8000-000000000001',true);
select lives_ok($$select pg_temp.cmd('complete_habit',jsonb_build_object('p_habit_id','da230200-0000-4000-8000-000000000010','p_completed_on',current_date,'p_kind','full'),
 '[{"kind":"habit","id":"da230200-0000-4000-8000-000000000010","inputKind":"basic"}]',public.get_tracker_processing_access()->'revision')$$,'basic completion succeeds after both permissions are withdrawn');
reset role;
select pg_temp.take('s4');
select is((select stats->>'STR' from stat_snap where label='s4')::integer,(select stats->>'STR' from stat_snap where label='s3')::integer+20,'basic completion applies its target-owned XP');
select is((select stats->>'INT' from stat_snap where label='s4'),(select stats->>'INT' from stat_snap where label='s3'),'unrelated stat total is not recomputed');
select ok(pg_temp.same('s3','s4','da230200-0000-4000-8000-000000000011'),'basic completion does not touch the custom root');
-- Bulk reorder with an omitted paused sibling.
set local role authenticated;
select set_config('request.jwt.claim.sub','da230200-0000-4000-8000-000000000001',true);
select lives_ok($$select pg_temp.cmd('reorder_quests','{"p_quest_type":"habit","p_ids":["da230200-0000-4000-8000-000000000013","da230200-0000-4000-8000-000000000010"]}',
 '[{"kind":"habit","id":"da230200-0000-4000-8000-000000000010","inputKind":"basic"},{"kind":"habit","id":"da230200-0000-4000-8000-000000000013","inputKind":"basic"}]',public.get_tracker_processing_access()->'revision')$$,'basic-only reorder succeeds');
reset role;
select pg_temp.take('s5');
select is((select pos from snap where label='s5' and habit_id='da230200-0000-4000-8000-000000000011'),2,'open tracker: an omitted custom sibling is renumbered after the requested order, like a basic one');
select ok((select pos from snap where label='s5' and habit_id='da230200-0000-4000-8000-000000000011')>(select pos from snap where label='s5' and habit_id='da230200-0000-4000-8000-000000000010'),'and it follows the requested ones');
select ok((select pos from snap where label='s5' and habit_id='da230200-0000-4000-8000-000000000013')<(select pos from snap where label='s5' and habit_id='da230200-0000-4000-8000-000000000010'),'requested permitted order applied');
-- Stale optional revision: basic prepares, protected does not, accessChanged reports it.
set local role authenticated;
select set_config('request.jwt.claim.sub','da230200-0000-4000-8000-000000000001',true);
select public.set_tracker_processing_consent('custom-tracker',true,'2026-10-23-custom-tracker-v1',public.get_tracker_processing_access()->'revision');
select is(pg_temp.cmd('prepare-day','{}','[]',(select v from kept where k='rev_paused')),
 '{"basicPrepared":true,"protectedPrepared":false,"accessChanged":true}'::jsonb,'stale optional revision prepares only still-basic roots');
reset role;
select pg_temp.take('s6');
select is(pg_temp.occ('s6','da230200-0000-4000-8000-000000000011'),pg_temp.occ('s3','da230200-0000-4000-8000-000000000011'),'a stale revision prepares nothing more for the custom root');
set local role authenticated;
select set_config('request.jwt.claim.sub','da230200-0000-4000-8000-000000000001',true);
select is(pg_temp.cmd('prepare-day','{}','[]',public.get_tracker_processing_access()->'revision'),
 '{"basicPrepared":true,"protectedPrepared":true,"accessChanged":false}'::jsonb,'current revision prepares permitted protected roots');
reset role;
select pg_temp.take('s7');
select ok(pg_temp.occ('s7','da230200-0000-4000-8000-000000000011')>0,'permitted protected root is prepared with its history intact');
select is((select count(*)::integer from public.weekly_quests where user_id='da230200-0000-4000-8000-000000000001'),1,'weekly quest is created once its dependencies are permitted');
select is((select target_count from public.weekly_quests where user_id='da230200-0000-4000-8000-000000000001'),5,'weekly target semantics are unchanged');
set local role authenticated;
select set_config('request.jwt.claim.sub','da230200-0000-4000-8000-000000000001',true);
select throws_ok($$select public.apply_tracker_write('prepare-day','{"p_expected_targets":[]}',jsonb_set(public.get_tracker_processing_access()->'revision','{ageVersion}',to_jsonb(999)))$$,'ET003',null,'stale age revision refuses preparation');
select throws_ok($$select public.apply_tracker_write('prepare-day','{"today":"2026-01-01","p_expected_targets":[]}',public.get_tracker_processing_access()->'revision')$$,'22023',null,'caller date override refuses');
-- Explicit-owner history snapshot.
reset role;
insert into public.habits(id,user_id,name,easy_version,stat) values('da230200-0000-4000-8000-000000000020','da230200-0000-4000-8000-000000000002','Other owner habit','small','CHA');
insert into public.deleted_habit_history(source_habit_id,user_id,historical_date,habit_name,stat,quest_type,scheduled,completion_kind)
 values('da230200-0000-4000-8000-000000000021','da230200-0000-4000-8000-000000000002',current_date,'Other deleted','CHA','habit',true,'full');
set local role authenticated;
select set_config('request.jwt.claim.sub','da230200-0000-4000-8000-000000000001',true);
insert into kept values('public_snapshot',public.read_history_range(current_date-7,current_date+1));
reset role;
select is(private.tracker_history_snapshot('da230200-0000-4000-8000-000000000001',current_date-7,current_date+1),(select v from kept where k='public_snapshot'),'public wrapper preserves the snapshot keys and normalization');
select ok(not (private.tracker_history_snapshot('da230200-0000-4000-8000-000000000001',current_date-7,current_date+1)::text like '%Other%'),'owner snapshot has no cross-owner rows or joins');
select ok(private.tracker_history_snapshot('da230200-0000-4000-8000-000000000002',current_date-7,current_date+1)::text like '%Other deleted%','explicit owner works without an authenticated subject');
select ok(not (private.tracker_history_snapshot('da230200-0000-4000-8000-000000000002',current_date-7,current_date+1)::text like '%Protected quest%'),'explicit owner snapshot excludes other owners habits');
select ok(not has_function_privilege('authenticated','private.tracker_history_snapshot(uuid,date,date)','execute'),'private snapshot is not callable by clients');
select ok(not has_function_privilege('service_role','private.tracker_history_snapshot(uuid,date,date)','execute'),'private snapshot is not directly callable by service role');
-- Old existing objects stay readable.
insert into storage.objects(bucket_id,name) values('gym-exercise-media','da230200-0000-4000-8000-000000000001/da230200-0000-4000-8000-000000000030/da230200-0000-4000-8000-0000000000b1.gif');
set local role authenticated;
select set_config('request.jwt.claim.sub','da230200-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from storage.objects where bucket_id='gym-exercise-media' and name like '%0000000000b1.gif'),1,'legacy-path objects remain readable by their owner');
reset role;
select * from finish();
rollback;
