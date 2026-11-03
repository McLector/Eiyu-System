-- S02 local/unreleased: instrumented admission, not a global drain certificate.
-- Starts CLOSED. No cron schedule, provider activation or history cleanup here.
begin;

create table private.ai_admission_control (
 singleton boolean primary key default true check(singleton),
 is_open boolean not null default false,
 epoch bigint not null default 1 check(epoch between 1 and 9007199254740991),
 updated_at timestamptz not null default statement_timestamp(),
 last_pruned_at timestamptz
);
insert into private.ai_admission_control(singleton) values(true);
create table private.ai_execution_epochs (
 epoch bigint primary key check(epoch between 1 and 9007199254740991),
 opened_at timestamptz, closed_at timestamptz,
 outstanding_count bigint not null default 0 check(outstanding_count>=0),
 uncertain_count bigint not null default 0 check(uncertain_count between 0 and outstanding_count)
);
insert into private.ai_execution_epochs(epoch) values(1);
create table private.ai_execution_details (
 execution_id uuid primary key,
 request_id uuid not null unique,
 epoch bigint not null references private.ai_execution_epochs(epoch),
 contract_version integer not null check(contract_version=1),
 state text not null default 'admitted' check(state in('admitted','dispatch-authorized','completed','stopped-before-dispatch','unresolved')),
 authorized_attempt_mask smallint not null default 0 check(authorized_attempt_mask between 0 and 15),
 created_at timestamptz not null default statement_timestamp(),
 settled_at timestamptz
);
create index ai_execution_details_created_idx on private.ai_execution_details(created_at);
alter table private.ai_admission_control enable row level security;
alter table private.ai_execution_epochs enable row level security;
alter table private.ai_execution_details enable row level security;
revoke all on private.ai_admission_control,private.ai_execution_epochs,private.ai_execution_details from public,anon,authenticated,service_role;

-- Preserve the exact050 quota/processing helpers, but remove inherited grants.
alter function public.ai_begin_request(uuid,text,uuid,date) set schema private;
alter function private.ai_begin_request(uuid,text,uuid,date) rename to ai_begin_request_before_admission;
alter function public.ai_reserve_next_attempt(uuid,integer) set schema private;
alter function private.ai_reserve_next_attempt(uuid,integer) rename to ai_reserve_next_attempt_before_admission;
alter function public.ai_check_request_age(uuid,integer) set schema private;
alter function private.ai_check_request_age(uuid,integer) rename to ai_check_request_age_before_admission;
revoke all on function private.ai_begin_request_before_admission(uuid,text,uuid,date),
 private.ai_reserve_next_attempt_before_admission(uuid,integer),private.ai_check_request_age_before_admission(uuid,integer)
 from public,anon,authenticated,service_role;

create function private.ai_admission_healthy(c private.ai_admission_control) returns boolean
language sql stable set search_path='' as $$
 select coalesce(c.last_pruned_at>=statement_timestamp()-interval '1 hour',false)
 and not exists(select 1 from private.ai_execution_details d where d.created_at<=statement_timestamp()-interval '7 days');
$$;

-- Operator-only, SECURITY INVOKER: service RPC credentials cannot control maintenance.
create function private.close_ai_admission() returns bigint
language plpgsql set search_path='' as $$declare c private.ai_admission_control%rowtype; begin
 select * into c from private.ai_admission_control where singleton for update;
 if not found then raise exception 'Admission state unavailable.' using errcode='ED001'; end if;
 if not c.is_open then return c.epoch; end if;
 update private.ai_execution_epochs set closed_at=statement_timestamp() where epoch=c.epoch;
 update private.ai_admission_control set is_open=false,epoch=epoch+1,updated_at=statement_timestamp() where singleton returning * into c;
 insert into private.ai_execution_epochs(epoch) values(c.epoch);
 return c.epoch;
end;$$;
create function private.open_ai_admission() returns bigint
language plpgsql set search_path='' as $$declare c private.ai_admission_control%rowtype; begin
 select * into c from private.ai_admission_control where singleton for update;
 if not found or not private.ai_admission_healthy(c)
  or exists(select 1 from private.ai_execution_epochs where outstanding_count>0) then
  raise exception 'Admission cannot open while health or execution state is unresolved.' using errcode='ED001';
 end if;
 update private.ai_admission_control set is_open=true,updated_at=statement_timestamp() where singleton;
 update private.ai_execution_epochs set opened_at=coalesce(opened_at,statement_timestamp()) where epoch=c.epoch;
 return c.epoch;
end;$$;

create function public.ai_admit_execution(p_user_id uuid,p_action text,p_request_id uuid,p_week_start date,p_execution_id uuid,p_contract_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.ai_admission_control%rowtype; result jsonb;
begin
 perform private.require_processing_service();
 if p_user_id is null or p_request_id is null or p_execution_id is null or p_action is distinct from 'weekly-summary'
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

create function public.ai_authorize_execution_attempt(p_execution_id uuid,p_epoch bigint,p_attempt_number integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare c private.ai_admission_control%rowtype; d private.ai_execution_details%rowtype; uid uuid; expected_mask integer;
begin
 perform private.require_processing_service();
 if p_execution_id is null or p_epoch is null or p_attempt_number is null or p_attempt_number not between 1 and 4 then return false; end if;
 select * into c from private.ai_admission_control where singleton for update;
 if not found or not c.is_open or c.epoch<>p_epoch or not private.ai_admission_healthy(c) then return false; end if;
 select r.user_id into uid from private.ai_execution_details e join private.ai_logical_requests r using(request_id)
  where e.execution_id=p_execution_id and e.epoch=p_epoch;
 if not found then return false; end if;
 perform 1 from auth.users where id=uid for update;
 if not found then return false; end if;
 select * into d from private.ai_execution_details where execution_id=p_execution_id and epoch=p_epoch for update;
 expected_mask:=(1<<(p_attempt_number-1))-1;
 if not found or d.state not in('admitted','dispatch-authorized') or d.authorized_attempt_mask<>expected_mask
  or d.created_at<=statement_timestamp()-interval '7 days' then return false; end if;
 if not private.processing_request_current(d.request_id) then
  perform private.require_debrief_generation(uid);
  raise exception 'Processing access changed.' using errcode='EP002';
 end if;
 if p_attempt_number>1 and not private.ai_reserve_next_attempt_before_admission(d.request_id,p_attempt_number) then
  raise exception 'AI request quota unavailable.' using errcode='EQ001';
 end if;
 update private.ai_execution_details set state='dispatch-authorized',authorized_attempt_mask=((1<<p_attempt_number)-1)::smallint
  where execution_id=p_execution_id;
 return true;
end;$$;

create function public.ai_prepare_execution_result(p_execution_id uuid,p_epoch bigint,p_age_version integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare c private.ai_admission_control%rowtype; d private.ai_execution_details%rowtype; uid uuid;
begin
 perform private.require_processing_service();
 select * into c from private.ai_admission_control where singleton for update;
 if not found or not c.is_open or c.epoch is distinct from p_epoch or not private.ai_admission_healthy(c) then return false; end if;
 select r.user_id into uid from private.ai_execution_details e join private.ai_logical_requests r using(request_id)
  where e.execution_id=p_execution_id and e.epoch=p_epoch;
 if not found then return false; end if;
 perform 1 from auth.users where id=uid for update;
 if not found then return false; end if;
 select * into d from private.ai_execution_details where execution_id=p_execution_id and epoch=p_epoch;
 if not found or d.state not in('dispatch-authorized','completed') or d.created_at<=statement_timestamp()-interval '7 days' then return false; end if;
 if not private.ai_check_request_age_before_admission(d.request_id,p_age_version) then
  perform private.require_debrief_generation(uid);
  raise exception 'Processing access changed.' using errcode='EP002';
 end if;
 return true;
end;$$;

create function public.ai_settle_execution(p_execution_id uuid,p_epoch bigint,p_outcome text)
returns boolean language plpgsql security definer set search_path='' as $$
declare d private.ai_execution_details%rowtype;
begin
 perform private.require_processing_service();
 if p_outcome is null or p_outcome not in('completed','stopped-before-dispatch','unresolved') then return false; end if;
 -- Serialize with close/prune/admission, without requiring the old epoch to remain open.
 perform 1 from private.ai_admission_control where singleton for update;
 if not found then return false; end if;
 select * into d from private.ai_execution_details where execution_id=p_execution_id and epoch=p_epoch for update;
 if not found or d.created_at<=statement_timestamp()-interval '7 days' then return false; end if;
 if d.state in('completed','stopped-before-dispatch','unresolved') then return d.state=p_outcome; end if;
 if p_outcome='stopped-before-dispatch' and d.authorized_attempt_mask<>0 then return false; end if;
 update private.ai_execution_details set state=p_outcome,settled_at=statement_timestamp() where execution_id=p_execution_id;
 if p_outcome='unresolved' then
  update private.ai_execution_epochs set uncertain_count=uncertain_count+1 where epoch=p_epoch;
 else
  update private.ai_execution_epochs set outstanding_count=outstanding_count-1 where epoch=p_epoch;
 end if;
 return true;
end;$$;

-- Uninstrumented workers remain denied after reopen. Keep names/signatures for safe failure.
create function public.ai_begin_request(p_user_id uuid,p_action text,p_request_id uuid,p_week_start date)
returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.require_processing_service();
 -- Compatibility-only signature: deliberately discard inputs, never inspect/log them.
 perform p_user_id,p_action,p_request_id,p_week_start;
 return jsonb_build_object('allowed',false,'attemptNumber',0,'reason','unavailable');
end;$$;
create function public.ai_reserve_next_attempt(p_request_id uuid,p_attempt_number integer)
returns boolean language plpgsql security definer set search_path='' as $$begin perform private.require_processing_service();perform p_request_id,p_attempt_number;return false;end;$$;
create function public.ai_check_request_age(p_request_id uuid,p_age_version integer)
returns boolean language plpgsql security definer set search_path='' as $$begin perform private.require_processing_service();perform p_request_id,p_age_version;return false;end;$$;

revoke all on function private.ai_admission_healthy(private.ai_admission_control),private.close_ai_admission(),private.open_ai_admission()
 from public,anon,authenticated,service_role;
revoke all on function public.ai_admit_execution(uuid,text,uuid,date,uuid,integer),public.ai_authorize_execution_attempt(uuid,bigint,integer),
 public.ai_prepare_execution_result(uuid,bigint,integer),public.ai_settle_execution(uuid,bigint,text),
 public.ai_begin_request(uuid,text,uuid,date),public.ai_reserve_next_attempt(uuid,integer),public.ai_check_request_age(uuid,integer)
 from public,anon,authenticated;
grant execute on function public.ai_admit_execution(uuid,text,uuid,date,uuid,integer),public.ai_authorize_execution_attempt(uuid,bigint,integer),
 public.ai_prepare_execution_result(uuid,bigint,integer),public.ai_settle_execution(uuid,bigint,text),
 public.ai_begin_request(uuid,text,uuid,date),public.ai_reserve_next_attempt(uuid,integer),public.ai_check_request_age(uuid,integer) to service_role;

-- Original helpers run as trusted postgres; use that same owner, not service_role.
alter function public.ai_admit_execution(uuid,text,uuid,date,uuid,integer) owner to postgres;
alter function public.ai_authorize_execution_attempt(uuid,bigint,integer) owner to postgres;
alter function public.ai_prepare_execution_result(uuid,bigint,integer) owner to postgres;
alter function public.ai_settle_execution(uuid,bigint,text) owner to postgres;
alter function public.ai_begin_request(uuid,text,uuid,date) owner to postgres;
alter function public.ai_reserve_next_attempt(uuid,integer) owner to postgres;
alter function public.ai_check_request_age(uuid,integer) owner to postgres;
grant select,insert,update,delete on private.ai_admission_control,private.ai_execution_epochs,private.ai_execution_details to postgres;
grant execute on function private.ai_admission_healthy(private.ai_admission_control) to postgres;

-- No scheduling here. Operator invocation only; successful maintenance warms admission.
create function private.prune_ai_execution_details() returns bigint
language plpgsql set search_path='' as $$
declare d private.ai_execution_details%rowtype; removed bigint:=0;
begin
 perform 1 from private.ai_admission_control where singleton for update;
 if not found then return -1; end if;
 begin
  for d in select * from private.ai_execution_details e
   where e.created_at<=statement_timestamp()-interval '6 days 23 hours'
    or not exists(select 1 from private.ai_logical_requests r where r.request_id=e.request_id)
   order by e.execution_id for update
  loop
   if d.state in('admitted','dispatch-authorized') then
    update private.ai_execution_epochs set uncertain_count=uncertain_count+1 where epoch=d.epoch;
   end if;
   delete from private.ai_execution_details where execution_id=d.execution_id;
   removed:=removed+1;
  end loop;
  update private.ai_admission_control set last_pruned_at=statement_timestamp() where singleton;
  return removed;
 exception when others then
  -- Subtransaction rolled back detail/counter changes. Do not log exception contents.
  update private.ai_admission_control set last_pruned_at=null where singleton;
  perform private.close_ai_admission();
  return -1;
 end;
end;$$;
revoke all on function private.prune_ai_execution_details() from public,anon,authenticated,service_role;
grant execute on function private.prune_ai_execution_details(),private.close_ai_admission(),private.open_ai_admission() to postgres;

-- Owner/8-day receipt removal must unlink detail without pretending the work ended.
-- Do not acquire the maintenance lock here: Auth deletion already owns its user row.
-- Detail -> epoch order matches settlement/pruning and avoids owner -> gate inversion.
create function private.detach_ai_execution_detail() returns trigger
language plpgsql security definer set search_path='' as $$
declare d private.ai_execution_details%rowtype;
begin
 for d in select * from private.ai_execution_details where request_id=old.request_id for update loop
  if d.state in('admitted','dispatch-authorized') then
   update private.ai_execution_epochs set uncertain_count=uncertain_count+1 where epoch=d.epoch;
  end if;
  delete from private.ai_execution_details where execution_id=d.execution_id;
 end loop;
 return old;
end;$$;
revoke all on function private.detach_ai_execution_detail() from public,anon,authenticated,service_role;
alter function private.detach_ai_execution_detail() owner to postgres;
create trigger detach_ai_execution_detail before delete on private.ai_logical_requests
 for each row execute function private.detach_ai_execution_detail();
commit;
