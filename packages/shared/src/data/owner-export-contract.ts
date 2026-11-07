// Pure export contract; no Auth, cache, provider or native imports.
export interface OwnerExportDocument {
 schemaVersion:1;generatedAt:string;accountId:string;mailboxVersion:number;
 account:{email:string|null;createdAt:string;signup:{displayName:string|null;timeZone:string|null}};
 sections:Record<string,Record<string,unknown>[]>;omissions:string[];
}
function record(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function keys(value:Record<string,unknown>,expected:readonly string[]){const actual=Object.keys(value);return actual.length===expected.length&&actual.every(key=>expected.includes(key));}
function nullableString(value:unknown){return value===null||typeof value==='string';}
function timestamp(value:unknown){return typeof value==='string'&&value.length<=64&&Number.isFinite(Date.parse(value));}
function scalar(value:unknown){return value===null||typeof value==='string'||typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value));}
function flatObject(value:unknown){return record(value)&&Object.keys(value).length<=OWNER_EXPORT_MAX_OBJECT_KEYS&&Object.values(value).every(scalar);}
export function isOwnerExportDocument(value:unknown,owner:string):value is OwnerExportDocument{
 if(!record(value)||!keys(value,['schemaVersion','generatedAt','accountId','account','mailboxVersion','sections','omissions'])
  ||value.schemaVersion!==1||value.accountId!==owner||!timestamp(value.generatedAt)
  ||!Number.isSafeInteger(value.mailboxVersion)||(value.mailboxVersion as number)<1
  ||!record(value.account)||!keys(value.account,['email','createdAt','signup'])||!nullableString(value.account.email)||!timestamp(value.account.createdAt))return false;
 const signup=value.account.signup;
 if(!record(signup)||!keys(signup,['displayName','timeZone'])||![signup.displayName,signup.timeZone].every(nullableString)
  ||!Array.isArray(value.omissions)||!value.omissions.every(v=>typeof v==='string'))return false;
 if(!record(value.sections)||!keys(value.sections,Object.keys(OWNER_EXPORT_SECTION_FIELDS)))return false;
 let count=1;
 for(const [table,fields] of Object.entries(OWNER_EXPORT_SECTION_FIELDS)){
  const rows=value.sections[table];if(!Array.isArray(rows))return false;count+=rows.length;if(count>OWNER_EXPORT_MAX_RECORDS)return false;
  for(const row of rows){
   if(!record(row)||!keys(row,fields)||('user_id' in row&&row.user_id!==owner))return false;
   if(!Object.entries(row).every(([column,v])=>scalar(v)||(Array.isArray(v)&&v.every(scalar))
    ||((OWNER_EXPORT_OBJECT_COLUMNS[table]??[]).includes(column)&&flatObject(v))))return false;
   if((table==='private.processing_consent_events'||table==='private.processing_authority_events')
    &&(typeof row.id!=='string'||! /^-?\d+$/.test(row.id)))return false;
  }
 }
 const sections=value.sections as Record<string,Record<string,unknown>[]>;
 const requests=new Set(sections['private.ai_logical_requests'].map(row=>row.request_id).filter(v=>typeof v==='string'));
 for(const table of ['private.ai_provider_attempts','private.ai_execution_details']){
  if(sections[table].some(row=>typeof row.request_id!=='string'||!requests.has(row.request_id)))return false;
 }
 return true;
}
export const OWNER_EXPORT_MAX_BYTES=5242880;
export const OWNER_EXPORT_MAX_RECORDS=10000;
export const OWNER_EXPORT_MAX_OBJECT_KEYS=32;
// Hand-written: the only exported columns that hold a JSON object (a flat object of scalars). scripts/owner-export-contract.mjs --check
// fails when the database has a JSON column that is not listed here, or one listed here that is gone.
export const OWNER_EXPORT_OBJECT_COLUMNS:Readonly<Record<string,readonly string[]>>={"public.gym_entries":["prescription"]};
// Generated from private.owner_export_manifest(); never edit by hand.
// Regenerate: node scripts/owner-export-contract.mjs --write  (check: --check, also run by db:test)
export const OWNER_EXPORT_SECTION_FIELDS:Readonly<Record<string,readonly string[]>>={
  "private.account_age": [
    "user_id",
    "birth_date",
    "pending_birth_date",
    "version"
  ],
  "private.ai_logical_requests": [
    "request_id",
    "user_id",
    "action",
    "request_class",
    "account_date",
    "week_start",
    "attempt_count",
    "created_at",
    "refunded_at",
    "age_version",
    "mailbox_version",
    "consent_version",
    "authority_version"
  ],
  "private.ai_pending_weekly_regenerations": [
    "user_id",
    "week_start",
    "account_date",
    "created_at",
    "expires_at",
    "consumed_at",
    "request_id"
  ],
  "private.ai_user_daily_usage": [
    "user_id",
    "usage_date",
    "action",
    "request_count"
  ],
  "private.long_quest_definition_receipts": [
    "user_id",
    "request_id",
    "quest_id"
  ],
  "private.long_quest_reward_receipts": [
    "user_id",
    "request_id",
    "stage_id",
    "done"
  ],
  "private.mailbox_state": [
    "user_id",
    "version",
    "verified_version",
    "verified_at"
  ],
  "private.processing_authority": [
    "user_id",
    "state",
    "purposes",
    "age_version",
    "version",
    "changed_at"
  ],
  "private.processing_authority_events": [
    "id",
    "user_id",
    "state",
    "purposes",
    "age_version",
    "version",
    "changed_at"
  ],
  "private.processing_consent": [
    "user_id",
    "age_granted",
    "age_notice",
    "ai_granted",
    "ai_notice",
    "version",
    "changed_at",
    "custom_granted",
    "custom_notice",
    "fitness_granted",
    "fitness_notice"
  ],
  "private.processing_consent_events": [
    "id",
    "user_id",
    "purpose",
    "granted",
    "notice_version",
    "version",
    "changed_at"
  ],
  "public.deleted_habit_history": [
    "id",
    "user_id",
    "source_habit_id",
    "historical_date",
    "habit_name",
    "stat",
    "quest_type",
    "scheduled",
    "completion_kind",
    "xp_awarded",
    "time_zone",
    "day_ends_at",
    "created_at"
  ],
  "public.gym_entries": [
    "id",
    "session_id",
    "user_id",
    "exercise_id",
    "position",
    "prescription",
    "weight"
  ],
  "public.gym_exercises": [
    "id",
    "routine_id",
    "user_id",
    "name",
    "position",
    "sets",
    "reps",
    "rest_seconds",
    "rir",
    "notes",
    "media_path",
    "media_mime",
    "rir_max"
  ],
  "public.gym_media_cleanup": [
    "user_id",
    "path",
    "created_at"
  ],
  "public.gym_routines": [
    "id",
    "user_id",
    "name",
    "unit",
    "archived",
    "created_at",
    "deleted_at"
  ],
  "public.gym_sessions": [
    "id",
    "routine_id",
    "user_id",
    "routine_name",
    "unit",
    "status",
    "created_at",
    "completed_at"
  ],
  "public.habit_archive_intervals": [
    "id",
    "habit_id",
    "user_id",
    "archived_from",
    "restored_on",
    "created_at"
  ],
  "public.habit_completions": [
    "id",
    "user_id",
    "habit_id",
    "completed_on",
    "kind",
    "xp_awarded",
    "created_at"
  ],
  "public.habit_occurrences": [
    "habit_id",
    "user_id",
    "occurrence_date",
    "created_at",
    "time_zone",
    "day_ends_at"
  ],
  "public.habit_progress": [
    "id",
    "user_id",
    "habit_id",
    "progress_date",
    "progress_count"
  ],
  "public.habit_recovery_windows": [
    "id",
    "habit_id",
    "user_id",
    "missed_on",
    "preserved_streak",
    "opened_at",
    "deadline_at",
    "status",
    "resolved_at",
    "created_at"
  ],
  "public.habit_schedule_versions": [
    "habit_id",
    "user_id",
    "effective_from",
    "days",
    "created_at"
  ],
  "public.habits": [
    "id",
    "user_id",
    "name",
    "easy_version",
    "stat",
    "difficulty",
    "reminder_time",
    "days",
    "archived",
    "created_at",
    "updated_at",
    "quest_type",
    "description",
    "scheduled_date",
    "target_count",
    "schedule_start_on",
    "genre",
    "time_set",
    "position"
  ],
  "public.long_quest_rewards": [
    "user_id",
    "quest_id",
    "reward_key",
    "kind",
    "stat",
    "amount",
    "active",
    "legacy_exempt"
  ],
  "public.long_quest_stages": [
    "id",
    "long_quest_id",
    "user_id",
    "name",
    "position",
    "done",
    "description"
  ],
  "public.long_quests": [
    "id",
    "user_id",
    "name",
    "stat",
    "deadline",
    "created_at",
    "description",
    "completed_at",
    "strict_order",
    "position"
  ],
  "public.profiles": [
    "user_id",
    "display_name",
    "user_class",
    "target_role",
    "theme",
    "created_at",
    "updated_at",
    "time_zone",
    "time_zone_changed_at",
    "palette"
  ],
  "public.stats": [
    "user_id",
    "stat",
    "xp",
    "updated_at"
  ],
  "public.streaks": [
    "habit_id",
    "user_id",
    "best",
    "updated_at",
    "current_streak",
    "recovery_armed",
    "last_processed_on",
    "active_recovery_id"
  ],
  "public.weekly_quests": [
    "id",
    "user_id",
    "week_start",
    "stat",
    "target_count",
    "current_count",
    "created_at"
  ],
  "public.weekly_summaries": [
    "id",
    "user_id",
    "week_start",
    "summary",
    "created_at",
    "regenerate_count",
    "last_regenerated_date",
    "age_version",
    "mailbox_version",
    "consent_version",
    "authority_version"
  ],
  "private.ai_provider_attempts": [
    "request_id",
    "attempt_number",
    "usage_date",
    "created_at"
  ],
  "private.ai_execution_details": [
    "request_id",
    "contract_version",
    "state",
    "created_at",
    "settled_at"
  ],
  "private.tracker_input_provenance": [
    "object_kind",
    "object_id",
    "user_id",
    "input_kind",
    "ordinal"
  ],
  "private.tracker_purpose_authority": [
    "user_id",
    "purpose",
    "state",
    "age_version",
    "version",
    "changed_at"
  ],
  "private.authority_review_requests": [
    "id",
    "user_id",
    "purpose",
    "note",
    "status",
    "created_at",
    "decided_at",
    "age_version"
  ],
  "private.tracker_retention_state": [
    "user_id",
    "purpose",
    "withdrawn_at",
    "reminder_due_on",
    "removal_due_on",
    "reminded_at",
    "removed_at",
    "last_failed_at"
  ],
  "private.terms_acceptance": [
    "user_id",
    "version",
    "accepted_at"
  ]
};
