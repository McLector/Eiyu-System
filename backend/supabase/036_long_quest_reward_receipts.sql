begin;
create table private.long_quest_reward_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  stage_id uuid not null,
  done boolean not null,
  receipt jsonb not null,
  primary key(user_id,request_id)
);
alter table private.long_quest_reward_receipts enable row level security;
revoke all on private.long_quest_reward_receipts from public,anon,authenticated;
create function public.get_long_quest_reward_receipt(p_request_id uuid) returns jsonb
language sql security definer set search_path='' as $$
  select receipt from private.long_quest_reward_receipts where user_id=auth.uid() and request_id=p_request_id;
$$;
create function public.set_long_quest_stage_done_receipt(p_stage_id uuid,p_done boolean,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare qid uuid; prior private.long_quest_reward_receipts; before_stats jsonb; before_rewards jsonb; components jsonb; totals jsonb; result jsonb; old_done boolean;
begin
  if auth.uid() is null or p_done is null or p_request_id is null then raise exception 'Authenticated request required.'; end if;
  select * into prior from private.long_quest_reward_receipts where user_id=auth.uid() and request_id=p_request_id;
  if found then
    if prior.stage_id<>p_stage_id or prior.done<>p_done then raise exception 'Request ID already used.'; end if;
    return prior.receipt || jsonb_build_object('replayed',true);
  end if;
  select q.id into qid from public.long_quests q join public.long_quest_stages s on s.long_quest_id=q.id where s.id=p_stage_id and q.user_id=auth.uid() for update of q;
  if qid is null then raise exception 'Long Quest stage not found for calling user.'; end if;
  -- A concurrent request may have committed while this caller awaited the parent.
  select * into prior from private.long_quest_reward_receipts where user_id=auth.uid() and request_id=p_request_id;
  if found then
    if prior.stage_id<>p_stage_id or prior.done<>p_done then raise exception 'Request ID already used.'; end if;
    return prior.receipt || jsonb_build_object('replayed',true);
  end if;
  select done into old_done from public.long_quest_stages where id=p_stage_id for update;
  perform 1 from public.stats where user_id=auth.uid() order by stat for update;
  select coalesce(jsonb_object_agg(stat,xp),'{}') into before_stats from public.stats where user_id=auth.uid();
  select coalesce(jsonb_object_agg(reward_key::text||kind,active),'{}') into before_rewards from public.long_quest_rewards where user_id=auth.uid() and quest_id=qid;
  perform public.set_long_quest_stage_done(p_stage_id,p_done);
  select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'stat',stat,'delta',case when active then amount else -amount end)),'[]') into components
    from public.long_quest_rewards where user_id=auth.uid() and quest_id=qid and not legacy_exempt
    and active is distinct from coalesce((before_rewards->>(reward_key::text||kind))::boolean,false);
  select coalesce(jsonb_agg(jsonb_build_object('stat',stat,'before',(before_stats->>stat::text)::integer,'after',xp,'delta',xp-(before_stats->>stat::text)::integer) order by stat),'[]') into totals
    from public.stats where user_id=auth.uid() and xp<>(before_stats->>stat::text)::integer;
  result:=jsonb_build_object('id',p_request_id,'stage_id',p_stage_id,'done',p_done,'changed',old_done<>p_done,'components',components,'totals',totals,'replayed',false);
  insert into private.long_quest_reward_receipts values(auth.uid(),p_request_id,p_stage_id,p_done,result);
  return result;
end; $$;
revoke all on function public.get_long_quest_reward_receipt(uuid),public.set_long_quest_stage_done_receipt(uuid,boolean,uuid) from public,anon,authenticated;
grant execute on function public.get_long_quest_reward_receipt(uuid),public.set_long_quest_stage_done_receipt(uuid,boolean,uuid) to authenticated;
commit;
