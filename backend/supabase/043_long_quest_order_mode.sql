-- 043_long_quest_order_mode.sql
-- A Long Quest ("chain") can be done in order (the behaviour so far: a stage
-- unlocks after the one before it, and only the last done stage can be undone)
-- or in any order. The mode is per quest, `strict_order`, and defaults to true
-- so every existing chain keeps its current behaviour. A chain is complete when
-- every stage is done, in either mode; rewards and the first-completion marker
-- never depended on order and are untouched.
--
-- Free to in order is only allowed when the done stages already form a prefix.
-- The save RPC refuses otherwise with a clear message, and a deferred
-- constraint trigger enforces the same rule for a direct table write.
--
-- Apply by hand in the SQL editor, after 042, and BEFORE pushing the web app or
-- shipping a mobile build that sends the mode (the clients tolerate the column
-- being absent, but the toggle only takes effect once this is applied). One
-- transaction: if any statement fails (for example because the deployed schema
-- has drifted from the committed files), nothing is applied.
--
-- Before applying, compare the deployed bodies of assert_long_quest_stage_sequence,
-- guard_long_quest_stage_sequence, set_long_quest_stage_done,
-- reconcile_long_quest_stages (all 023) and save_long_quest_definition (037):
-- this file re-issues all five. (Checked 2026-10-07: the live bodies match the
-- committed files apart from CRLF line endings.)
--
-- Every read of the mode is coalesce(strict_order, true): a quest row the caller
-- cannot see counts as in order, never as free.
--
-- Rollback: re-run the function bodies from 023 (assert_long_quest_stage_sequence,
-- guard_long_quest_stage_sequence, set_long_quest_stage_done,
-- reconcile_long_quest_stages) and 037 (save_long_quest_definition), then
--   drop trigger validate_long_quest_order_mode on public.long_quests;
--   drop function public.validate_long_quest_order_mode();
--   alter table public.long_quests drop column strict_order;
-- Dropping the column turns every chain back to in order; if a free chain has
-- stages done out of order, normalize it first (023 normalize_long_quest_stage_sequences).
begin;

alter table public.long_quests
  add column if not exists strict_order boolean not null default true;

create or replace function public.assert_long_quest_stage_sequence(p_long_quest_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select quest.strict_order from public.long_quests quest where quest.id = p_long_quest_id), true) then
    return;
  end if;

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
  v_strict_order boolean;
begin
  -- Parent/user deletion cascades are already authoritative and must be able
  -- to remove a completed prefix without depending on child row order.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  -- Serialize every stage mutation for a quest, including direct table writes.
  select quest.strict_order into v_strict_order
    from public.long_quests quest where quest.id = v_quest_id for update;
  v_strict_order := coalesce(v_strict_order, true);

  -- A quest done in any order has no sequence to protect; the lock above still
  -- serializes the write.
  if not v_strict_order then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

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

create or replace function public.set_long_quest_stage_done(p_stage_id uuid, p_done boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_long_quest_id uuid;
  v_strict_order boolean;
  v_position smallint;
  v_done boolean;
begin
  select quest.id, quest.strict_order
    into v_long_quest_id, v_strict_order
    from public.long_quests quest
    join public.long_quest_stages stage on stage.long_quest_id = quest.id
    where stage.id = p_stage_id and quest.user_id = auth.uid()
    for update of quest;

  if v_long_quest_id is null then
    raise exception using errcode = 'P0001', message = 'Long Quest stage not found for calling user.';
  end if;
  v_strict_order := coalesce(v_strict_order, true);

  select position, done into v_position, v_done
    from public.long_quest_stages
    where id = p_stage_id and long_quest_id = v_long_quest_id;

  if v_done = p_done then
    return;
  end if;

  if v_strict_order and p_done and exists (
    select 1 from public.long_quest_stages
    where long_quest_id = v_long_quest_id and position < v_position and not done
  ) then
    raise exception using errcode = 'P0001', message = 'Complete earlier stages first.';
  end if;

  if v_strict_order and not p_done and exists (
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

revoke all on function public.reconcile_long_quest_stages(uuid, jsonb) from public, anon;
grant execute on function public.reconcile_long_quest_stages(uuid, jsonb) to authenticated;

-- Direct writes cannot turn a quest with a gap into one done in order. Deferred,
-- so a single transaction may remove the open stage that causes the gap and
-- switch the mode together.
create or replace function public.validate_long_quest_order_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_long_quest_stage_sequence(new.id);
  return null;
end;
$$;

revoke all on function public.validate_long_quest_order_mode() from public, anon, authenticated;

drop trigger if exists validate_long_quest_order_mode on public.long_quests;
create constraint trigger validate_long_quest_order_mode
after update of strict_order on public.long_quests
deferrable initially deferred
for each row
when (new.strict_order is distinct from old.strict_order)
execute function public.validate_long_quest_order_mode();

-- 037 body, plus the mode. The key `strictOrder` is optional: a client that does
-- not send it (an older build) leaves the mode as it is, and a new quest starts
-- in order. The mode is switched after the stages are reconciled so that the
-- stage edits are checked under the old mode and a clear message can be given.
create or replace function public.save_long_quest_definition(p_id uuid,p_request_id uuid,p_input jsonb,p_create boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare q public.long_quests; prior private.long_quest_definition_receipts; normalized text; item jsonb; old_stage_name text; v_strict_order boolean;
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
  v_strict_order:=case when jsonb_typeof(p_input->'strictOrder')='boolean' then (p_input->>'strictOrder')::boolean else coalesce(q.strict_order,true) end;
  if q.id is null then
    insert into public.long_quests(id,user_id,name,stat,description,strict_order) values(p_id,auth.uid(),normalized,(p_input->>'stat')::public.stat_key,p_input->>'description',v_strict_order);
  else
    update public.long_quests set name=normalized,stat=(p_input->>'stat')::public.stat_key,description=p_input->>'description' where id=p_id;
  end if;
  perform public.reconcile_long_quest_stages(p_id,p_input->'stages');
  update public.long_quests set strict_order=v_strict_order where id=p_id and strict_order is distinct from v_strict_order;
  if v_strict_order and exists (
    select 1 from public.long_quest_stages done_stage where done_stage.long_quest_id=p_id and done_stage.done and exists (
      select 1 from public.long_quest_stages open_stage where open_stage.long_quest_id=p_id and open_stage.position<done_stage.position and not open_stage.done
    )
  ) then
    raise exception using errcode='P0001', message='Mark the later done stages not done before keeping stages in order.';
  end if;
  perform public.assert_long_quest_stage_sequence(p_id);
  insert into private.long_quest_definition_receipts values(auth.uid(),p_request_id,p_id,p_input);
  return p_id;
end; $$;

commit;
