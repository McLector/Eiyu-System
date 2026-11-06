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

-- Proof: a Google claim that the email is verified, for the address the account holds
-- now, counts as mailbox proof. AFTER insert or update so by timing it runs after the
-- gate and can never grant proof before the gate looks; do not rely on trigger names.
-- GoTrue rewrites identity_data on every login, so a returning login keeps it fresh.
-- An email change already bumps the mailbox version (048), so an old identity whose
-- stored email no longer matches cannot re-grant. Row lock as in 048's mailbox_finish.
create function private.grant_google_mailbox_proof() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if lower(coalesce(new.identity_data->>'email_verified',''))<>'true' then return new; end if;
 perform 1 from auth.users where id=new.user_id for update;
 update private.mailbox_state m set verified_version=m.version,verified_at=pg_catalog.clock_timestamp()
  from auth.users u where u.id=new.user_id and m.user_id=u.id and coalesce(trim(u.email),'')<>''
   and lower(trim(new.identity_data->>'email'))=lower(trim(u.email));
 return new;
end;
$$;
revoke all on function private.grant_google_mailbox_proof() from public,anon,authenticated,service_role;
create trigger grant_google_mailbox_proof after insert or update on auth.identities
 for each row when (new.provider='google') execute function private.grant_google_mailbox_proof();

-- EP003 exception (replaces the 050 body, one added line). signInWithOAuth cannot carry
-- metadata, so a Google sign-up cannot send the birthday notice choice; the app collects
-- it on a required finish screen right after. The exception keys on raw_app_meta_data,
-- which only GoTrue sets; raw_user_meta_data is client-controlled and is never used for
-- it. A choice that is present but malformed still raises, and every other path still
-- requires prior specific consent.
create or replace function private.capture_initial_processing_consent() returns trigger
language plpgsql security definer set search_path='' as $$
declare choice jsonb:=new.raw_user_meta_data#>'{processing_consent,age_screening}';
 privileged_import boolean:=session_user in ('supabase_admin','postgres')
  and coalesce(nullif(current_setting('role',true),''),'none') in ('none','supabase_admin','postgres');
begin
 if choice is null and new.raw_app_meta_data->>'provider'='google' then return new; end if;
 -- Explicit privileged legacy/test imports can preserve missing declarations
 -- and grants. Real Auth connections (including Admin Auth APIs) cannot use it.
 if choice is null and privileged_import then return new; end if;
 if jsonb_typeof(choice) is distinct from 'object' or choice->'granted' is distinct from 'true'::jsonb
  or choice->>'notice_version' is distinct from '2026-10-20-age-v1'
  or new.raw_user_meta_data->>'birth_date' is null then
  raise exception 'Review the birthday notice and give specific permission before signup.' using errcode='EP003';
 end if;
 insert into private.processing_consent(user_id,age_granted,age_notice)
  values(new.id,true,'2026-10-20-age-v1');
 insert into private.processing_consent_events(user_id,purpose,granted,notice_version,version)
  values(new.id,'age-screening',true,'2026-10-20-age-v1',1);
 return new;
end;$$;

-- Narrowed before-user-created hook: the create path only. T1 showed it never runs for a
-- link to an existing user, so it plays no part in linking. A Google email that is not
-- verified is refused with a readable 403 (an empty message would count as success).
create function public.s03_before_user_created(event jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
begin
 if event#>>'{user,app_metadata,provider}'='google'
  and coalesce(event#>>'{user,user_metadata,email_verified}','')<>'true' then
  return pg_catalog.jsonb_build_object('error',pg_catalog.jsonb_build_object('http_code',403,
   'message','Google says this email is not verified. Verify it with Google, then try again.'));
 end if;
 return '{}'::jsonb;
end;
$$;
revoke all on function public.s03_before_user_created(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.s03_before_user_created(jsonb) to supabase_auth_admin;
commit;
