-- Slice 3: transactional stage reconciliation for Long Quest edit.
-- long_quest_stages has `unique (long_quest_id, position)`, checked
-- per-statement (not deferred) — a naive per-row position UPDATE loop
-- can collide mid-statement on reorder/insert/remove. This RPC avoids
-- that with a two-phase position bump, and reconciles by stage id (not
-- delete-and-recreate) so `done` and `description` survive an edit.

create or replace function public.reconcile_long_quest_stages(
  p_long_quest_id uuid,
  p_stages jsonb -- [{ id: uuid | null, name: text, description: text | null }, ...] in final order
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- ownership check
  if not exists (select 1 from public.long_quests where id = p_long_quest_id and user_id = auth.uid()) then
    raise exception 'long quest % not found for calling user', p_long_quest_id;
  end if;

  -- phase 1: bump every existing row for this quest out of the way, so
  -- phase 2's final positions can never collide with a row still holding
  -- its old position (the `unique (long_quest_id, position)` constraint is
  -- checked per-statement, not deferred, so this two-phase shape is required).
  update public.long_quest_stages
    set position = position + 10000
    where long_quest_id = p_long_quest_id;

  -- delete stages that dropped out of the incoming list entirely. Must run
  -- before the insert below: the keep-set here is only the incoming
  -- non-null ids, which can never include a not-yet-created new stage's
  -- real id — running this after the insert would delete every stage just
  -- inserted for this call (id: null in the payload has no matching entry
  -- in "incoming non-null ids", however fresh its assigned id is).
  delete from public.long_quest_stages
    where long_quest_id = p_long_quest_id
      and id not in (select (elem->>'id')::uuid from jsonb_array_elements(p_stages) elem where elem->>'id' is not null);

  -- phase 2: upsert by id (preserves `done` for existing stages), insert new
  -- ones (id is null), at their final 0-based position from p_stages' order.
  with incoming as (
    select
      (elem->>'id')::uuid as id,
      elem->>'name' as name,
      elem->>'description' as description,
      (ord - 1) as position
    from jsonb_array_elements(p_stages) with ordinality as t(elem, ord)
  )
  update public.long_quest_stages s
    set name = i.name, description = i.description, position = i.position
    from incoming i
    where s.id = i.id and s.long_quest_id = p_long_quest_id;

  insert into public.long_quest_stages (long_quest_id, user_id, name, description, position)
    select p_long_quest_id, auth.uid(), i.name, i.description, i.position
    from (
      select elem->>'name' as name, elem->>'description' as description, (ord - 1) as position
      from jsonb_array_elements(p_stages) with ordinality as t(elem, ord)
      where (elem->>'id') is null
    ) i;
end;
$$;

grant execute on function public.reconcile_long_quest_stages(uuid, jsonb) to authenticated;
