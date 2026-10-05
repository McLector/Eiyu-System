-- The theme follows the account. profiles.theme has existed since 001 (not null, default 'dark', checked), but 021 revoked
-- profile updates and nothing granted this column, so no client could save it. Mirrors 040: one owner-scoped RPC.
-- Clients treat a failed save as "keep the choice on this device", so deploying either side first breaks nothing.
grant update (theme) on table public.profiles to authenticated;

create or replace function public.set_profile_theme(p_theme text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_theme text;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  if p_theme is null or p_theme not in ('dark', 'light') then
    raise exception 'Theme must be dark or light.';
  end if;

  update public.profiles
  set theme = p_theme
  where user_id = v_user_id
  returning theme into v_theme;

  if not found then
    raise exception 'profile not found';
  end if;
  return v_theme;
end;
$$;

revoke all on function public.set_profile_theme(text) from public, anon;
grant execute on function public.set_profile_theme(text) to authenticated;
