begin;

-- Normalize only boundary whitespace and formatting separators. Internal
-- joiners remain intact so scripts and joined emoji are not rewritten.
create or replace function public.trim_profile_text(p_text text)
returns text
language sql
immutable
strict
set search_path = ''
as $function$
  select btrim(p_text,
    chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||
    chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||
    chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||
    chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)||
    chr(8203)||chr(8204)||chr(8205)||chr(8288)
  );
$function$;

revoke all on function public.trim_profile_text(text) from public, anon;
grant execute on function public.trim_profile_text(text) to authenticated;

-- Keep grandfathered values intact on unrelated profile updates. Only
-- changed profile fields are boundary-normalized and checked.
create or replace function public.validate_profile_edit_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' or new.display_name is distinct from old.display_name then
    new.display_name := public.trim_profile_text(coalesce(new.display_name, ''));
    if char_length(new.display_name) = 0 then
      raise exception 'Enter a display name.';
    end if;
    if char_length(new.display_name) > 80 then
      raise exception 'Display name must be 80 characters or fewer.';
    end if;
  end if;
  if tg_op = 'INSERT' or new.user_class is distinct from old.user_class then
    new.user_class := public.trim_profile_text(coalesce(new.user_class, ''));
    if char_length(new.user_class) = 0 then
      raise exception 'Enter a class.';
    end if;
    if char_length(new.user_class) > 80 then
      raise exception 'Class must be 80 characters or fewer.';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.validate_profile_edit_text() from public, anon, authenticated;

create or replace function public.update_profile(
  p_display_name text,
  p_user_class text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_display_name text;
  v_user_class text;
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  select * into v_profile from public.profiles where user_id = v_user_id;
  if not found then raise exception 'profile not found'; end if;

  v_display_name := case when p_display_name is not distinct from v_profile.display_name
    then v_profile.display_name else public.trim_profile_text(coalesce(p_display_name, '')) end;
  v_user_class := case when p_user_class is not distinct from v_profile.user_class
    then v_profile.user_class else public.trim_profile_text(coalesce(p_user_class, '')) end;

  if v_display_name is distinct from v_profile.display_name and char_length(v_display_name) = 0 then
    raise exception 'Enter a display name.';
  end if;
  if v_display_name is distinct from v_profile.display_name and char_length(v_display_name) > 80 then
    raise exception 'Display name must be 80 characters or fewer.';
  end if;
  if v_user_class is distinct from v_profile.user_class and char_length(v_user_class) = 0 then
    raise exception 'Enter a class.';
  end if;
  if v_user_class is distinct from v_profile.user_class and char_length(v_user_class) > 80 then
    raise exception 'Class must be 80 characters or fewer.';
  end if;

  update public.profiles
  set display_name = v_display_name,
      user_class = v_user_class
  where user_id = v_user_id
  returning * into v_profile;

  if not found then
    raise exception 'profile not found';
  end if;

  return pg_catalog.jsonb_build_object(
    'displayName', v_profile.display_name,
    'userClass', v_profile.user_class,
    'timeZone', v_profile.time_zone
  );
end;
$function$;

revoke all on function public.update_profile(text, text) from public, anon;
grant execute on function public.update_profile(text, text) to authenticated;

-- One validator protects both habit and Long Quest inserts and actual name
-- changes. Unchanged pre-existing long values stay usable without a rewrite.
create or replace function public.validate_quest_name_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' or new.name is distinct from old.name then
    new.name := public.trim_profile_text(coalesce(new.name, ''));
    if char_length(new.name) = 0 then
      raise exception 'Enter a quest name.';
    end if;
    if char_length(new.name) > 80 then
      raise exception 'Quest name must be 80 characters or fewer.';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.validate_quest_name_edit() from public, anon, authenticated;

drop trigger if exists habits_validate_name_length on public.habits;
create trigger habits_validate_name_length
  before insert or update of name on public.habits
  for each row execute function public.validate_quest_name_edit();

drop trigger if exists long_quests_validate_name_length on public.long_quests;
create trigger long_quests_validate_name_length
  before insert or update of name on public.long_quests
  for each row execute function public.validate_quest_name_edit();

commit;
