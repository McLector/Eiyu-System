-- Local-only S02 draft; apply only as the complete053–056 transaction.
begin;

create function private.tracker_object_keys(p_value jsonb,p_required text[],p_optional text[] default '{}') returns void
language plpgsql immutable set search_path='' as $$begin
 if jsonb_typeof(p_value) is distinct from 'object' or not(p_value ?& p_required)
  or exists(select 1 from jsonb_object_keys(p_value) k where k<>all(p_required||p_optional)) then
  raise exception 'Invalid tracker input.' using errcode='22023';
 end if;
end;$$;
revoke all on function private.tracker_object_keys(jsonb,text[],text[]) from public,anon,authenticated,service_role;

-- Type validation catches invalid casts here, before any write. Error text
-- never incorporates a caller value. Specifications come only from the CASE.
create function private.tracker_argument_types(p_args jsonb,p_spec text) returns void
language plpgsql immutable set search_path='' as $$
declare spec text; key text; typ text; value jsonb; ignored text;
begin
 foreach spec in array string_to_array(p_spec,',') loop
  key:=split_part(spec,':',1); typ:=split_part(spec,':',2); value:=p_args->key;
  if typ in ('object','array','boolean','number','string') then
   if jsonb_typeof(value) is distinct from typ then raise exception 'Invalid tracker input.' using errcode='22023'; end if;
  elsif typ in ('uuid','date','completion') then
   if jsonb_typeof(value) is distinct from 'string' then raise exception 'Invalid tracker input.' using errcode='22023'; end if;
   if typ='uuid' then ignored:=((value#>>'{}')::uuid)::text;
   elsif typ='date' then
    if (value#>>'{}')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not isfinite((value#>>'{}')::date) then raise exception 'Invalid tracker input.' using errcode='22023'; end if;
    ignored:=((value#>>'{}')::date)::text;
   else ignored:=((value#>>'{}')::public.completion_kind)::text; end if;
  elsif typ='integer' then
   if jsonb_typeof(value) is distinct from 'number' or value::text!~'^-?(0|[1-9][0-9]*)$' then raise exception 'Invalid tracker input.' using errcode='22023'; end if;
   ignored:=(value::text::integer)::text;
  else raise exception 'Invalid tracker input.' using errcode='22023'; end if;
 end loop;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
 raise exception 'Invalid tracker input.' using errcode='22023';
end;$$;
revoke all on function private.tracker_argument_types(jsonb,text) from public,anon,authenticated,service_role;

create function private.save_tracker_habit(p_id uuid,p_create boolean,p_mode text,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
<<habit_values>>
declare uid uuid:=auth.uid(); old public.habits%rowtype; prov private.tracker_input_provenance%rowtype;
 n integer; name text; easy text; quest_type text; target integer; scheduled date; at_time time;
 days smallint[]; is_timed boolean; genre text; description text; stat public.stat_key; difficulty public.difficulty;
begin
 perform private.tracker_object_keys(p_input,array['stat','difficulty','time','days'],
  case when p_mode='basic' then array['questType','scheduledDate','targetCount','timeSet']
  else array['questType','scheduledDate','targetCount','timeSet','name','description','easyVersion','genre'] end);
 perform private.tracker_argument_types(p_input,'stat:string,difficulty:string,time:string,days:array');
 if p_mode='custom' then perform private.tracker_argument_types(p_input,'name:string'); end if;
 begin
  stat:=(p_input->>'stat')::public.stat_key; difficulty:=(p_input->>'difficulty')::public.difficulty;
  if (p_input->>'time')!~'^[0-9]{2}:[0-9]{2}$' then raise exception 'Invalid tracker input.' using errcode='22023'; end if;
  at_time:=(p_input->>'time')::time;
  if exists(select 1 from jsonb_array_elements(p_input->'days') d where jsonb_typeof(d)<>'number' or d::text!~'^[0-6]$') then raise exception 'Invalid tracker input.' using errcode='22023'; end if;
  select coalesce(array_agg(d::text::smallint),'{}') into days from jsonb_array_elements(p_input->'days') d;
  if cardinality(days)<>(select count(distinct d) from unnest(days) d) then raise exception 'Invalid tracker input.' using errcode='22023'; end if;
  quest_type:=coalesce(p_input->>'questType','habit');
  if quest_type not in ('habit','one_time','backlog') then raise exception 'Invalid tracker input.' using errcode='22023'; end if;
  if p_input->>'targetCount' is not null then
   perform private.tracker_argument_types(p_input,'targetCount:integer'); target:=(p_input->>'targetCount')::integer;
   if target<=1 then raise exception 'Invalid tracker input.' using errcode='22023'; end if;
  end if;
  if p_input->>'scheduledDate' is not null then perform private.tracker_argument_types(p_input,'scheduledDate:date'); scheduled:=(p_input->>'scheduledDate')::date; end if;
  if p_input ? 'timeSet' then perform private.tracker_argument_types(p_input,'timeSet:boolean'); end if;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
  raise exception 'Invalid tracker input.' using errcode='22023';
 end;
 if quest_type<>'habit' then target:=null; end if;
 if quest_type<>'one_time' then scheduled:=null; end if;
 is_timed:=case when quest_type='habit' then true when quest_type='backlog' or scheduled is null then false else coalesce((p_input->>'timeSet')::boolean,true) end;
 if not is_timed then at_time:='08:00'; end if;
 if quest_type='backlog' then days:='{}'; end if;
 select * into old from public.habits where id=p_id for update;
 select * into prov from private.tracker_input_provenance where object_kind='habit' and object_id=p_id;
 if old.id is not null and old.user_id<>uid or prov.object_id is not null and prov.user_id<>uid then raise exception 'Tracker target unavailable.' using errcode='42501'; end if;
 if old.id is null and (not p_create or prov.object_id is not null) then raise exception 'Tracker target unavailable.' using errcode='42501'; end if;
 if p_mode='basic' and old.id is not null and coalesce(prov.input_kind,'custom')<>'basic' then raise exception 'Protected tracker cannot become basic.' using errcode='22023'; end if;
 if old.id is null then
  select coalesce(max(ordinal),0)+1 into n from private.tracker_input_provenance where user_id=uid and object_kind='habit';
 else n:=prov.ordinal; end if;
 name:=case when p_mode='basic' then 'Quest '||n when old.id is not null and p_input->>'name'=old.name then old.name else public.trim_profile_text(p_input->>'name') end;
 if old.id is null or name is distinct from old.name then
  if name is null or length(name) not between 1 and 80 or length(regexp_replace(name,'[[:space:]]','','g'))=0 then raise exception 'Enter a valid quest name.' using errcode='22023'; end if;
 end if;
 if p_mode='custom' then
  if p_input->>'description' is not null then perform private.tracker_argument_types(p_input,'description:string'); end if;
  if p_input->>'easyVersion' is not null then perform private.tracker_argument_types(p_input,'easyVersion:string'); end if;
  if p_input->>'genre' is not null then perform private.tracker_argument_types(p_input,'genre:string'); end if;
  description:=nullif(btrim(p_input->>'description'),'');
  genre:=case when quest_type<>'habit' then p_input->>'genre' end;
 end if;
 easy:=case when quest_type='habit' and target is null then
  case when p_mode='basic' then 'Take one small step' else nullif(btrim(p_input->>'easyVersion'),'') end end;
 if p_create and old.id is not null then
  if prov.object_id is null or prov.input_kind<>p_mode or old.name is distinct from name or old.easy_version is distinct from easy
   or old.description is distinct from description or old.genre is distinct from genre or old.stat<>stat or old.difficulty<>difficulty
   or old.quest_type<>quest_type or old.reminder_time<>at_time or old.days<>days or old.scheduled_date is distinct from scheduled
   or old.target_count is distinct from target or old.time_set<>is_timed then raise exception 'Creation input changed.' using errcode='22023'; end if;
  return p_id;
 end if;
 if old.id is null then
  insert into public.habits(id,user_id,name,easy_version,description,genre,stat,difficulty,quest_type,reminder_time,days,scheduled_date,target_count,time_set)
   values(p_id,uid,name,easy,description,genre,stat,difficulty,quest_type,at_time,days,scheduled,target,is_timed);
  insert into private.tracker_input_provenance(object_kind,object_id,user_id,input_kind,ordinal) values('habit',p_id,uid,p_mode,n);
 else
  update public.habits h set name=habit_values.name,easy_version=easy,description=habit_values.description,genre=habit_values.genre,
   stat=habit_values.stat,difficulty=habit_values.difficulty,quest_type=habit_values.quest_type,reminder_time=at_time,
   days=habit_values.days,scheduled_date=scheduled,target_count=target,time_set=is_timed,updated_at=statement_timestamp() where h.id=p_id;
  if p_mode='custom' then update private.tracker_input_provenance set input_kind='custom' where object_kind='habit' and object_id=p_id; end if;
 end if;
 return p_id;
end;$$;
revoke all on function private.save_tracker_habit(uuid,boolean,text,jsonb) from public,anon,authenticated,service_role;

create function private.save_tracker_chain(p_id uuid,p_request_id uuid,p_create boolean,p_mode text,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); q public.long_quests%rowtype; prov private.tracker_input_provenance%rowtype;
 prior private.long_quest_definition_receipts%rowtype; normalized jsonb; item jsonb; stages jsonb:='[]';
 sid uuid; label text; n integer; next_stage integer; idx integer:=0; result uuid;
begin
 perform private.tracker_object_keys(p_input,array['stat','stages'],case when p_mode='basic' then array['strictOrder'] else array['strictOrder','name','description'] end);
 perform private.tracker_argument_types(p_input,'stat:string,stages:array');
 if p_input ? 'strictOrder' then perform private.tracker_argument_types(p_input,'strictOrder:boolean'); end if;
 if jsonb_array_length(p_input->'stages')=0 then raise exception 'Add at least one stage.' using errcode='22023'; end if;
 select * into q from public.long_quests where id=p_id for update;
 select * into prov from private.tracker_input_provenance where object_kind='chain' and object_id=p_id;
 if q.id is not null and q.user_id<>uid or prov.object_id is not null and prov.user_id<>uid then raise exception 'Tracker target unavailable.' using errcode='42501'; end if;
 if q.id is null and (not p_create or prov.object_id is not null) then raise exception 'Tracker target unavailable.' using errcode='42501'; end if;
 if p_mode='basic' and q.id is not null and coalesce(prov.input_kind,'custom')<>'basic' then raise exception 'Protected tracker cannot become basic.' using errcode='22023'; end if;
 select * into prior from private.long_quest_definition_receipts where user_id=uid and request_id=p_request_id;
 if prior.request_id is not null and prior.quest_id<>p_id then raise exception 'Creation input changed.' using errcode='22023'; end if;
 if q.id is null then select coalesce(max(ordinal),0)+1 into n from private.tracker_input_provenance where user_id=uid and object_kind='chain'; else n:=prov.ordinal; end if;
 next_stage:=coalesce(prov.next_stage_ordinal,1);
 for item in select * from jsonb_array_elements(p_input->'stages') loop
  perform private.tracker_object_keys(item,'{}',case when p_mode='basic' then array['id'] else array['id','name','description'] end);
  if item->>'id' is not null then perform private.tracker_argument_types(item,'id:uuid'); sid:=(item->>'id')::uuid;
  elsif prior.request_id is not null then sid:=(prior.input#>>array['stages',idx::text,'id'])::uuid;
  else sid:=gen_random_uuid(); end if;
  if exists(select 1 from public.long_quest_stages where id=sid and (user_id<>uid or long_quest_id<>p_id)) then raise exception 'Tracker target unavailable.' using errcode='42501'; end if;
  if p_mode='basic' then
   if prior.request_id is not null then
    if sid::text is distinct from prior.input#>>array['stages',idx::text,'id'] then raise exception 'Creation input changed.' using errcode='22023'; end if;
    label:=prior.input#>>array['stages',idx::text,'name'];
   else
    select name into label from public.long_quest_stages where id=sid and long_quest_id=p_id;
    if label is null then label:='Step '||next_stage;next_stage:=next_stage+1; end if;
   end if;
   stages:=stages||jsonb_build_array(jsonb_build_object('id',sid,'name',label,'description',null));
  else
   perform private.tracker_argument_types(item,'name:string');
   if item->>'description' is not null then perform private.tracker_argument_types(item,'description:string'); end if;
   stages:=stages||jsonb_build_array(item||jsonb_build_object('id',sid));
  end if;
  idx:=idx+1;
 end loop;
 if (select count(distinct e->>'id') from jsonb_array_elements(stages) e)<>jsonb_array_length(stages) then raise exception 'Duplicate stages.' using errcode='22023'; end if;
 if p_mode='basic' then
  normalized:=jsonb_build_object('name','Chain '||n,'stat',p_input->'stat','description',null,'stages',stages,
   'strictOrder',coalesce(p_input->'strictOrder',to_jsonb(coalesce(q.strict_order,true))));
 else
  perform private.tracker_argument_types(p_input,'name:string');
  if p_input->>'description' is not null then perform private.tracker_argument_types(p_input,'description:string'); end if;
  normalized:=p_input||jsonb_build_object('stages',stages);
 end if;
 if prior.request_id is not null and normalized<>prior.input then raise exception 'Creation input changed.' using errcode='22023'; end if;
 result:=public.save_long_quest_definition(p_id,p_request_id,normalized,p_create);
 if prov.object_id is null and q.id is null then
  insert into private.tracker_input_provenance(object_kind,object_id,user_id,input_kind,ordinal,next_stage_ordinal) values('chain',p_id,uid,p_mode,n,next_stage);
 elsif prior.request_id is null then
  update private.tracker_input_provenance set input_kind=case when p_mode='custom' then 'custom' else input_kind end,next_stage_ordinal=next_stage where object_kind='chain' and object_id=p_id;
 end if;
 return result;
end;$$;
revoke all on function private.save_tracker_chain(uuid,uuid,boolean,text,jsonb) from public,anon,authenticated,service_role;

create function public.apply_tracker_write(p_operation text,p_arguments jsonb,p_expected jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); s jsonb; a jsonb; spec text; keys text[]; snapshots jsonb; expected jsonb; item jsonb;
 ids uuid[]:='{}'; kind text; root uuid; requires_custom boolean:=false; fitness boolean:=false; create_new boolean:=false;
 mode text; result jsonb:='null'; r public.gym_routines%rowtype;
begin
 perform private.validate_tracker_revision(p_expected);
 if uid is null or uid is distinct from (p_expected->>'userId')::uuid then raise exception 'Account changed.' using errcode='42501'; end if;
 perform 1 from auth.users where id=uid for update;
 s:=private.tracker_processing_access(uid);
 if s#>'{revision,ageVersion}' is distinct from p_expected->'ageVersion' then raise exception 'Tracker access changed.' using errcode='ET003'; end if;
 if not(s->>'canWriteBasic')::boolean then raise exception 'Tracker updates are paused.' using errcode='ET001'; end if;
 spec:=case p_operation
  when 'habit-save' then 'p_id:uuid,p_create:boolean,p_mode:string,p_input:object'
  when 'complete_habit' then 'p_habit_id:uuid,p_completed_on:date,p_kind:completion'
  when 'undo_habit_completion' then 'p_habit_id:uuid,p_completed_on:date'
  when 'increment_habit_progress' then 'p_habit_id:uuid,p_date:date,p_delta:integer'
  when 'complete_habit_recovery' then 'p_habit_id:uuid'
  when 'archive_habit' then 'p_habit_id:uuid' when 'restore_habit' then 'p_habit_id:uuid' when 'delete_habit' then 'p_habit_id:uuid'
  when 'move_backlog_to_one_time' then 'p_id:uuid' when 'move_one_time_to_backlog' then 'p_id:uuid'
  when 'reorder_quests' then 'p_quest_type:string,p_ids:array'
  when 'chain-save' then 'p_id:uuid,p_request_id:uuid,p_create:boolean,p_mode:string,p_input:object'
  when 'set_long_quest_stage_done_receipt' then 'p_stage_id:uuid,p_done:boolean,p_request_id:uuid'
  when 'reorder_long_quests' then 'p_ids:array' when 'chain-delete' then 'p_id:uuid'
  when 'gym-routine-save' then 'p_id:uuid,p_create:boolean,p_name:string,p_unit:string'
  when 'gym-routine-archive' then 'p_id:uuid,p_archived:boolean'
  when 'save_gym_exercise' then 'p_id:uuid,p_input:object'
  when 'remove_gym_exercise' then 'p_id:uuid'
  when 'delete_gym_routine' then 'p_routine_id:uuid,p_discard_draft:boolean'
  when 'reorder_gym_exercises' then 'p_routine_id:uuid,p_ids:array'
  when 'start_gym_session' then 'p_routine_id:uuid'
  when 'save_gym_session' then 'p_session_id:uuid,p_weights:array,p_finish:boolean'
  when 'discard_gym_session' then 'p_session_id:uuid'
  when 'log_gym_weight' then 'p_log_id:uuid,p_exercise_id:uuid,p_weight:number'
  when 'prepare-day' then '' end;
 if spec is null then raise exception 'Invalid tracker operation.' using errcode='22023'; end if;
 select coalesce(array_agg(split_part(t,':',1)),'{}') into keys from unnest(string_to_array(spec,',')) t where t<>'';
 perform private.tracker_object_keys(p_arguments,keys||array['p_expected_targets']);
 a:=p_arguments-'p_expected_targets'; snapshots:=p_arguments->'p_expected_targets';
 if spec<>'' then perform private.tracker_argument_types(a,spec); end if;
 if jsonb_typeof(snapshots) is distinct from 'array' then raise exception 'Invalid tracker targets.' using errcode='22023'; end if;
 if a ? 'p_ids' then
  for item in select * from jsonb_array_elements(a->'p_ids') loop perform private.tracker_argument_types(jsonb_build_object('id',item),'id:uuid'); ids:=array_append(ids,(item#>>'{}')::uuid); end loop;
  if cardinality(ids)<>(select count(distinct id) from unnest(ids) id) then raise exception 'Duplicate targets.' using errcode='22023'; end if;
 end if;
 if p_operation in ('habit-save','chain-save') then
  mode:=a->>'p_mode';create_new:=(a->>'p_create')::boolean;
  if mode not in ('basic','custom') then raise exception 'Invalid tracker mode.' using errcode='22023'; end if;
  requires_custom:=mode='custom';
 end if;
 kind:=case when p_operation in ('habit-save','complete_habit','undo_habit_completion','increment_habit_progress','complete_habit_recovery','archive_habit','restore_habit','delete_habit','move_backlog_to_one_time','move_one_time_to_backlog','reorder_quests') then 'habit'
  when p_operation in ('chain-save','set_long_quest_stage_done_receipt','reorder_long_quests','chain-delete') then 'chain' end;
 if kind is not null and p_operation not in ('reorder_quests','reorder_long_quests') and not create_new then
  if p_operation='set_long_quest_stage_done_receipt' then
   select long_quest_id into root from public.long_quest_stages where id=(a->>'p_stage_id')::uuid and user_id=uid;
   if root is null then raise exception 'Tracker target unavailable.' using errcode='42501'; end if;
  else root:=coalesce(a->>'p_habit_id',a->>'p_id')::uuid; end if;
  ids:=array[root];
 end if;
 if kind is not null then
  if kind='habit' then
   perform 1 from public.habits where id=any(ids) and user_id=uid order by id for update;
   if (select count(*) from public.habits where id=any(ids) and user_id=uid)<>cardinality(ids) then raise exception 'Tracker target unavailable.' using errcode='42501'; end if;
  else
   perform 1 from public.long_quests where id=any(ids) and user_id=uid order by id for update;
   if (select count(*) from public.long_quests where id=any(ids) and user_id=uid)<>cardinality(ids) then raise exception 'Tracker target unavailable.' using errcode='42501'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',id,'inputKind',coalesce(p.input_kind,'custom')) order by id),'[]') into expected
   from unnest(ids) id left join private.tracker_input_provenance p on p.object_kind=kind and p.object_id=id and p.user_id=uid;
  requires_custom:=requires_custom or exists(select 1 from jsonb_array_elements(expected) e where e->>'inputKind'='custom');
 else expected:='[]'; end if;
 for item in select * from jsonb_array_elements(snapshots) loop
  perform private.tracker_object_keys(item,array['kind','id','inputKind']);
  perform private.tracker_argument_types(item,'kind:string,id:uuid,inputKind:string');
 end loop;
 if jsonb_array_length(snapshots)<>jsonb_array_length(expected) or not(snapshots @> expected and expected @> snapshots) then
  raise exception 'Tracker access changed.' using errcode='ET003';
 end if;
 fitness:=p_operation in ('gym-routine-save','gym-routine-archive','save_gym_exercise','remove_gym_exercise','delete_gym_routine','reorder_gym_exercises','start_gym_session','save_gym_session','discard_gym_session','log_gym_weight');
 if requires_custom or fitness then
  if s->'revision' is distinct from p_expected then raise exception 'Tracker access changed.' using errcode='ET003'; end if;
  if requires_custom and not(s->>'canWriteCustom')::boolean or fitness and not(s->>'canWriteFitness')::boolean then raise exception 'Tracker processing permission required.' using errcode='ET002'; end if;
 end if;
 if fitness and p_operation<>'gym-routine-save' then
  if p_operation='save_gym_exercise' then
   perform private.tracker_object_keys(a->'p_input',array['routine_id','name','position','sets','reps','rest_seconds','rir','notes'],array['id','user_id','rir_max','media_path','media_mime']);
   perform private.tracker_argument_types(a->'p_input','routine_id:uuid,name:string,position:integer,sets:integer,reps:string,rest_seconds:integer,rir:integer,notes:string');
   if a#>>'{p_input,id}' is not null then
    perform private.tracker_argument_types(a->'p_input','id:uuid');
    if a#>'{p_input,id}'<>a->'p_id' then raise exception 'Invalid tracker input.' using errcode='22023'; end if;
   end if;
   if a#>>'{p_input,user_id}' is not null and a#>>'{p_input,user_id}'<>uid::text then raise exception 'Account changed.' using errcode='42501'; end if;
   if a#>>'{p_input,rir_max}' is not null then perform private.tracker_argument_types(a->'p_input','rir_max:integer'); end if;
   if a#>>'{p_input,media_path}' is not null then perform private.tracker_argument_types(a->'p_input','media_path:string'); end if;
   if a#>>'{p_input,media_mime}' is not null then perform private.tracker_argument_types(a->'p_input','media_mime:string'); end if;
   root:=(a#>>'{p_input,routine_id}')::uuid;
  elsif p_operation in ('remove_gym_exercise','log_gym_weight') then
   select routine_id into root from public.gym_exercises where id=coalesce(a->>'p_id',a->>'p_exercise_id')::uuid and user_id=uid;
  elsif p_operation in ('save_gym_session','discard_gym_session') then
   select routine_id into root from public.gym_sessions where id=(a->>'p_session_id')::uuid and user_id=uid;
  else root:=coalesce(a->>'p_routine_id',a->>'p_id')::uuid; end if;
  perform 1 from public.gym_routines where id=root and user_id=uid for update;
  if not found then raise exception 'Tracker target unavailable.' using errcode='42501'; end if;
  if p_operation='save_gym_session' then
   for item in select * from jsonb_array_elements(a->'p_weights') loop
    perform private.tracker_object_keys(item,array['exercise_id','weight']);
    perform private.tracker_argument_types(item,'exercise_id:uuid');
    if item->>'weight' is not null then perform private.tracker_argument_types(item,'weight:number'); end if;
   end loop;
  end if;
 end if;
 -- Static dispatch only. Retained routines continue their owner/date/reward checks.
 case p_operation
  when 'habit-save' then result:=to_jsonb(private.save_tracker_habit((a->>'p_id')::uuid,(a->>'p_create')::boolean,mode,a->'p_input'));
  when 'complete_habit' then perform public.complete_habit((a->>'p_habit_id')::uuid,(a->>'p_completed_on')::date,(a->>'p_kind')::public.completion_kind);
  when 'undo_habit_completion' then perform public.undo_habit_completion((a->>'p_habit_id')::uuid,(a->>'p_completed_on')::date);
  when 'increment_habit_progress' then result:=to_jsonb(public.increment_habit_progress((a->>'p_habit_id')::uuid,(a->>'p_date')::date,(a->>'p_delta')::integer));
  when 'complete_habit_recovery' then result:=public.complete_habit_recovery((a->>'p_habit_id')::uuid);
  when 'archive_habit' then perform public.archive_habit((a->>'p_habit_id')::uuid);
  when 'restore_habit' then perform public.restore_habit((a->>'p_habit_id')::uuid);
  when 'delete_habit' then perform public.delete_habit((a->>'p_habit_id')::uuid);
  when 'move_backlog_to_one_time' then perform public.move_backlog_to_one_time((a->>'p_id')::uuid);
  when 'move_one_time_to_backlog' then perform public.move_one_time_to_backlog((a->>'p_id')::uuid);
  when 'reorder_quests' then perform public.reorder_quests(a->>'p_quest_type',ids);
  when 'chain-save' then result:=to_jsonb(private.save_tracker_chain((a->>'p_id')::uuid,(a->>'p_request_id')::uuid,(a->>'p_create')::boolean,mode,a->'p_input'));
  when 'set_long_quest_stage_done_receipt' then result:=public.set_long_quest_stage_done_receipt((a->>'p_stage_id')::uuid,(a->>'p_done')::boolean,(a->>'p_request_id')::uuid);
  when 'reorder_long_quests' then perform public.reorder_long_quests(ids);
  when 'chain-delete' then delete from public.long_quests where id=(a->>'p_id')::uuid and user_id=uid;
  when 'gym-routine-save' then
   select * into r from public.gym_routines where id=(a->>'p_id')::uuid for update;
   if r.id is not null and r.user_id<>uid or r.id is null and not(a->>'p_create')::boolean then raise exception 'Tracker target unavailable.' using errcode='42501'; end if;
   if r.id is not null and (a->>'p_create')::boolean then
    if r.name is distinct from a->>'p_name' or r.unit is distinct from a->>'p_unit' or r.deleted_at is not null then raise exception 'Creation input changed.' using errcode='22023'; end if;
   elsif r.id is null then insert into public.gym_routines(id,user_id,name,unit) values((a->>'p_id')::uuid,uid,a->>'p_name',a->>'p_unit');
   else update public.gym_routines set name=a->>'p_name',unit=a->>'p_unit' where id=r.id and deleted_at is null; end if;
   result:=to_jsonb((a->>'p_id')::uuid);
  when 'gym-routine-archive' then
   update public.gym_routines set archived=(a->>'p_archived')::boolean where id=(a->>'p_id')::uuid and user_id=uid and deleted_at is null;
   if not found then raise exception 'Tracker target unavailable.' using errcode='42501'; end if;
  when 'save_gym_exercise' then result:=to_jsonb(public.save_gym_exercise((a->>'p_id')::uuid,a->'p_input'));
  when 'remove_gym_exercise' then perform public.remove_gym_exercise((a->>'p_id')::uuid);
  when 'delete_gym_routine' then perform public.delete_gym_routine((a->>'p_routine_id')::uuid,(a->>'p_discard_draft')::boolean);
  when 'reorder_gym_exercises' then perform public.reorder_gym_exercises((a->>'p_routine_id')::uuid,ids);
  when 'start_gym_session' then result:=to_jsonb(public.start_gym_session((a->>'p_routine_id')::uuid));
  when 'save_gym_session' then perform public.save_gym_session((a->>'p_session_id')::uuid,a->'p_weights',(a->>'p_finish')::boolean);
  when 'discard_gym_session' then perform public.discard_gym_session((a->>'p_session_id')::uuid);
  when 'log_gym_weight' then perform public.log_gym_weight((a->>'p_log_id')::uuid,(a->>'p_exercise_id')::uuid,(a->>'p_weight')::numeric);
  when 'prepare-day' then result:=private.prepare_tracker_day(uid,s->'revision'=p_expected);
 end case;
 return coalesce(result,'null'::jsonb);
exception when check_violation or not_null_violation or unique_violation or foreign_key_violation
 or invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
 raise exception 'Invalid tracker input.' using errcode='22023';
end;$$;
revoke all on function public.apply_tracker_write(text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.apply_tracker_write(text,jsonb,jsonb) to authenticated;

revoke insert,update,delete on public.habits,public.habit_completions,public.stats,public.streaks,
 public.long_quests,public.long_quest_stages,public.weekly_quests,public.habit_progress,public.habit_schedule_versions,
 public.habit_occurrences,public.habit_recovery_windows,public.deleted_habit_history,public.habit_archive_intervals,
 public.long_quest_rewards,public.gym_routines,public.gym_exercises,public.gym_sessions,public.gym_entries,public.gym_media_cleanup
 from public,anon,authenticated;
revoke all on function public.complete_habit(uuid,date,public.completion_kind),public.undo_habit_completion(uuid,date),
 public.increment_habit_progress(uuid,date,integer),public.complete_habit_recovery(uuid),public.archive_habit(uuid),public.restore_habit(uuid),public.delete_habit(uuid),
 public.move_backlog_to_one_time(uuid),public.move_one_time_to_backlog(uuid),public.reorder_quests(text,uuid[]),
 public.save_long_quest_definition(uuid,uuid,jsonb,boolean),public.reconcile_long_quest_stages(uuid,jsonb),
 public.set_long_quest_stage_done(uuid,boolean),public.set_long_quest_stage_done_receipt(uuid,boolean,uuid),public.reorder_long_quests(uuid[]),
 public.save_gym_exercise(uuid,jsonb),public.remove_gym_exercise(uuid),public.delete_gym_routine(uuid,boolean),public.reorder_gym_exercises(uuid,uuid[]),
 public.start_gym_session(uuid),public.save_gym_session(uuid,jsonb,boolean),public.discard_gym_session(uuid),public.log_gym_weight(uuid,uuid,numeric),
 public.ensure_habit_occurrences(date),public.reconcile_habit_recoveries(),public.rollover_unfinished_one_time_quests(),public.handle_new_user()
 from public,anon,authenticated;

-- Keep the retained definition receipt/reward/sequence contract while accepting
-- stable new stage IDs only through the revoked, trusted reconciliation path.
create or replace function public.reconcile_long_quest_stages(
  p_long_quest_id uuid,
  p_stages jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_strict_order boolean;
begin
  select coalesce(quest.strict_order, true) into v_strict_order
    from public.long_quests quest
    where quest.id = p_long_quest_id and quest.user_id = auth.uid()
    for update;
  if not found then
    raise exception 'long quest % not found for calling user', p_long_quest_id;
  end if;

  if jsonb_typeof(p_stages) <> 'array' then
    raise exception using errcode = 'P0001', message = 'Long Quest stages must be an array.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_stages) elem
    where elem->>'id' is not null
      and (exists (
        select 1 from public.long_quest_stages stage
        where stage.id = (elem->>'id')::uuid
          and (stage.long_quest_id <> p_long_quest_id or stage.user_id <> auth.uid())
      ) or (not exists(select 1 from public.long_quest_stages stage where stage.id=(elem->>'id')::uuid)
        and exists(select 1 from private.long_quest_definition_receipts receipt,
          lateral jsonb_array_elements(receipt.input->'stages') old_stage
          where old_stage->>'id'=elem->>'id')))
  ) then
    raise exception using errcode = 'P0001', message = 'Long Quest stage not found for calling user.';
  end if;

  if exists (
    select elem->>'id'
    from jsonb_array_elements(p_stages) elem
    where elem->>'id' is not null
    group by elem->>'id'
    having count(*) > 1
  ) then
    raise exception using errcode = 'P0001', message = 'Long Quest stage ids must be unique.';
  end if;

  update public.long_quest_stages
    set position = position + 10000
    where long_quest_id = p_long_quest_id;

  delete from public.long_quest_stages
    where long_quest_id = p_long_quest_id
      and id not in (
        select (elem->>'id')::uuid
        from jsonb_array_elements(p_stages) elem
        where elem->>'id' is not null
      );

  with incoming as (
    select
      (elem->>'id')::uuid as id,
      elem->>'name' as name,
      elem->>'description' as description,
      (ord - 1)::smallint as position
    from jsonb_array_elements(p_stages) with ordinality as item(elem, ord)
  )
  update public.long_quest_stages stage
    set name = incoming.name,
        description = incoming.description,
        position = incoming.position
    from incoming
    where stage.id = incoming.id and stage.long_quest_id = p_long_quest_id;

  insert into public.long_quest_stages (id, long_quest_id, user_id, name, description, position)
    select coalesce((elem->>'id')::uuid,gen_random_uuid()), p_long_quest_id, auth.uid(), elem->>'name', elem->>'description', (ord - 1)::smallint
    from jsonb_array_elements(p_stages) with ordinality as item(elem, ord)
    where elem->>'id' is null or not exists(select 1 from public.long_quest_stages stage where stage.id=(elem->>'id')::uuid);

  if v_strict_order and exists (
    select 1
    from public.long_quest_stages completed
    where completed.long_quest_id = p_long_quest_id
      and completed.done
      and exists (
        select 1
        from public.long_quest_stages predecessor
        where predecessor.long_quest_id = completed.long_quest_id
          and predecessor.position < completed.position
          and not predecessor.done
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Long Quest stages must form a completed prefix.';
  end if;
end;
$$;
revoke all on function public.reconcile_long_quest_stages(uuid,jsonb) from public,anon,authenticated,service_role;

commit;
