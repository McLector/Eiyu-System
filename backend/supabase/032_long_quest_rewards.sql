-- Plan 011. Ledger survives definition deletion; only account deletion cascades.
begin;
create table public.long_quest_rewards (
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id uuid not null,
  reward_key uuid not null,
  kind text not null check (kind in ('stage', 'bonus')),
  stat public.stat_key not null,
  amount integer not null check (amount in (0, 20)),
  active boolean not null default false,
  legacy_exempt boolean not null default false,
  primary key (user_id, reward_key, kind),
  check (not legacy_exempt or (amount = 0 and not active))
);
create index long_quest_rewards_quest on public.long_quest_rewards(user_id, quest_id);
alter table public.long_quest_rewards enable row level security;
revoke all on public.long_quest_rewards from public, anon, authenticated;
grant select on public.long_quest_rewards to authenticated;
create policy rewards_read_own on public.long_quest_rewards for select to authenticated using ((select auth.uid()) = user_id);

insert into public.long_quest_rewards(user_id, quest_id, reward_key, kind, stat, amount, legacy_exempt)
select q.user_id, q.id, s.id, 'stage', q.stat, 0, true
from public.long_quests q join public.long_quest_stages s on s.long_quest_id=q.id where s.done;
insert into public.long_quest_rewards(user_id, quest_id, reward_key, kind, stat, amount, legacy_exempt)
select user_id, id, id, 'bonus', stat, 0, true from public.long_quests where completed_at is not null;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create function private.award_long_quest_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  q public.long_quests;
  reward public.long_quest_rewards;
begin
  -- Trusted fixture/service writes without an account context do not award XP.
  if auth.uid() is null then return new; end if;
  select * into q from public.long_quests where id=new.long_quest_id for update;
  if q.id is null or q.user_id is distinct from auth.uid() or new.user_id is distinct from q.user_id then
    raise exception 'Long Quest stage not found for calling user.';
  end if;
  if tg_op='UPDATE' and new.done=old.done then return new; end if;

  -- Deterministic stat lock order protects mixed-stat undo and concurrent quests.
  perform 1 from public.stats where user_id=q.user_id order by stat for update;
  if new.done then
    insert into public.long_quest_rewards(user_id, quest_id, reward_key, kind, stat, amount)
      values(q.user_id,q.id,new.id,'stage',q.stat,20) on conflict do nothing;
    select * into reward from public.long_quest_rewards where user_id=q.user_id and reward_key=new.id and kind='stage' for update;
    if not reward.active and not reward.legacy_exempt then
      update public.stats set xp=xp+reward.amount, updated_at=now() where user_id=q.user_id and stat=reward.stat;
      update public.long_quest_rewards set active=true where user_id=q.user_id and reward_key=new.id and kind='stage';
    end if;
    if not exists(select 1 from public.long_quest_stages where long_quest_id=q.id and not done) then
      insert into public.long_quest_rewards(user_id,quest_id,reward_key,kind,stat,amount)
        values(q.user_id,q.id,q.id,'bonus',q.stat,20) on conflict do nothing;
      select * into reward from public.long_quest_rewards where user_id=q.user_id and reward_key=q.id and kind='bonus' for update;
      if not reward.active and not reward.legacy_exempt then
        update public.stats set xp=xp+reward.amount,updated_at=now() where user_id=q.user_id and stat=reward.stat;
        update public.long_quest_rewards set active=true where user_id=q.user_id and reward_key=q.id and kind='bonus';
      end if;
    end if;
  else
    for reward in select * from public.long_quest_rewards
      where user_id=q.user_id and active and ((reward_key=new.id and kind='stage') or (reward_key=q.id and kind='bonus')) for update
    loop
      update public.stats set xp=greatest(0,xp-reward.amount),updated_at=now() where user_id=q.user_id and stat=reward.stat;
      update public.long_quest_rewards set active=false where user_id=q.user_id and reward_key=reward.reward_key and kind=reward.kind;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.award_long_quest_stage() from public, anon, authenticated;
create trigger award_long_quest_stage after insert or update of done on public.long_quest_stages
for each row execute function private.award_long_quest_stage();
commit;
