-- Local S03 only: no production rollout approved. Needs 048 (mailbox proof).
-- GoTrue links a new Google identity to any existing user with a matching email,
-- whether found through an identity row or through a user row with no identity at
-- all, and never checks that the existing account proved its mailbox. This gate
-- refuses that link unless the account holds the S02 proof, or this is the create
-- path: the user has no identity rows yet and raw_app_meta_data.provider is 'google'.
-- Only GoTrue sets raw_app_meta_data; raw_user_meta_data is client-controlled and is
-- never consulted. INSERT only, so a returning login (an UPDATE) is never blocked.
begin;
create function private.gate_google_identity_link() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if private.mailbox_verified(new.user_id) then return new; end if;
 if not exists(select 1 from auth.identities i where i.user_id=new.user_id)
  and (select u.raw_app_meta_data->>'provider' from auth.users u where u.id=new.user_id)='google' then
  return new;
 end if;
 raise exception 'Google link refused: the existing account has not verified its email.' using errcode='EG001';
end;
$$;
revoke all on function private.gate_google_identity_link() from public,anon,authenticated,service_role;
create trigger gate_google_identity_link before insert on auth.identities
 for each row when (new.provider='google') execute function private.gate_google_identity_link();
commit;
