-- Chain stage suggestions under the AI rules (S03b Part J).
-- Before this, only 'weekly-summary' went through the processing-access gate (050/051). Any other action was sent down
-- the older age and mailbox wrappers, which read private.account_age (empty since 066): the admitted request carried no
-- ageVersion, a retry at attempt 2 raised EA001, and a finished result could not be released.
-- 'stage-breakdown' now follows the weekly path: the four access conditions through require_debrief_generation, all four
-- revisions stamped on the request, retries and results re-checked against current access. Quota is unchanged: the 045
-- core already buckets by action, so a stage suggestion counts in its own 'stage-breakdown' bucket (2 a day per person)
-- and never in the weekly-review bucket. 'easy-versions' stays unsupported.
-- Replaced with create or replace, so owners and grants are kept (restated below). Rollback: re-run the four function
-- bodies from 050_processing_access.sql and 051_ai_admission.sql.
begin;

create or replace function private.ai_begin_request_before_admission(p_user_id uuid,p_action text,p_request_id uuid,p_week_start date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb; result jsonb; prior private.ai_logical_requests%rowtype;
begin
 perform private.require_processing_service();
 if p_action is null or p_action not in ('weekly-summary','stage-breakdown') then
  return private.ai_begin_request_before_mailbox(p_user_id,p_action,p_request_id,p_week_start);
 end if;
 perform 1 from auth.users where id=p_user_id for update;
 s:=private.require_debrief_generation(p_user_id);
 select * into prior from private.ai_logical_requests where request_id=p_request_id;
 if found and (prior.user_id is distinct from p_user_id or prior.age_version is distinct from (s->>'ageVersion')::integer
  or prior.mailbox_version is distinct from (s->>'mailboxVersion')::integer
  or prior.consent_version is distinct from (s->>'consentVersion')::integer
  or prior.authority_version is distinct from (s->>'authorityVersion')::integer) then
  raise exception 'Processing access changed. Refresh your choices.' using errcode='EP002';
 end if;
 -- Bypass the retained adult-only wrappers, not the pre-age quota/refund logic.
 result:=private.ai_begin_request_before_age(p_user_id,p_action,p_request_id,p_week_start);
 if result->>'allowed'='true' then
  update private.ai_logical_requests set age_version=(s->>'ageVersion')::integer,
   mailbox_version=(s->>'mailboxVersion')::integer,consent_version=(s->>'consentVersion')::integer,
   authority_version=(s->>'authorityVersion')::integer where request_id=p_request_id;
  result:=result||jsonb_build_object('ageVersion',(s->>'ageVersion')::integer,
   'mailboxVersion',(s->>'mailboxVersion')::integer,'consentVersion',(s->>'consentVersion')::integer,
   'authorityVersion',(s->>'authorityVersion')::integer);
 end if;
 return result;
end;$$;

create or replace function private.ai_reserve_next_attempt_before_admission(p_request_id uuid,p_attempt_number integer) returns boolean
language plpgsql security definer set search_path='' as $$declare action text; uid uuid; begin
 perform private.require_processing_service();
 select r.action into action from private.ai_logical_requests r where request_id=p_request_id;
 if action is null or action not in ('weekly-summary','stage-breakdown') then
  return private.ai_reserve_next_attempt_before_mailbox(p_request_id,p_attempt_number);
 end if;
 if not private.processing_request_current(p_request_id) then
  select user_id into uid from private.ai_logical_requests where request_id=p_request_id;
  perform private.require_debrief_generation(uid);
  raise exception 'Debrief processing permission required.' using errcode='EP001';
 end if;
 return private.ai_reserve_next_attempt_before_age(p_request_id,p_attempt_number);
end;$$;

create or replace function private.ai_check_request_age_before_admission(p_request_id uuid,p_age_version integer) returns boolean
language plpgsql security definer set search_path='' as $$declare action text; begin
 perform private.require_processing_service();
 select r.action into action from private.ai_logical_requests r where request_id=p_request_id;
 if action is null or action not in ('weekly-summary','stage-breakdown') then
  return private.ai_check_request_age_before_mailbox(p_request_id,p_age_version);
 end if;
 if p_age_version is null then return false; end if;
 return private.processing_request_current(p_request_id,p_age_version);
end;$$;

create or replace function public.ai_admit_execution(p_user_id uuid,p_action text,p_request_id uuid,p_week_start date,p_execution_id uuid,p_contract_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.ai_admission_control%rowtype; result jsonb;
begin
 perform private.require_processing_service();
 if p_user_id is null or p_request_id is null or p_execution_id is null
  or p_action is null or p_action not in ('weekly-summary','stage-breakdown')
  or p_contract_version is distinct from 1 then raise exception 'Invalid execution contract.' using errcode='22023'; end if;
 select * into c from private.ai_admission_control where singleton for update;
 if not found or not c.is_open or not private.ai_admission_healthy(c) then
  return jsonb_build_object('allowed',false,'attemptNumber',0,'reason','unavailable');
 end if;
 -- Gate -> owner -> receipt/detail -> original quota locks; no I/O in this transaction.
 perform 1 from auth.users where id=p_user_id for update;
 if not found then raise exception 'Account unavailable.' using errcode='42501'; end if;
 if exists(select 1 from private.ai_execution_details where execution_id=p_execution_id or request_id=p_request_id)
  or exists(select 1 from private.ai_logical_requests where request_id=p_request_id) then
  return jsonb_build_object('allowed',false,'attemptNumber',0,'reason','duplicate');
 end if;
 result:=private.ai_begin_request_before_admission(p_user_id,p_action,p_request_id,p_week_start);
 if result->>'allowed'='true' then
  insert into private.ai_execution_details(execution_id,request_id,epoch,contract_version)
   values(p_execution_id,p_request_id,c.epoch,1);
  update private.ai_execution_epochs set outstanding_count=outstanding_count+1 where epoch=c.epoch;
  result:=result||jsonb_build_object('executionId',p_execution_id,'requestId',p_request_id,'epoch',c.epoch,'contractVersion',1);
 end if;
 return result;
end;$$;

revoke all on function private.ai_begin_request_before_admission(uuid,text,uuid,date),
 private.ai_reserve_next_attempt_before_admission(uuid,integer),private.ai_check_request_age_before_admission(uuid,integer)
 from public,anon,authenticated,service_role;
revoke all on function public.ai_admit_execution(uuid,text,uuid,date,uuid,integer) from public,anon,authenticated;
grant execute on function public.ai_admit_execution(uuid,text,uuid,date,uuid,integer) to service_role;
commit;
