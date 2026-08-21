-- On signup, auto-create the profile row and all 5 stat rows so the app
-- never has to handle "user with no profile/stats yet" as a state.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'Adventurer'));

  insert into public.stats (user_id, stat)
  select new.id, unnest(enum_range(null::public.stat_key));

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
