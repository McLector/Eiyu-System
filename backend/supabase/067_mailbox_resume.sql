-- Mailbox resume. get_mailbox_status() also reports a pending code, so the email box can come back after a reload.
-- A code is "pending" only while it was delivered, belongs to the current email (same version), and has not expired.
-- The status never carries the code or any email text. mailbox_state columns are unchanged.
-- STABLE is deliberate: the function is called once per request and clock_timestamp() is read once per call.
begin;
create or replace function public.get_mailbox_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_id uuid:=auth.uid(); m private.mailbox_state%rowtype; v_challenge jsonb; v_now timestamptz:=pg_catalog.clock_timestamp();
begin
 if v_id is null then raise exception 'authentication required' using errcode='42501'; end if;
 select * into m from private.mailbox_state where user_id=v_id;
 if found and (m.challenge_id is not null and m.challenge_ready and m.challenge_version=m.version
  and m.challenge_expires_at>v_now) then
  v_challenge:=pg_catalog.jsonb_build_object('id',m.challenge_id,'expiresAt',m.challenge_expires_at,
   'resendAfter',greatest(0,pg_catalog.ceil(extract(epoch from coalesce(m.last_sent_at,v_now-interval '60 seconds')+interval '60 seconds'-v_now))::integer));
 end if;
 return pg_catalog.jsonb_build_object('userId',v_id,'version',coalesce(m.version,0),'verified',private.mailbox_verified(v_id),
  'challenge',v_challenge);
end;
$$;
revoke all on function public.get_mailbox_status() from public,anon,authenticated,service_role;
grant execute on function public.get_mailbox_status() to authenticated;
commit;
