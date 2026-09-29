-- Diagnostic only: all temporary schema and synthetic account writes roll back.
begin;
set local statement_timeout = '10s';

create temporary table review_legacy_profiles (display_name text not null);
insert into review_legacy_profiles values (repeat('x', 81));
do $$
begin
  begin
    alter table review_legacy_profiles add constraint review_display_name_valid
      check (char_length(btrim(display_name)) between 1 and 80);
    raise exception 'Unexpected: invalid legacy fixture accepted the constraint';
  exception when check_violation then
    raise notice 'UPGRADE_REPRO: migration 026 constraint rejects a previously valid 81-character profile';
  end;
end;
$$;

do $$
declare
  v_review_user uuid := gen_random_uuid();
  v_result jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_review_user, 'review-' || v_review_user::text || '@example.invalid',
          '{"display_name":"Review fixture","time_zone":"UTC"}'::jsonb);
  perform set_config('request.jwt.claim.sub', v_review_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  v_result := public.update_profile(E'\t', 'Ranger');
  raise notice 'WHITESPACE_REPRO: authenticated update_profile accepted tab-only display name: %',
    (v_result->>'displayName') = E'\t';
end;
$$;
reset role;
rollback;
