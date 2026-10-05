-- The colour palette follows the account. It is cosmetic: a nullable column, a format
-- check that does not list the palettes (a new palette must not need a migration),
-- and one owner-scoped RPC. Clients ignore a value they do not recognise.
alter table public.profiles add column if not exists palette text;

alter table public.profiles drop constraint if exists profiles_palette_format;
alter table public.profiles
  add constraint profiles_palette_format check (palette is null or palette ~ '^[a-z]{1,20}$');

-- 021 revoked all profile updates, 026 granted the two presentation columns. The
-- palette is a third; RLS still limits the row to auth.uid().
grant update (palette) on table public.profiles to authenticated;

create or replace function public.set_profile_palette(p_palette text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_palette text;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  if p_palette is null or p_palette !~ '^[a-z]{1,20}$' then
    raise exception 'Palette must be 1 to 20 lowercase letters.';
  end if;

  update public.profiles
  set palette = p_palette
  where user_id = v_user_id
  returning palette into v_palette;

  if not found then
    raise exception 'profile not found';
  end if;
  return v_palette;
end;
$$;

revoke all on function public.set_profile_palette(text) from public, anon;
grant execute on function public.set_profile_palette(text) to authenticated;
