-- Phase 6: keep stage descriptions optional while making normalization and
-- the 2000-character boundary authoritative for new writes. Existing rows are
-- left untouched so this additive migration does not rewrite user content.

create or replace function public.normalize_long_quest_stage_description()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.description is null then
    return new;
  end if;

  new.description := regexp_replace(
    new.description,
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );

  if new.description = '' then
    new.description := null;
  elsif char_length(new.description) > 2000 then
    raise exception using
      errcode = 'P0001',
      message = 'Stage descriptions must be 2000 characters or fewer.';
  end if;

  return new;
end;
$$;

revoke all on function public.normalize_long_quest_stage_description() from public, anon, authenticated;

drop trigger if exists normalize_long_quest_stage_description on public.long_quest_stages;
create trigger normalize_long_quest_stage_description
before insert or update of description on public.long_quest_stages
for each row execute function public.normalize_long_quest_stage_description();
