-- Local S02 only. Follows 061. Fixes from the admin console and retention review (2026-11-03):
-- a review binds to the declaration it was asked under, one failing account cannot stop the
-- retention job, removal is never earlier than 30 full days, a missed reminder is sent before
-- any removal, and an operator can lift a pause without the SQL editor.
begin;

-- A request belongs to the age revision it was made under.
alter table private.authority_review_requests add column age_version integer;
update private.authority_review_requests r set age_version=coalesce((select a.version from private.account_age a where a.user_id=r.user_id),0);
alter table private.authority_review_requests alter column age_version set not null;

create or replace function public.request_authority_review(p_purpose text,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); n text; rid uuid; current_age integer;
begin
 if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_purpose is null or p_purpose not in ('custom-tracker','fitness-tracking','weekly-debrief') then
  raise exception 'Choose a valid purpose.' using errcode='22023';
 end if;
 n:=nullif(btrim(p_note,E' \t\r\n'),'');
 if n is not null and length(n)>280 then raise exception 'Keep the note under 280 characters.' using errcode='22023'; end if;
 perform 1 from auth.users where id=uid for update;
 if not found then raise exception 'authentication required' using errcode='42501'; end if;
 if private.review_purpose_state(uid,p_purpose) is distinct from 'pending' then
  raise exception 'No review is needed for this purpose.' using errcode='ER003';
 end if;
 select coalesce((select version from private.account_age where user_id=uid),0) into current_age;
 -- A request from before a birthday correction can no longer be approved, so it never blocks asking again.
 update private.authority_review_requests set status='withdrawn',decided_at=statement_timestamp()
  where user_id=uid and purpose=p_purpose and status='open' and age_version<>current_age;
 if exists(select 1 from private.authority_review_requests where user_id=uid and purpose=p_purpose and status='open') then
  raise exception 'A review request is already open.' using errcode='ER002';
 end if;
 if (select count(*) from private.authority_review_requests where user_id=uid
  and created_at>statement_timestamp()-interval '1 day')>=3 then
  raise exception 'Too many review requests today. Try again tomorrow.' using errcode='ER001';
 end if;
 insert into private.authority_review_requests(user_id,purpose,note,age_version) values(uid,p_purpose,n,current_age) returning id into rid;
 return jsonb_build_object('requestId',rid,'purpose',p_purpose,'status','open');
end;$$;

create or replace function public.operator_decide_review(p_request_id uuid,p_decision text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op uuid:=private.require_operator(); r private.authority_review_requests%rowtype; st text; new_status text;
begin
 if p_decision is null or p_decision not in ('approved','denied') then
  raise exception 'Choose approved or denied.' using errcode='22023';
 end if;
 select * into r from private.authority_review_requests where id=p_request_id for update;
 if not found or r.status<>'open' then raise exception 'Request is not open.' using errcode='ER004'; end if;
 perform 1 from auth.users where id=r.user_id for update;
 st:=private.review_purpose_state(r.user_id,r.purpose);
 if p_decision='approved' then
  -- An approval never overrides a pause or a settled state, and never covers a declaration the reviewer did not see.
  if st is distinct from 'pending' or r.age_version is distinct from coalesce((select version from private.account_age where user_id=r.user_id),0) then
   raise exception 'This request no longer applies.' using errcode='ER003';
  end if;
  perform private.record_review_decision(r.user_id,r.purpose,'approved',r.id);
 elsif st='pending' then
  -- A denial leaves the purpose pending (the teen may ask again). Other states are left alone.
  perform private.record_review_decision(r.user_id,r.purpose,'pending',r.id);
 end if;
 new_status:=p_decision;
 update private.authority_review_requests set status=new_status,decided_at=statement_timestamp(),decided_by=op where id=r.id;
 perform private.write_operator_audit(op,'decide-'||p_decision,r.user_id,r.purpose,null);
 return jsonb_build_object('requestId',r.id,'status',new_status);
end;$$;

-- Names one account by id or email. Unknown and ambiguous both refuse generically.
create function private.operator_target(p_user_id uuid,p_email text) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare target uuid; e text:=lower(btrim(p_email,E' \t\r\n'));
begin
 if p_email is not null then
  if (select count(*) from auth.users u where lower(u.email)=e)<>1 then
   raise exception 'Account unavailable.' using errcode='42501';
  end if;
  select u.id into target from auth.users u where lower(u.email)=e;
 else
  target:=p_user_id;
 end if;
 return target;
end;$$;
revoke all on function private.operator_target(uuid,text) from public,anon,authenticated,service_role;

create or replace function public.operator_pause_purpose(p_user_id uuid,p_purpose text,p_reason_code text,p_email text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op uuid:=private.require_operator(); target uuid;
begin
 -- Exactly one of account id or email names the account.
 if p_purpose is null or p_purpose not in ('custom-tracker','fitness-tracking','weekly-debrief')
  or p_reason_code is null or p_reason_code not in ('dispute','report','other')
  or (p_user_id is null) = (p_email is null) then
  raise exception 'Invalid pause.' using errcode='22023';
 end if;
 target:=private.operator_target(p_user_id,p_email);
 perform 1 from auth.users where id=target for update;
 if not found then raise exception 'Account unavailable.' using errcode='42501'; end if;
 -- History stays: this appends a revoked decision; nothing is deleted.
 perform private.record_review_decision(target,p_purpose,'revoked',gen_random_uuid());
 perform private.write_operator_audit(op,'pause-purpose',target,p_purpose,p_reason_code);
 return jsonb_build_object('purpose',p_purpose,'state','revoked');
end;$$;

-- Lifts a pause. Never grants: a teen returns to pending and still needs a review.
create function public.operator_resume_purpose(p_user_id uuid,p_purpose text,p_email text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op uuid:=private.require_operator(); target uuid; next_state text;
begin
 if p_purpose is null or p_purpose not in ('custom-tracker','fitness-tracking','weekly-debrief')
  or (p_user_id is null) = (p_email is null) then
  raise exception 'Invalid resume.' using errcode='22023';
 end if;
 target:=private.operator_target(p_user_id,p_email);
 perform 1 from auth.users where id=target for update;
 if not found then raise exception 'Account unavailable.' using errcode='42501'; end if;
 if private.review_purpose_state(target,p_purpose) is distinct from 'revoked' then
  raise exception 'This purpose is not paused.' using errcode='ER003';
 end if;
 next_state:=case when private.adult_declared(target) then 'not-required' else 'pending' end;
 perform private.record_review_decision(target,p_purpose,next_state,gen_random_uuid());
 perform private.write_operator_audit(op,'resume-purpose',target,p_purpose,null);
 return jsonb_build_object('purpose',p_purpose,'state',next_state);
end;$$;
revoke all on function public.operator_resume_purpose(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.operator_resume_purpose(uuid,text,text) to authenticated;

-- Retention: the job runs early in the day, so a date-only "+30" could remove about 29 days after a
-- late-night withdrawal. Counting from the next day guarantees 30 full days before removal.
alter table private.tracker_retention_state add column last_failed_at timestamptz;
update private.tracker_retention_state set reminder_due_on=reminder_due_on+1,removal_due_on=removal_due_on+1 where removed_at is null;

create or replace function private.track_tracker_retention() returns trigger
language plpgsql security definer set search_path='' as $$
declare was_granted boolean; d date;
begin
 if new.purpose not in ('custom-tracker','fitness-tracking') then return null; end if;
 if new.granted then
  -- A regrant before removal cancels it. A completed removal row stays as a record.
  delete from private.tracker_retention_state where user_id=new.user_id and purpose=new.purpose and removed_at is null;
  return null;
 end if;
 select e.granted into was_granted from private.processing_consent_events e
  where e.user_id=new.user_id and e.purpose=new.purpose and e.version<new.version order by e.version desc limit 1;
 if was_granted is true then
  d:=(new.changed_at at time zone 'Asia/Manila')::date;
  insert into private.tracker_retention_state(user_id,purpose,withdrawn_at,reminder_due_on,removal_due_on)
   values(new.user_id,new.purpose,new.changed_at,d+24,d+31)
   on conflict(user_id,purpose) do update set withdrawn_at=excluded.withdrawn_at,reminder_due_on=excluded.reminder_due_on,
    removal_due_on=excluded.removal_due_on,reminded_at=null,removed_at=null,last_failed_at=null;
 end if;
 return null;
end;$$;

create or replace function private.run_tracker_retention(p_now timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare today date; r record; s private.tracker_retention_state%rowtype; c private.processing_consent%rowtype;
 permitted boolean; reminded integer:=0; removed integer:=0; failed integer:=0;
begin
 if p_now is null then raise exception 'A clock is required.' using errcode='22023'; end if;
 today:=(p_now at time zone 'Asia/Manila')::date;
 for r in select t.user_id,t.purpose from private.tracker_retention_state t
  where t.removed_at is null and (t.removal_due_on<=today or (t.reminder_due_on<=today and t.reminded_at is null))
  order by t.user_id,t.purpose loop
  -- One account's failure stays that account's: its work rolls back, the others continue, and the console shows it.
  begin
   -- Same owner lock as the consent setter: a regrant and the removal serialize here.
   perform 1 from auth.users where id=r.user_id for update;
   if not found then continue; end if;
   select * into s from private.tracker_retention_state where user_id=r.user_id and purpose=r.purpose for update;
   if not found or s.removed_at is not null then continue; end if;
   select * into c from private.processing_consent where user_id=r.user_id;
   permitted:=coalesce(case r.purpose
    when 'custom-tracker' then c.custom_granted and c.custom_notice='2026-10-23-custom-tracker-v1'
    else c.fitness_granted and c.fitness_notice='2026-10-23-fitness-tracking-v1' end,false);
   if permitted then
    delete from private.tracker_retention_state where user_id=r.user_id and purpose=r.purpose;
   elsif s.reminded_at is null and today>=s.reminder_due_on then
    -- Nothing is removed without the reminder: if the job was down, the warning still gets its 7 days.
    update private.tracker_retention_state set reminded_at=p_now,removal_due_on=greatest(s.removal_due_on,today+7)
     where user_id=r.user_id and purpose=r.purpose;
    reminded:=reminded+1;
   elsif today>=s.removal_due_on then
    perform private.remove_tracker_purpose_records(r.user_id,r.purpose);
    update private.tracker_retention_state set removed_at=p_now,last_failed_at=null where user_id=r.user_id and purpose=r.purpose;
    removed:=removed+1;
   end if;
  exception when others then
   update private.tracker_retention_state set last_failed_at=p_now where user_id=r.user_id and purpose=r.purpose;
   failed:=failed+1;
   -- The code only: never the account, the record or the server's message.
   raise warning 'Tracker retention failed for one account (%).',sqlstate;
  end;
 end loop;
 return jsonb_build_object('reminded',reminded,'removed',removed)
  ||case when failed>0 then jsonb_build_object('failed',failed) else '{}'::jsonb end;
end;$$;

create or replace function public.operator_list_retention() returns jsonb
language plpgsql security definer set search_path='' as $$
declare op uuid:=private.require_operator(); result jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('email',q.email,'purpose',q.purpose,'withdrawnAt',q.withdrawn_at,
  'reminderDueOn',to_char(q.reminder_due_on,'YYYY-MM-DD'),'removalDueOn',to_char(q.removal_due_on,'YYYY-MM-DD'),
  'status',case when q.removed_at is not null then 'removed' when q.last_failed_at is not null then 'failed'
   when q.reminded_at is not null then 'reminded' else 'pending' end)
  order by q.removal_due_on,q.email,q.purpose),'[]'::jsonb) into result
 from (select u.email::text email,t.purpose,t.withdrawn_at,t.reminder_due_on,t.removal_due_on,
   t.reminded_at,t.removed_at,t.last_failed_at from private.tracker_retention_state t join auth.users u on u.id=t.user_id
   order by t.removal_due_on,u.email,t.purpose limit 200) q;
 perform private.write_operator_audit(op,'list-retention',null,null,null);
 return result;
end;$$;

-- Export inventory (052/056/060/061 pattern): the two new columns are the owner's own data.
alter function private.owner_export_manifest() rename to owner_export_manifest_before_admin_fixes;
create function private.owner_export_manifest() returns jsonb
language sql immutable set search_path='' as $$
 with base as (select private.owner_export_manifest_before_admin_fixes() m)
 select jsonb_build_object(
  'tables',(select jsonb_agg(case e->>'table'
    when 'private.authority_review_requests' then jsonb_set(e,'{export}',(e->'export')||'["age_version"]'::jsonb)
    when 'private.tracker_retention_state' then jsonb_set(e,'{export}',(e->'export')||'["last_failed_at"]'::jsonb)
    else e end order by ord) from base,jsonb_array_elements(base.m->'tables') with ordinality t(e,ord)),
  'foreignKeys',(select base.m->'foreignKeys' from base));
$$;
revoke all on function private.owner_export_manifest_before_admin_fixes(),private.owner_export_manifest() from public,anon,authenticated,service_role;
alter function private.owner_export_manifest_before_admin_fixes() owner to postgres;
alter function private.owner_export_manifest() owner to postgres;

commit;
