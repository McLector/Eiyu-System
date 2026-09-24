-- Profile editing is deliberately separate from timezone mutation. The
-- timezone RPC remains the only path that can change occurrence semantics.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_display_name_valid'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_display_name_valid
      check (char_length(btrim(display_name)) between 1 and 80);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_user_class_valid'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_user_class_valid
      check (char_length(btrim(user_class)) between 1 and 80);
  end if;
end;
$$;

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
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_user_class text := btrim(coalesce(p_user_class, ''));
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  if char_length(v_display_name) = 0 then
    raise exception 'Enter a display name.';
  end if;
  if char_length(v_display_name) > 80 then
    raise exception 'Display name must be 80 characters or fewer.';
  end if;
  if char_length(v_user_class) = 0 then
    raise exception 'Enter a class.';
  end if;
  if char_length(v_user_class) > 80 then
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
