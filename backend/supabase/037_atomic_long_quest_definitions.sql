begin;
create table private.long_quest_definition_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  quest_id uuid not null,
  input jsonb not null,
  primary key(user_id,request_id)
);
alter table private.long_quest_definition_receipts enable row level security;
revoke all on private.long_quest_definition_receipts from public,anon,authenticated;
create function public.get_long_quest_definition_receipt(p_request_id uuid) returns uuid
language sql security definer set search_path='' as $$
  select quest_id from private.long_quest_definition_receipts where user_id=auth.uid() and request_id=p_request_id;
$$;
create function public.save_long_quest_definition(p_id uuid,p_request_id uuid,p_input jsonb,p_create boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare q public.long_quests; prior private.long_quest_definition_receipts; normalized text; item jsonb; old_stage_name text;
begin
  if auth.uid() is null or p_id is null or p_request_id is null then raise exception 'Authenticated request required.'; end if;
  -- Serializes even before a new parent exists; owner included in the key.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_id::text,0));
  select * into prior from private.long_quest_definition_receipts where user_id=auth.uid() and request_id=p_request_id;
  if found then
    if prior.quest_id<>p_id or prior.input<>p_input then raise exception 'Reconcile the previous save before changing the request.'; end if;
    return prior.quest_id;
  end if;
  select * into q from public.long_quests where id=p_id for update;
  if q.id is not null and q.user_id<>auth.uid() then raise exception 'Long Quest not found.'; end if;
  if (q.id is null and not p_create) or (q.id is not null and p_create) then raise exception 'Long Quest creation state changed.'; end if;
  if p_input->'stages' is null or jsonb_typeof(p_input->'stages')<>'array' or jsonb_array_length(p_input->'stages')=0 then raise exception 'Add at least one stage.'; end if;
  if exists (select 1 from public.long_quest_stages s where s.long_quest_id=p_id and s.done and not exists (
    select 1 from jsonb_array_elements(p_input->'stages') stage_input where stage_input->>'id'=s.id::text
  )) then raise exception 'Completed stages must be retained.'; end if;
  for item in select * from jsonb_array_elements(p_input->'stages') loop
    select name into old_stage_name from public.long_quest_stages where id=nullif(item->>'id','')::uuid and long_quest_id=p_id;
    if old_stage_name is null or item->>'name' is distinct from old_stage_name then
      normalized:=public.trim_profile_text(item->>'name');
      if normalized is null or length(normalized)=0 or length(normalized)>80 or length(regexp_replace(normalized,'[[:space:]]','','g'))=0 then raise exception 'Stage name must contain visible text and be 80 characters or fewer.'; end if;
    end if;
  end loop;
  normalized:=p_input->>'name';
  if q.id is null or normalized is distinct from q.name then
    normalized:=public.trim_profile_text(normalized);
    if normalized is null or length(normalized)=0 or length(normalized)>80 or length(regexp_replace(normalized,'[[:space:]]','','g'))=0 then raise exception 'Quest name must contain visible text and be 80 characters or fewer.'; end if;
  end if;
  if q.id is null then
    insert into public.long_quests(id,user_id,name,stat,description) values(p_id,auth.uid(),normalized,(p_input->>'stat')::public.stat_key,p_input->>'description');
  else
    update public.long_quests set name=normalized,stat=(p_input->>'stat')::public.stat_key,description=p_input->>'description' where id=p_id;
  end if;
  perform public.reconcile_long_quest_stages(p_id,p_input->'stages');
  perform public.assert_long_quest_stage_sequence(p_id);
  insert into private.long_quest_definition_receipts values(auth.uid(),p_request_id,p_id,p_input);
  return p_id;
end; $$;
revoke all on function public.get_long_quest_definition_receipt(uuid),public.save_long_quest_definition(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.get_long_quest_definition_receipt(uuid),public.save_long_quest_definition(uuid,uuid,jsonb,boolean) to authenticated;
commit;
