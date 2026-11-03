-- S01 experiment ONLY: not a product migration or complete auth endpoint.
-- Execute inside supabase_db_eiyu-s01-auth-demo, never --linked.
begin;
do $$
begin
  if pg_catalog.current_setting('s01.fixture_target', true)
      is distinct from 'eiyu-s01-auth-demo' then
    raise exception 'S01 fixture target not authorized';
  end if;
end;
$$;
create table private.s01_email_proof (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  verified_at timestamptz not null default statement_timestamp()
);
alter table private.s01_email_proof enable row level security;
revoke all on private.s01_email_proof from public, anon, authenticated, service_role;

create function public.s01_record_email_proof(p_user_id uuid, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_email text;
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
      is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select email into current_email from auth.users where id = p_user_id for update;
  if not found or current_email is null or current_email is distinct from p_email then
    raise exception 'current account email mismatch' using errcode = '42501';
  end if;
  insert into private.s01_email_proof(user_id, email) values (p_user_id, p_email)
  on conflict(user_id) do update set email = excluded.email, verified_at = statement_timestamp();
end;
$$;
revoke all on function public.s01_record_email_proof(uuid, text) from public, anon, authenticated;
grant execute on function public.s01_record_email_proof(uuid, text) to service_role;

create function public.s01_has_email_proof()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.s01_email_proof p join auth.users u on u.id = p.user_id
    where p.user_id = (select auth.uid()) and p.email = u.email
  );
$$;
revoke all on function public.s01_has_email_proof() from public, anon;
grant execute on function public.s01_has_email_proof() to authenticated;
notify pgrst, 'reload schema';
commit;
