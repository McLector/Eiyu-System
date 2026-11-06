-- Local S03 only: no production rollout approved. Needs 047, 050 and 063.
-- The Google finish screen used to save the birthday-notice permission and the birthday
-- in two calls, so a failure between them left an account with permission but no
-- birthday. This saves both in one call: one transaction, so either both are kept or
-- neither is. It reuses the two existing saves, so their checks (signed-in caller,
-- expected account, current notice, unchanged revisions, valid birthday) all still
-- apply. Permission is saved first because the birthday save refuses an account
-- without it; an account that already has the permission saves no second event.
-- It is not a correction path: once a birthday is saved, only the same date is
-- accepted (a retry after a lost answer); a different one is refused, so corrections
-- still go through Profile.
begin;
create function public.finish_google_signup(p_birth_date date,p_notice_version text,
 p_expected_user_id uuid,p_expected_age_version integer,p_expected_consent_version integer,
 p_expected_authority_version integer,p_expected_mailbox_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); saved date;
begin
 if uid is null or uid is distinct from p_expected_user_id then
  raise exception 'account changed' using errcode='42501';
 end if;
 perform 1 from auth.users where id=uid for update;
 if not found then raise exception 'authentication required' using errcode='42501'; end if;
 select a.birth_date into saved from private.account_age a where a.user_id=uid;
 if saved is not null and saved is distinct from p_birth_date then
  raise exception 'Your birthday is already saved. Change it in Profile.' using errcode='EG002';
 end if;
 -- The age revision changes when the birthday is saved, so the access state is read afterwards.
 perform public.set_processing_consent('age-screening',true,p_notice_version,p_expected_user_id,
  p_expected_age_version,p_expected_consent_version,p_expected_authority_version,p_expected_mailbox_version);
 return pg_catalog.jsonb_build_object('age',public.set_account_birthday(p_birth_date,p_expected_user_id),
  'access',private.processing_access(uid));
end;$$;
revoke all on function public.finish_google_signup(date,text,uuid,integer,integer,integer,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.finish_google_signup(date,text,uuid,integer,integer,integer,integer) to authenticated;
commit;
