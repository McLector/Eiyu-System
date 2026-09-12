-- Phase 5: Long Quest stages are an ordered, authoritative state machine.
-- Existing out-of-order history is preserved by treating every predecessor
-- of an already-completed stage as satisfied before enforcement is enabled.

alter table public.long_quests
  add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'long_quests_id_user_id_key'
      and conrelid = 'public.long_quests'::regclass
  ) then
    alter table public.long_quests
      add constraint long_quests_id_user_id_key unique (id, user_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'long_quest_stages_quest_owner_fkey'
      and conrelid = 'public.long_quest_stages'::regclass
  ) then
    alter table public.long_quest_stages
      add constraint long_quest_stages_quest_owner_fkey
      foreign key (long_quest_id, user_id)
      references public.long_quests (id, user_id)
      on delete cascade;
  end if;
end;
$$;

create or replace function public.normalize_long_quest_stage_sequences()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with furthest_completed as (
    select long_quest_id, max(position) as position
    from public.long_quest_stages
    where done
    group by long_quest_id
  )
  update public.long_quest_stages stage
    set done = true
    from furthest_completed completed
    where stage.long_quest_id = completed.long_quest_id
      and stage.position <= completed.position
      and not stage.done;

  update public.long_quests quest
    set completed_at = coalesce(quest.completed_at, now())
    where quest.completed_at is null
      and exists (
        select 1 from public.long_quest_stages stage
        where stage.long_quest_id = quest.id
      )
      and not exists (
        select 1 from public.long_quest_stages stage
        where stage.long_quest_id = quest.id and not stage.done
      );
end;
$$;

revoke all on function public.normalize_long_quest_stage_sequences() from public, anon, authenticated;

select public.normalize_long_quest_stage_sequences();

create or replace function public.assert_long_quest_stage_sequence(p_long_quest_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
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

revoke all on function public.assert_long_quest_stage_sequence(uuid) from public, anon, authenticated;

create or replace function public.guard_long_quest_stage_sequence()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quest_id uuid := case when tg_op = 'DELETE' then old.long_quest_id else new.long_quest_id end;
begin
  -- Parent/user deletion cascades are already authoritative and must be able
  -- to remove a completed prefix without depending on child row order.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  -- Serialize every stage mutation for a quest, including direct table writes.
  perform 1 from public.long_quests where id = v_quest_id for update;

  if tg_op = 'DELETE' then
    if old.done and exists (
      select 1 from public.long_quest_stages later
      where later.long_quest_id = old.long_quest_id
        and later.position > old.position
        and later.done
    ) then
      raise exception using errcode = 'P0001', message = 'Long Quest stages must form a completed prefix.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.done and exists (
      select 1 from public.long_quest_stages predecessor
      where predecessor.long_quest_id = new.long_quest_id
        and predecessor.position < new.position
        and predecessor.id <> new.id
        and not predecessor.done
    ) then
      raise exception using errcode = 'P0001', message = 'Complete earlier stages first.';
    end if;
  elsif not old.done and new.done and exists (
    select 1 from public.long_quest_stages predecessor
    where predecessor.long_quest_id = new.long_quest_id
      and predecessor.position < new.position
      and predecessor.id <> new.id
      and not predecessor.done
  ) then
    raise exception using errcode = 'P0001', message = 'Complete earlier stages first.';
  end if;

  if tg_op = 'INSERT' and not new.done and exists (
    select 1 from public.long_quest_stages later
    where later.long_quest_id = new.long_quest_id
      and later.position > new.position
      and later.done
  ) then
    raise exception using errcode = 'P0001', message = 'Long Quest stages must form a completed prefix.';
  end if;

  if tg_op = 'UPDATE' and old.done and not new.done and exists (
    select 1 from public.long_quest_stages later
    where later.long_quest_id = old.long_quest_id
      and later.position > old.position
      and later.done
  ) then
    raise exception using errcode = 'P0001', message = 'Undo later stages first.';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_long_quest_stage_sequence() from public, anon, authenticated;

drop trigger if exists guard_long_quest_stage_sequence on public.long_quest_stages;
create trigger guard_long_quest_stage_sequence
before insert or update or delete on public.long_quest_stages
for each row execute function public.guard_long_quest_stage_sequence();

create or replace function public.validate_long_quest_stage_sequence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_long_quest_stage_sequence(old.long_quest_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op <> 'UPDATE' or new.long_quest_id <> old.long_quest_id) then
    perform public.assert_long_quest_stage_sequence(new.long_quest_id);
  end if;
  return null;
end;
$$;

revoke all on function public.validate_long_quest_stage_sequence() from public, anon, authenticated;

drop trigger if exists validate_long_quest_stage_sequence on public.long_quest_stages;
create constraint trigger validate_long_quest_stage_sequence
after insert or update or delete on public.long_quest_stages
deferrable initially deferred
for each row execute function public.validate_long_quest_stage_sequence();

create or replace function public.mark_long_quest_first_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quest_id uuid := case when tg_op = 'DELETE' then old.long_quest_id else new.long_quest_id end;
begin
  update public.long_quests quest
    set completed_at = now()
    where quest.id = v_quest_id
      and quest.completed_at is null
      and exists (
        select 1 from public.long_quest_stages stage
        where stage.long_quest_id = quest.id
      )
      and not exists (
        select 1 from public.long_quest_stages stage
        where stage.long_quest_id = quest.id and not stage.done
      );
  return null;
end;
$$;

revoke all on function public.mark_long_quest_first_completion() from public, anon, authenticated;

drop trigger if exists mark_long_quest_first_completion on public.long_quest_stages;
create trigger mark_long_quest_first_completion
after insert or update or delete on public.long_quest_stages
for each row execute function public.mark_long_quest_first_completion();

create or replace function public.preserve_long_quest_first_completion()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.completed_at is not null and new.completed_at is distinct from old.completed_at then
    raise exception using errcode = 'P0001', message = 'Long Quest first completion is immutable.';
  end if;
  if old.completed_at is null and new.completed_at is not null and current_user not in ('postgres', 'service_role') then
    raise exception using errcode = 'P0001', message = 'Long Quest completion is server-managed.';
  end if;
  return new;
end;
$$;

revoke all on function public.preserve_long_quest_first_completion() from public, anon, authenticated;

drop trigger if exists preserve_long_quest_first_completion on public.long_quests;
create trigger preserve_long_quest_first_completion
before update of completed_at on public.long_quests
for each row execute function public.preserve_long_quest_first_completion();

create or replace function public.set_long_quest_stage_done(p_stage_id uuid, p_done boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_long_quest_id uuid;
  v_position smallint;
  v_done boolean;
begin
  select quest.id
    into v_long_quest_id
    from public.long_quests quest
    join public.long_quest_stages stage on stage.long_quest_id = quest.id
    where stage.id = p_stage_id and quest.user_id = auth.uid()
    for update of quest;

  if v_long_quest_id is null then
    raise exception using errcode = 'P0001', message = 'Long Quest stage not found for calling user.';
  end if;

  select position, done into v_position, v_done
    from public.long_quest_stages
    where id = p_stage_id and long_quest_id = v_long_quest_id;

  if v_done = p_done then
    return;
  end if;

  if p_done and exists (
    select 1 from public.long_quest_stages
    where long_quest_id = v_long_quest_id and position < v_position and not done
  ) then
    raise exception using errcode = 'P0001', message = 'Complete earlier stages first.';
  end if;

  if not p_done and exists (
    select 1 from public.long_quest_stages
    where long_quest_id = v_long_quest_id and position > v_position and done
  ) then
    raise exception using errcode = 'P0001', message = 'Undo later stages first.';
  end if;

  update public.long_quest_stages set done = p_done where id = p_stage_id;
end;
$$;

revoke all on function public.set_long_quest_stage_done(uuid, boolean) from public, anon;
grant execute on function public.set_long_quest_stage_done(uuid, boolean) to authenticated;

-- Replace the edit RPC so reorder/insert/delete operations share the same
-- quest lock and can only commit a completed-prefix sequence.
create or replace function public.reconcile_long_quest_stages(
  p_long_quest_id uuid,
  p_stages jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1
    from public.long_quests
    where id = p_long_quest_id and user_id = auth.uid()
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
      and not exists (
        select 1 from public.long_quest_stages stage
        where stage.id = (elem->>'id')::uuid
          and stage.long_quest_id = p_long_quest_id
          and stage.user_id = auth.uid()
      )
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

  insert into public.long_quest_stages (long_quest_id, user_id, name, description, position)
    select p_long_quest_id, auth.uid(), elem->>'name', elem->>'description', (ord - 1)::smallint
    from jsonb_array_elements(p_stages) with ordinality as item(elem, ord)
    where elem->>'id' is null;

  if exists (
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

revoke all on function public.reconcile_long_quest_stages(uuid, jsonb) from public, anon;
grant execute on function public.reconcile_long_quest_stages(uuid, jsonb) to authenticated;
