-- S02 local/unreleased. Read-only export; no deletion, provider call or activation.
begin;

-- Exact metadata-only manifest; changes require projection review.
create function private.owner_export_manifest() returns jsonb
language sql immutable set search_path='' as $$select '{"tables":[{"table":"private.account_age","export":["user_id","birth_date","pending_birth_date","version"],"exclude":[],"scope":"owner"},{"table":"private.ai_logical_requests","export":["request_id","user_id","action","request_class","account_date","week_start","attempt_count","created_at","refunded_at","age_version","mailbox_version","consent_version","authority_version"],"exclude":[],"scope":"owner"},{"table":"private.ai_pending_weekly_regenerations","export":["user_id","week_start","account_date","created_at","expires_at","consumed_at","request_id"],"exclude":["reservation_id"],"scope":"owner"},{"table":"private.ai_user_daily_usage","export":["user_id","usage_date","action","request_count"],"exclude":[],"scope":"owner"},{"table":"private.long_quest_definition_receipts","export":["user_id","request_id","quest_id"],"exclude":["input"],"scope":"owner"},{"table":"private.long_quest_reward_receipts","export":["user_id","request_id","stage_id","done"],"exclude":["receipt"],"scope":"owner"},{"table":"private.mailbox_state","export":["user_id","version","verified_version","verified_at"],"exclude":["challenge_id","challenge_version","challenge_expires_at","challenge_ready","challenge_attempted","last_sent_at","window_started_at","sends","attempts"],"scope":"owner"},{"table":"private.processing_authority","export":["user_id","state","purposes","age_version","version","changed_at"],"exclude":["review_reference"],"scope":"owner"},{"table":"private.processing_authority_events","export":["id","user_id","state","purposes","age_version","version","changed_at"],"exclude":["review_reference"],"scope":"owner"},{"table":"private.processing_consent","export":["user_id","age_granted","age_notice","ai_granted","ai_notice","version","changed_at"],"exclude":[],"scope":"owner"},{"table":"private.processing_consent_events","export":["id","user_id","purpose","granted","notice_version","version","changed_at"],"exclude":[],"scope":"owner"},{"table":"public.deleted_habit_history","export":["id","user_id","source_habit_id","historical_date","habit_name","stat","quest_type","scheduled","completion_kind","xp_awarded","time_zone","day_ends_at","created_at"],"exclude":[],"scope":"owner"},{"table":"public.gym_entries","export":["id","session_id","user_id","exercise_id","position","prescription","weight"],"exclude":[],"scope":"owner"},{"table":"public.gym_exercises","export":["id","routine_id","user_id","name","position","sets","reps","rest_seconds","rir","notes","media_path","media_mime","rir_max"],"exclude":[],"scope":"owner"},{"table":"public.gym_media_cleanup","export":["user_id","path","created_at"],"exclude":[],"scope":"owner"},{"table":"public.gym_routines","export":["id","user_id","name","unit","archived","created_at","deleted_at"],"exclude":[],"scope":"owner"},{"table":"public.gym_sessions","export":["id","routine_id","user_id","routine_name","unit","status","created_at","completed_at"],"exclude":[],"scope":"owner"},{"table":"public.habit_archive_intervals","export":["id","habit_id","user_id","archived_from","restored_on","created_at"],"exclude":[],"scope":"owner"},{"table":"public.habit_completions","export":["id","user_id","habit_id","completed_on","kind","xp_awarded","created_at"],"exclude":[],"scope":"owner"},{"table":"public.habit_occurrences","export":["habit_id","user_id","occurrence_date","created_at","time_zone","day_ends_at"],"exclude":[],"scope":"owner"},{"table":"public.habit_progress","export":["id","user_id","habit_id","progress_date","progress_count"],"exclude":[],"scope":"owner"},{"table":"public.habit_recovery_windows","export":["id","habit_id","user_id","missed_on","preserved_streak","opened_at","deadline_at","status","resolved_at","created_at"],"exclude":[],"scope":"owner"},{"table":"public.habit_schedule_versions","export":["habit_id","user_id","effective_from","days","created_at"],"exclude":[],"scope":"owner"},{"table":"public.habits","export":["id","user_id","name","easy_version","stat","difficulty","reminder_time","days","archived","created_at","updated_at","quest_type","description","scheduled_date","target_count","schedule_start_on","genre","time_set","position"],"exclude":[],"scope":"owner"},{"table":"public.long_quest_rewards","export":["user_id","quest_id","reward_key","kind","stat","amount","active","legacy_exempt"],"exclude":[],"scope":"owner"},{"table":"public.long_quest_stages","export":["id","long_quest_id","user_id","name","position","done","description"],"exclude":[],"scope":"owner"},{"table":"public.long_quests","export":["id","user_id","name","stat","deadline","created_at","description","completed_at","strict_order","position"],"exclude":[],"scope":"owner"},{"table":"public.profiles","export":["user_id","display_name","user_class","target_role","theme","created_at","updated_at","time_zone","time_zone_changed_at","palette"],"exclude":[],"scope":"owner"},{"table":"public.stats","export":["user_id","stat","xp","updated_at"],"exclude":[],"scope":"owner"},{"table":"public.streaks","export":["habit_id","user_id","best","updated_at","current_streak","recovery_armed","last_processed_on","active_recovery_id"],"exclude":[],"scope":"owner"},{"table":"public.weekly_quests","export":["id","user_id","week_start","stat","target_count","current_count","created_at"],"exclude":[],"scope":"owner"},{"table":"public.weekly_summaries","export":["id","user_id","week_start","summary","created_at","regenerate_count","last_regenerated_date","age_version","mailbox_version","consent_version","authority_version"],"exclude":[],"scope":"owner"},{"table":"private.ai_provider_attempts","export":["request_id","attempt_number","usage_date","created_at"],"exclude":[],"scope":"indirect"},{"table":"private.ai_execution_details","export":["request_id","contract_version","state","created_at","settled_at"],"exclude":["execution_id","epoch","authorized_attempt_mask"],"scope":"indirect"},{"table":"private.ai_admission_control","export":[],"exclude":["singleton","is_open","epoch","updated_at","last_pruned_at"],"scope":"global"},{"table":"private.ai_execution_epochs","export":[],"exclude":["epoch","opened_at","closed_at","outstanding_count","uncertain_count"],"scope":"global"},{"table":"private.ai_provider_daily_usage","export":[],"exclude":["usage_date","attempt_count"],"scope":"global"},{"table":"private.ai_provider_exhaustion","export":[],"exclude":["provider","exhausted_until","updated_at"],"scope":"global"},{"table":"private.ai_quota_config","export":[],"exclude":["singleton","max_provider_attempts","max_user_requests_per_action"],"scope":"global"},{"table":"private.backlog_rollover_settings","export":[],"exclude":["singleton","cutover"],"scope":"global"}],"foreignKeys":[{"source":"private.account_age","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"private.ai_execution_details","definition":"FOREIGN KEY (epoch) REFERENCES private.ai_execution_epochs(epoch)"},{"source":"private.ai_logical_requests","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"private.ai_pending_weekly_regenerations","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"private.ai_provider_attempts","definition":"FOREIGN KEY (request_id) REFERENCES private.ai_logical_requests(request_id) ON DELETE CASCADE"},{"source":"private.ai_user_daily_usage","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"private.long_quest_definition_receipts","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"private.long_quest_reward_receipts","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"private.mailbox_state","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"private.processing_authority","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"private.processing_authority_events","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"private.processing_consent","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"private.processing_consent_events","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.deleted_habit_history","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.gym_entries","definition":"FOREIGN KEY (session_id, user_id) REFERENCES public.gym_sessions(id, user_id) ON DELETE CASCADE"},{"source":"public.gym_entries","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.gym_exercises","definition":"FOREIGN KEY (routine_id, user_id) REFERENCES public.gym_routines(id, user_id)"},{"source":"public.gym_exercises","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.gym_media_cleanup","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.gym_routines","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.gym_sessions","definition":"FOREIGN KEY (routine_id, user_id) REFERENCES public.gym_routines(id, user_id)"},{"source":"public.gym_sessions","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.habit_archive_intervals","definition":"FOREIGN KEY (habit_id) REFERENCES public.habits(id) ON DELETE CASCADE"},{"source":"public.habit_archive_intervals","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.habit_completions","definition":"FOREIGN KEY (habit_id) REFERENCES public.habits(id) ON DELETE CASCADE"},{"source":"public.habit_completions","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.habit_occurrences","definition":"FOREIGN KEY (habit_id) REFERENCES public.habits(id) ON DELETE CASCADE"},{"source":"public.habit_occurrences","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.habit_progress","definition":"FOREIGN KEY (habit_id) REFERENCES public.habits(id) ON DELETE CASCADE"},{"source":"public.habit_progress","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.habit_recovery_windows","definition":"FOREIGN KEY (habit_id, missed_on) REFERENCES public.habit_occurrences(habit_id, occurrence_date) ON DELETE CASCADE"},{"source":"public.habit_recovery_windows","definition":"FOREIGN KEY (habit_id) REFERENCES public.habits(id) ON DELETE CASCADE"},{"source":"public.habit_recovery_windows","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.habit_schedule_versions","definition":"FOREIGN KEY (habit_id) REFERENCES public.habits(id) ON DELETE CASCADE"},{"source":"public.habit_schedule_versions","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.habits","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.long_quest_rewards","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.long_quest_stages","definition":"FOREIGN KEY (long_quest_id, user_id) REFERENCES public.long_quests(id, user_id) ON DELETE CASCADE"},{"source":"public.long_quest_stages","definition":"FOREIGN KEY (long_quest_id) REFERENCES public.long_quests(id) ON DELETE CASCADE"},{"source":"public.long_quest_stages","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.long_quests","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.profiles","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.stats","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.streaks","definition":"FOREIGN KEY (active_recovery_id) REFERENCES public.habit_recovery_windows(id) ON DELETE SET NULL"},{"source":"public.streaks","definition":"FOREIGN KEY (habit_id) REFERENCES public.habits(id) ON DELETE CASCADE"},{"source":"public.streaks","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.weekly_quests","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},{"source":"public.weekly_summaries","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"}]}'::jsonb;$$;

create function private.require_owner_export_service() returns void
language plpgsql stable set search_path='' as $$begin
 if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
  nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') is distinct from 'service_role'
 then raise exception 'Trusted export service required.' using errcode='42501'; end if;
end;$$;

create function private.owner_export_version(p_user_id uuid,p_session_id uuid) returns integer
language plpgsql stable set search_path='' as $$declare v integer;begin
 if p_user_id is null or p_session_id is null or not exists(
  select 1 from auth.sessions s join auth.users u on u.id=s.user_id
  where s.id=p_session_id and s.user_id=p_user_id and (s.not_after is null or s.not_after>statement_timestamp()))
 then raise exception 'Current account session required.' using errcode='EX001'; end if;
 select version into v from private.mailbox_state
  where user_id=p_user_id and verified_version=version and verified_at is not null;
 if not found then raise exception 'Current mailbox verification required.' using errcode='EX002'; end if;
 return v;
end;$$;

create function public.owner_export_check(p_user_id uuid,p_session_id uuid,p_mailbox_version integer)
returns boolean language plpgsql stable security definer set search_path='' as $$begin
 perform private.require_owner_export_service();
 begin return coalesce(private.owner_export_version(p_user_id,p_session_id)=p_mailbox_version,false);
 exception when sqlstate 'EX001' or sqlstate 'EX002' then return false; end;
end;$$;

create function public.owner_export_snapshot(p_user_id uuid,p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 manifest jsonb:=private.owner_export_manifest(); spec jsonb; fields text[]; actual text[];
 expected_tables text[]; actual_tables text[]; actual_foreign_keys jsonb; schema_name text; table_name text;
 col text; expr text; source_sql text; row_sql text; value_expr text;
 n bigint; bytes bigint; total_rows bigint:=1; total_bytes bigint:=0;
 sections jsonb:='{}'::jsonb; rows jsonb; doc jsonb; account jsonb; meta jsonb; age_meta jsonb; consent_meta jsonb;
 u record; version integer;
begin
 perform private.require_owner_export_service();
 version:=private.owner_export_version(p_user_id,p_session_id);
 select id,email,created_at,raw_user_meta_data into u from auth.users where id=p_user_id;
 meta:=coalesce(u.raw_user_meta_data,'{}'::jsonb);
 if jsonb_typeof(meta)<>'object' or exists(select 1 from jsonb_object_keys(meta) k
  where k<>all(array['display_name','time_zone','birth_date','processing_consent','email','email_verified','phone_verified','sub']))
 then raise exception 'Account metadata needs assisted review.' using errcode='EX003'; end if;
 foreach col in array array['display_name','time_zone','birth_date'] loop
  if meta ? col and jsonb_typeof(meta->col) not in('string','null') then
   raise exception 'Account metadata needs assisted review.' using errcode='EX003'; end if;
 end loop;
 consent_meta:=coalesce(nullif(meta->'processing_consent','null'::jsonb),'{}');
 if jsonb_typeof(consent_meta)<>'object' or exists(select 1 from jsonb_object_keys(consent_meta) k where k<>'age_screening')
 then raise exception 'Account metadata needs assisted review.' using errcode='EX003'; end if;
 age_meta:=coalesce(nullif(consent_meta->'age_screening','null'::jsonb),'{}');
 if jsonb_typeof(age_meta)<>'object' or exists(select 1 from jsonb_object_keys(age_meta) k where k<>all(array['granted','notice_version']))
  or (age_meta ? 'granted' and jsonb_typeof(age_meta->'granted') not in('boolean','null'))
  or (age_meta ? 'notice_version' and jsonb_typeof(age_meta->'notice_version') not in('string','null'))
 then raise exception 'Account metadata needs assisted review.' using errcode='EX003'; end if;

 select array_agg(x->>'table' order by x->>'table') into expected_tables from jsonb_array_elements(manifest->'tables') x;
 select array_agg(n.nspname||'.'||c.relname order by n.nspname||'.'||c.relname) into actual_tables
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private') and c.relkind in('r','p');
 if actual_tables is distinct from expected_tables then raise exception 'Export schema needs review.' using errcode='EX003'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('source',sn.nspname||'.'||s.relname,
  'definition',pg_get_constraintdef(con.oid)) order by sn.nspname||'.'||s.relname,pg_get_constraintdef(con.oid)),'[]'::jsonb)
  into actual_foreign_keys from pg_constraint con join pg_class s on s.oid=con.conrelid
  join pg_namespace sn on sn.oid=s.relnamespace where con.contype='f' and sn.nspname in('public','private');
 if actual_foreign_keys is distinct from manifest->'foreignKeys' then
  raise exception 'Export dependencies need review.' using errcode='EX003'; end if;
 for spec in select * from jsonb_array_elements(manifest->'tables') loop
  schema_name:=split_part(spec->>'table','.',1);table_name:=split_part(spec->>'table','.',2);
  select array_agg(v order by v) into fields from jsonb_array_elements_text((spec->'export')||(spec->'exclude')) v;
  select array_agg(a.attname::text order by a.attname::text) into actual
   from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
   where n.nspname=schema_name and c.relname=table_name and a.attnum>0 and not a.attisdropped;
  if actual is distinct from fields then raise exception 'Export columns need review.' using errcode='EX003'; end if;
 end loop;
 if exists(select 1 from storage.objects o where o.owner_id=p_user_id::text
   or (o.bucket_id='gym-exercise-media' and split_part(o.name,'/',1)=p_user_id::text))
  or exists(select 1 from public.gym_media_cleanup where user_id=p_user_id)
  or exists(select 1 from public.gym_exercises where user_id=p_user_id and media_path is not null)
 then raise exception 'Media export requires assisted handling.' using errcode='EX005'; end if;

 account:=jsonb_build_object('email',u.email,'createdAt',u.created_at,'signup',jsonb_build_object(
  'displayName',meta->'display_name','timeZone',meta->'time_zone','birthDate',meta->'birth_date',
  'ageScreening',jsonb_build_object('granted',age_meta->'granted','noticeVersion',age_meta->'notice_version')));
 total_bytes:=octet_length(account::text);
 for spec in select * from jsonb_array_elements(manifest->'tables') loop
  if spec->>'scope'='global' then continue;end if;
  schema_name:=split_part(spec->>'table','.',1);table_name:=split_part(spec->>'table','.',2);expr:='';
  for col in select * from jsonb_array_elements_text(spec->'export') loop
   value_expr:=format('r.%I',col);
   if exists(select 1 from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname=schema_name and c.relname=table_name and a.attname=col and a.atttypid='int8'::regtype)
   then value_expr:=value_expr||'::text';end if;
   expr:=expr||case when expr='' then '' else ',' end||format('%L,%s',col,value_expr);
  end loop;
  source_sql:=format('%I.%I r',schema_name,table_name);
  if spec->>'scope'='indirect' then
   source_sql:=source_sql||' join private.ai_logical_requests q on q.request_id=r.request_id where q.user_id=$1';
  else source_sql:=source_sql||' where r.user_id=$1';end if;
  row_sql:='select jsonb_build_object('||expr||') projected from '||source_sql||' limit 10001';
  execute 'select count(*),coalesce(sum(octet_length(projected::text)),0) from ('||row_sql||') bounded'
   into n,bytes using p_user_id;
  total_rows:=total_rows+n;total_bytes:=total_bytes+bytes;
  if total_rows>10000 or total_bytes>5242880 then raise exception 'Export exceeds automatic delivery limits.' using errcode='EX004';end if;
  execute 'select coalesce(jsonb_agg(projected order by projected::text),''[]''::jsonb) from ('||row_sql||') bounded'
   into rows using p_user_id;
  sections:=sections||jsonb_build_object(spec->>'table',rows);
 end loop;
 doc:=jsonb_build_object('schemaVersion',1,'generatedAt',statement_timestamp(),'accountId',p_user_id,
  'account',account,'mailboxVersion',version,'sections',sections,'omissions',jsonb_build_array(
  'Authentication secrets, live verification and administrative references are excluded.',
  'Redundant internal replay payloads and account-unlinked project counters are excluded.',
  'This is an account-data export, not an administrator backup or deletion confirmation.'));
 if octet_length(doc::text)>5242880 then raise exception 'Export exceeds automatic delivery limits.' using errcode='EX004';end if;
 return doc;
end;$$;

revoke all on function private.require_owner_export_service(),private.owner_export_version(uuid,uuid),private.owner_export_manifest()
 from public,anon,authenticated,service_role;
revoke all on function public.owner_export_snapshot(uuid,uuid),public.owner_export_check(uuid,uuid,integer)
 from public,anon,authenticated;
grant execute on function public.owner_export_snapshot(uuid,uuid),public.owner_export_check(uuid,uuid,integer) to service_role;
alter function private.require_owner_export_service() owner to postgres;
alter function private.owner_export_version(uuid,uuid) owner to postgres;
alter function private.owner_export_manifest() owner to postgres;
alter function public.owner_export_snapshot(uuid,uuid) owner to postgres;
alter function public.owner_export_check(uuid,uuid,integer) owner to postgres;
commit;
