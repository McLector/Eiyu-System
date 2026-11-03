-- Local S02 only; not approved for deployment. Admin console server side, part 1.
-- Operators are added by hand in the SQL editor; no RPC can add one. Every
-- operator RPC refuses anyone who is not an operator at AAL2 (MFA). Console
-- projections and the audit never carry quest, gym, birthday or AI content.
begin;

create table private.operator_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 added_at timestamptz not null default statement_timestamp()
);
create table private.authority_review_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 purpose text not null check(purpose in ('custom-tracker','fitness-tracking','weekly-debrief')),
 note text check(note is null or length(note)<=280),
 status text not null default 'open' check(status in ('open','approved','denied','withdrawn')),
 created_at timestamptz not null default statement_timestamp(),
 decided_at timestamptz,
 decided_by uuid references auth.users(id) on delete set null
);
create unique index authority_review_one_open on private.authority_review_requests(user_id,purpose) where status='open';
create index authority_review_user_created on private.authority_review_requests(user_id,created_at);
create index authority_review_status_created on private.authority_review_requests(status,created_at);
-- No FK on operator or subject: the audit outlives both accounts. Content-free by shape.
create table private.operator_audit (
 id bigint generated always as identity primary key,
 operator_id uuid not null,
 action text not null check(action ~ '^[a-z][a-z-]{0,39}$'),
 subject_user_id uuid,
 purpose text check(purpose is null or purpose in ('custom-tracker','fitness-tracking','weekly-debrief')),
 reason_code text check(reason_code is null or reason_code in ('dispute','report','other')),
 at timestamptz not null default statement_timestamp()
);
alter table private.operator_accounts enable row level security;
alter table private.authority_review_requests enable row level security;
alter table private.operator_audit enable row level security;
revoke all on private.operator_accounts,private.authority_review_requests,private.operator_audit from public,anon,authenticated,service_role;
revoke all on sequence private.operator_audit_id_seq from public,anon,authenticated,service_role;

-- Fails closed: no caller, no aal claim, aal1 or a non-operator all get the same safe error.
create function private.require_operator() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null or coalesce(auth.jwt()->>'aal','') is distinct from 'aal2'
  or not exists(select 1 from private.operator_accounts where user_id=uid) then
  raise exception 'Operator access required.' using errcode='42501';
 end if;
 return uid;
end;$$;
revoke all on function private.require_operator() from public,anon,authenticated,service_role;

create function private.review_age_band(p_user_id uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when a.user_id is null or a.birth_date is null then 'unknown'
  when private.adult_declared(p_user_id) then 'adult' else 'teen' end
 from (select 1) one left join private.account_age a on a.user_id=p_user_id;
$$;
revoke all on function private.review_age_band(uuid) from public,anon,authenticated,service_role;

create function private.review_purpose_state(p_user_id uuid,p_purpose text) returns text
language plpgsql stable security definer set search_path='' as $$
begin
 if p_purpose in ('custom-tracker','fitness-tracking') then
  return private.tracker_purpose_authority_state(p_user_id,p_purpose);
 end if;
 return private.processing_access(p_user_id)->>'authorityState';
end;$$;
revoke all on function private.review_purpose_state(uuid,text) from public,anon,authenticated,service_role;

-- Records through the existing trusted functions, bound to the current age revision.
create function private.record_review_decision(p_user_id uuid,p_purpose text,p_state text,p_reference uuid) returns void
language plpgsql security definer set search_path='' as $$
declare age_version integer;
begin
 select coalesce((select version from private.account_age where user_id=p_user_id),0) into age_version;
 if p_purpose in ('custom-tracker','fitness-tracking') then
  perform private.record_tracker_processing_authority(p_user_id,p_purpose,p_state,age_version,p_reference);
 else
  perform private.record_processing_authority(p_user_id,p_state,array['age-screening','weekly-debrief'],age_version,p_reference);
 end if;
end;$$;
revoke all on function private.record_review_decision(uuid,text,text,uuid) from public,anon,authenticated,service_role;

create function private.write_operator_audit(p_operator uuid,p_action text,p_subject uuid,p_purpose text,p_reason text) returns void
language sql security definer set search_path='' as $$
 insert into private.operator_audit(operator_id,action,subject_user_id,purpose,reason_code) values(p_operator,p_action,p_subject,p_purpose,p_reason);
$$;
revoke all on function private.write_operator_audit(uuid,text,uuid,text,text) from public,anon,authenticated,service_role;

create function public.get_operator_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); op boolean; aal text;
begin
 if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 op:=exists(select 1 from private.operator_accounts where user_id=uid);
 aal:=case when auth.jwt()->>'aal'='aal2' then 'aal2' else 'aal1' end;
 return jsonb_build_object('isOperator',op,'mfaRequired',op and aal<>'aal2','aal',aal);
end;$$;

create function public.request_authority_review(p_purpose text,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); n text; rid uuid;
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
 if exists(select 1 from private.authority_review_requests where user_id=uid and purpose=p_purpose and status='open') then
  raise exception 'A review request is already open.' using errcode='ER002';
 end if;
 if (select count(*) from private.authority_review_requests where user_id=uid
  and created_at>statement_timestamp()-interval '1 day')>=3 then
  raise exception 'Too many review requests today. Try again tomorrow.' using errcode='ER001';
 end if;
 insert into private.authority_review_requests(user_id,purpose,note) values(uid,p_purpose,n) returning id into rid;
 return jsonb_build_object('requestId',rid,'purpose',p_purpose,'status','open');
end;$$;

create function public.cancel_authority_review(p_purpose text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); n integer;
begin
 if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_purpose is null or p_purpose not in ('custom-tracker','fitness-tracking','weekly-debrief') then
  raise exception 'Choose a valid purpose.' using errcode='22023';
 end if;
 update private.authority_review_requests set status='withdrawn',decided_at=statement_timestamp()
  where user_id=uid and purpose=p_purpose and status='open';
 get diagnostics n=row_count;
 return jsonb_build_object('cancelled',n>0);
end;$$;

create function public.operator_list_review_requests(p_status text default 'open') returns jsonb
language plpgsql security definer set search_path='' as $$
declare op uuid:=private.require_operator(); result jsonb;
begin
 if p_status is null or p_status not in ('open','approved','denied','withdrawn') then
  raise exception 'Choose a valid status.' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('requestId',q.id,'userId',q.user_id,'email',q.email,'ageBand',private.review_age_band(q.user_id),
  'purpose',q.purpose,'note',q.note,'status',q.status,'createdAt',q.created_at) order by q.created_at,q.id),'[]'::jsonb) into result
 from (select r.id,r.user_id,u.email::text email,r.purpose,r.note,r.status,r.created_at
  from private.authority_review_requests r join auth.users u on u.id=r.user_id
  where r.status=p_status order by r.created_at,r.id limit 200) q;
 perform private.write_operator_audit(op,'list-review-requests',null,null,null);
 return result;
end;$$;

create function public.operator_decide_review(p_request_id uuid,p_decision text) returns jsonb
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
  -- An approval never overrides a pause or a settled state.
  if st is distinct from 'pending' then raise exception 'This request no longer applies.' using errcode='ER003'; end if;
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

create function public.operator_pause_purpose(p_user_id uuid,p_purpose text,p_reason_code text,p_email text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op uuid:=private.require_operator(); target uuid;
begin
 -- Exactly one of account id or email names the account.
 if p_purpose is null or p_purpose not in ('custom-tracker','fitness-tracking','weekly-debrief')
  or p_reason_code is null or p_reason_code not in ('dispute','report','other')
  or (p_user_id is null) = (p_email is null) then
  raise exception 'Invalid pause.' using errcode='22023';
 end if;
 if p_email is not null then
  -- Case-insensitive exact match; unknown and ambiguous both refuse generically.
  select u.id into target from auth.users u where lower(u.email)=lower(btrim(p_email)) limit 2;
  if (select count(*) from auth.users u where lower(u.email)=lower(btrim(p_email)))<>1 then
   raise exception 'Account unavailable.' using errcode='42501';
  end if;
 else
  target:=p_user_id;
 end if;
 perform 1 from auth.users where id=target for update;
 if not found then raise exception 'Account unavailable.' using errcode='42501'; end if;
 -- History stays: this appends a revoked decision; nothing is deleted.
 perform private.record_review_decision(target,p_purpose,'revoked',gen_random_uuid());
 perform private.write_operator_audit(op,'pause-purpose',target,p_purpose,p_reason_code);
 return jsonb_build_object('purpose',p_purpose,'state','revoked');
end;$$;

create function public.get_my_review_requests() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 -- Own rows only: open requests plus the most recent decided one per purpose. No note.
 return coalesce((select jsonb_agg(jsonb_build_object('requestId',q.id,'purpose',q.purpose,'status',q.status,'createdAt',q.created_at)
   order by q.purpose,q.created_at desc,q.id)
  from (select r.id,r.purpose,r.status,r.created_at from private.authority_review_requests r where r.user_id=uid and r.status='open'
   union all
   select d.id,d.purpose,d.status,d.created_at from (select distinct on (r.purpose) r.id,r.purpose,r.status,r.created_at
    from private.authority_review_requests r where r.user_id=uid and r.status in ('approved','denied')
    order by r.purpose,r.created_at desc,r.id) d) q),'[]'::jsonb);
end;$$;

revoke all on function public.get_operator_status(),public.request_authority_review(text,text),public.cancel_authority_review(text),
 public.operator_list_review_requests(text),public.operator_decide_review(uuid,text),public.operator_pause_purpose(uuid,text,text,text),
 public.get_my_review_requests()
 from public,anon,authenticated,service_role;
grant execute on function public.get_operator_status(),public.request_authority_review(text,text),public.cancel_authority_review(text),
 public.operator_list_review_requests(text),public.operator_decide_review(uuid,text),public.operator_pause_purpose(uuid,text,text,text),
 public.get_my_review_requests()
 to authenticated;

-- Export inventory (052/056 pattern): the owner's own review requests are
-- exportable (decided_by omitted); operator accounts and the audit are not user data.
alter function private.owner_export_manifest() rename to owner_export_manifest_before_operator;
create function private.owner_export_manifest() returns jsonb
language sql immutable set search_path='' as $$
 with base as (select private.owner_export_manifest_before_operator() m)
 select jsonb_build_object(
  'tables',(select jsonb_agg(e order by ord) from base,jsonb_array_elements(base.m->'tables') with ordinality t(e,ord))
   ||'[{"table":"private.authority_review_requests","export":["id","user_id","purpose","note","status","created_at","decided_at"],"exclude":["decided_by"],"scope":"owner"},
       {"table":"private.operator_accounts","export":[],"exclude":["user_id","added_at"],"scope":"global"},
       {"table":"private.operator_audit","export":[],"exclude":["id","operator_id","action","subject_user_id","purpose","reason_code","at"],"scope":"global"}]'::jsonb,
  'foreignKeys',(select jsonb_agg(e order by e->>'source',e->>'definition')
    from (select jsonb_array_elements(base.m->'foreignKeys') e from base
     union all select x from jsonb_array_elements('[{"source":"private.authority_review_requests","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},
       {"source":"private.authority_review_requests","definition":"FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE SET NULL"},
       {"source":"private.operator_accounts","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"}]'::jsonb) x) f));
$$;
revoke all on function private.owner_export_manifest_before_operator(),private.owner_export_manifest() from public,anon,authenticated,service_role;
alter function private.owner_export_manifest_before_operator() owner to postgres;
alter function private.owner_export_manifest() owner to postgres;

commit;
