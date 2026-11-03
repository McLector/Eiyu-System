-- Local S02 only; not approved for deployment. Preserve existing histories.
-- Canonical server-built weekly AI input and owner-export coverage for the
-- tracker purpose state. No prompt or result is stored here.
begin;

-- Same bounded habit names, counts and stat totals as the client gatherer, built
-- from the explicit-owner history snapshot. Every contributing root must be
-- basic by retained provenance or covered by the current custom permission.
create function public.ai_tracker_week_input(p_user_id uuid,p_week_start date,p_expected jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tz text; today date; a jsonb; snap jsonb; habits jsonb; totals jsonb; protected boolean; n integer;
begin
 perform private.require_processing_service();
 if p_user_id is null or p_week_start is null then raise exception 'Invalid tracker input.' using errcode='22023'; end if;
 perform private.tracker_object_keys(p_expected,array['userId','ageVersion','mailboxVersion','consentVersion','authorityVersion']);
 perform private.tracker_argument_types(p_expected,'userId:uuid,ageVersion:integer,mailboxVersion:integer,consentVersion:integer,authorityVersion:integer');
 if (p_expected->>'userId')::uuid<>p_user_id then raise exception 'Invalid tracker input.' using errcode='22023'; end if;
 perform 1 from auth.users where id=p_user_id for update;
 if not found then raise exception 'Account unavailable.' using errcode='42501'; end if;
 select coalesce(time_zone,'UTC') into tz from public.profiles where user_id=p_user_id;
 if tz is null then raise exception 'Invalid tracker input.' using errcode='22023'; end if;
 today:=(statement_timestamp() at time zone tz)::date;
 if p_week_start<>today-(extract(isodow from today)::integer-1) then raise exception 'Invalid tracker input.' using errcode='22023'; end if;
 a:=private.processing_access(p_user_id);
 if a->'ageVersion' is distinct from p_expected->'ageVersion' or a->'mailboxVersion' is distinct from p_expected->'mailboxVersion'
  or a->'consentVersion' is distinct from p_expected->'consentVersion' or a->'authorityVersion' is distinct from p_expected->'authorityVersion' then
  raise exception 'Processing access changed.' using errcode='EP002';
 end if;
 perform private.require_debrief_generation(p_user_id);
 snap:=private.tracker_history_snapshot(p_user_id,p_week_start,p_week_start+7);
 with live as (
  select (h->>'id')::uuid id,h->>'name' name,h->>'stat' stat,t.ord from jsonb_array_elements(snap->'habits') with ordinality t(h,ord)
 ),rws as (
  select (r->>'source_habit_id')::uuid id,r->>'habit_name' name,r->>'stat' stat,r->>'completion_kind' kind,t.ord
  from jsonb_array_elements(snap->'rows') with ordinality t(r,ord) where r->>'completion_kind' is not null
 ),extra as (
  select distinct on (id) id,name,stat,ord from rws where id not in(select id from live) order by id,ord
 ),roots as (
  select id,name,stat,0 grp,ord from live union all select id,name,stat,1,ord from extra
 ),agg as (
  select r.id,r.name,r.stat,r.grp,r.ord,count(w.*) filter (where w.kind='full') full_count,count(w.*) filter (where w.kind<>'full') easy_count
  from roots r left join rws w on w.id=r.id group by r.id,r.name,r.stat,r.grp,r.ord
 )
 select coalesce(jsonb_agg(jsonb_build_object('name',name,'stat',stat,'fullCount',full_count,'easyCount',easy_count) order by grp,ord),'[]'::jsonb),
  exists(select 1 from agg g where not exists(select 1 from private.tracker_input_provenance p
   where p.object_kind='habit' and p.object_id=g.id and p.user_id=p_user_id and p.input_kind='basic')),
  count(*)::integer,
  jsonb_build_object('STR',coalesce(sum(full_count+easy_count) filter (where stat='STR'),0),'INT',coalesce(sum(full_count+easy_count) filter (where stat='INT'),0),
   'DEX',coalesce(sum(full_count+easy_count) filter (where stat='DEX'),0),'WIS',coalesce(sum(full_count+easy_count) filter (where stat='WIS'),0),
   'CHA',coalesce(sum(full_count+easy_count) filter (where stat='CHA'),0))
 into habits,protected,n,totals from agg;
 if protected and not (private.tracker_processing_access(p_user_id)->>'canWriteCustom')::boolean then
  raise exception 'Tracker processing permission required.' using errcode='ET002';
 end if;
 if n>100 then raise exception 'Invalid tracker input.' using errcode='22023'; end if;
 return jsonb_build_object('habits',habits,'statTotals',totals);
end;$$;
revoke all on function public.ai_tracker_week_input(uuid,date,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ai_tracker_week_input(uuid,date,jsonb) to service_role;

-- Export inventory: the new private tables and consent fields, with the trusted
-- review reference and the internal stage counter omitted.
alter function private.owner_export_manifest() rename to owner_export_manifest_before_tracker;
create function private.owner_export_manifest() returns jsonb
language sql immutable set search_path='' as $$
 with base as (select private.owner_export_manifest_before_tracker() m)
 select jsonb_build_object(
  'tables',(select jsonb_agg(case when e->>'table'='private.processing_consent'
     then jsonb_set(e,'{export}',(e->'export')||'["custom_granted","custom_notice","fitness_granted","fitness_notice"]'::jsonb) else e end order by ord)
    from base,jsonb_array_elements(base.m->'tables') with ordinality t(e,ord))
   ||'[{"table":"private.tracker_input_provenance","export":["object_kind","object_id","user_id","input_kind","ordinal"],"exclude":["next_stage_ordinal"],"scope":"owner"},
       {"table":"private.tracker_purpose_authority","export":["user_id","purpose","state","age_version","version","changed_at"],"exclude":["review_reference"],"scope":"owner"}]'::jsonb,
  'foreignKeys',(select jsonb_agg(e order by e->>'source',e->>'definition')
    from (select jsonb_array_elements(base.m->'foreignKeys') e from base
     union all select x from jsonb_array_elements('[{"source":"private.tracker_input_provenance","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"},
       {"source":"private.tracker_purpose_authority","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"}]'::jsonb) x) f));
$$;
revoke all on function private.owner_export_manifest_before_tracker(),private.owner_export_manifest() from public,anon,authenticated,service_role;
alter function private.owner_export_manifest_before_tracker() owner to postgres;
alter function private.owner_export_manifest() owner to postgres;

commit;
