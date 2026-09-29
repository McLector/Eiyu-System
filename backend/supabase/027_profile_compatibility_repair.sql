-- Compatibility repair for databases that applied the original 026 before
-- its grandfathered-value upgrade path was corrected. Keep legacy values,
-- remove table CHECKs that can reject an unchanged legacy field, and install
-- the same changed-field validation/normalization as the corrected 026.
alter table public.profiles drop constraint if exists profiles_display_name_valid;
alter table public.profiles drop constraint if exists profiles_user_class_valid;

create or replace function public.trim_profile_text(p_text text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select btrim(p_text,
    chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||
    chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||
    chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||
    chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)
  );
$$;

revoke all on function public.trim_profile_text(text) from public, anon;
grant execute on function public.trim_profile_text(text) to authenticated;

-- Pre-026 accounts could contain longer values. A table CHECK would reject
-- an unchanged legacy value when another field changes, so validation lives
-- in the changed-field trigger below. No old data is rewritten.
create or replace function public.validate_profile_edit_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.display_name is distinct from old.display_name then
    new.display_name := public.trim_profile_text(coalesce(new.display_name, ''));
    if char_length(new.display_name) not between 1 and 80 then
      raise exception 'Display name must be between 1 and 80 characters.';
    end if;
  end if;
  if tg_op = 'INSERT' or new.user_class is distinct from old.user_class then
    new.user_class := public.trim_profile_text(coalesce(new.user_class, ''));
    if char_length(new.user_class) not between 1 and 80 then
      raise exception 'Class must be between 1 and 80 characters.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_validate_edit_text on public.profiles;
create trigger profiles_validate_edit_text
  before insert or update of display_name, user_class on public.profiles
  for each row execute function public.validate_profile_edit_text();

revoke all on function public.validate_profile_edit_text() from public, anon, authenticated;

-- 021 revoked all profile updates so clients could not bypass the timezone
-- state machine. Grant only the two presentation columns needed by this RPC;
-- RLS still limits the row to auth.uid().
grant update (display_name, user_class) on table public.profiles to authenticated;

create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update of display_name, user_class on public.profiles
  for each row execute function public.touch_profile_updated_at();

revoke all on function public.touch_profile_updated_at() from public, anon, authenticated;

create or replace function public.update_profile(
  p_display_name text,
  p_user_class text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
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

  return jsonb_build_object(
    'displayName', v_profile.display_name,
    'userClass', v_profile.user_class,
    'timeZone', v_profile.time_zone
  );
end;
$$;

revoke all on function public.update_profile(text, text) from public, anon;
grant execute on function public.update_profile(text, text) to authenticated;
