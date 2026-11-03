# S02 parallel contract (frozen 2026-10-24)

Status: FROZEN for the shared, web, native-UI and native-queue lanes. Source of truth for RPC shapes: `backend/supabase/053`-`056` and `ai-proxy-core.ts`. Design: `2026-10-23-s02-tracker-consent-design.md`; plan: `2026-10-23-s02-tracker-consent-implementation.md` (Tasks 2, 5, 6, 7).

Rule: every exported signature in this document is frozen. A lane that needs a change reports it to the orchestrator and does not make it.

Expo note: this contract adds no Expo code. Native lanes must read the SDK 54 docs (https://docs.expo.dev/versions/v54.0.0/) before writing mobile code, per AGENTS.md.

## 1. Lane ownership

- Shared lane writes `packages/shared/src/**` except `index.ts` and `types/database.ts` (the contract agent already added those entries).
- Web lane writes `web/**`.
- Native-UI lane writes `mobile/app/**`, `mobile/components/**`, `mobile/contexts/**`, `mobile/lib/notifications.ts`, `mobile/lib/widget-snapshot.ts`, `mobile/lib/use-widget-snapshot.ts` and their tests.
- Native-queue lane writes `mobile/lib/write-queue.ts`, `mobile/lib/write-queue-engine.ts`, `mobile/lib/use-write-queue.ts` and their tests.
- Backend and SQL lanes are outside this contract.
- Unassigned file found: `mobile/lib/gym-media-upload.ts` (and `mobile/lib/__tests__/gym-media-upload.test.ts`) calls `uploadGymMediaBody`, whose signature changes. No lane owns it. Recommendation: native-UI lane. The orchestrator must confirm.

## 2. New shared modules (stubs exist at these paths)

### 2.1 `packages/shared/src/data/tracker-access.ts`

```ts
export type TrackerPurpose = 'custom-tracker' | 'fitness-tracking';
export type TrackerInputKind = 'basic' | 'custom';
export type TrackerAuthorityState = 'not-required' | 'pending' | 'approved' | 'revoked';
export interface TrackerRevision { userId: string; ageVersion: number; consentVersion: number; authorityVersion: number }
export interface TrackerAccess {
  contractVersion: 1; revision: TrackerRevision;
  canWriteBasic: boolean; customConsent: boolean; fitnessConsent: boolean;
  customAuthorityState: TrackerAuthorityState; fitnessAuthorityState: TrackerAuthorityState;
  canWriteCustom: boolean; canWriteFitness: boolean;
}
export interface TrackerTarget { kind: 'habit' | 'chain'; id: string; inputKind: TrackerInputKind; canWrite: boolean }
export type TrackerTargetSnapshot = Pick<TrackerTarget, 'kind' | 'id' | 'inputKind'>;
export type TrackerOperation = /* closed list, see file */;

export const CUSTOM_TRACKER_NOTICE_VERSION = '2026-10-23-custom-tracker-v1';
export const FITNESS_TRACKER_NOTICE_VERSION = '2026-10-23-fitness-tracking-v1';
export const TRACKER_NOTICE_VERSIONS: Record<TrackerPurpose, string>;
export const TRACKER_ACCESS_MESSAGE = 'Tracker access unavailable.';

parseTrackerAccess(value: unknown, expectedOwner: string): TrackerAccess      // throws TRACKER_ACCESS_MESSAGE on any invalid/foreign/unknown shape
fetchTrackerAccess(expectedOwner: string): Promise<TrackerAccess>             // rpc get_tracker_processing_access
fetchTrackerTargets(kind, ids, expectedOwner): Promise<TrackerTarget[]>       // rpc get_tracker_targets, chunks of 100, refuses a missing/foreign id
setTrackerConsent(purpose, granted, noticeVersion, expected): Promise<TrackerAccess> // rpc set_tracker_processing_consent, notifies subscribers
subscribeTrackerAccessChanges(listener): () => void
copyTrackerRevision(revision: TrackerRevision): TrackerRevision               // capture before any await
toTargetSnapshot(target: TrackerTarget): TrackerTargetSnapshot
```

RPC arg keys: `get_tracker_targets {p_kind, p_ids}`; `set_tracker_processing_consent {p_purpose, p_granted, p_notice_version, p_expected}`; `p_expected` is exactly `{userId, ageVersion, consentVersion, authorityVersion}`.

Notice copy: the shared lane adds `TRACKER_PURPOSE_NOTICES: Record<TrackerPurpose, {version: string; label: string; body: string}>` to `logic/legal-content.ts` (already re-exported by index). Text from design doc "Candidate short choices". Web and native import that name.

### 2.2 `packages/shared/src/data/tracker-writes.ts`

```ts
export type TrackerErrorKind = 'under12-paused' | 'purpose-required' | 'access-changed' | 'invalid-input' | 'denied';
// ET001 -> 'under12-paused'; ET002 -> 'purpose-required'; ET003 -> 'access-changed';
// 22023 -> 'invalid-input'; 42501 -> 'denied'. Any other code -> null.
export const TRACKER_ERROR_CODES: Readonly<Record<string, TrackerErrorKind>>;
export function trackerErrorKind(error: unknown): TrackerErrorKind | null;
export const NO_TARGETS: readonly TrackerTargetSnapshot[]; // empty; pass for creation and fitness operations
export interface PrepareDayResult { basicPrepared: boolean; protectedPrepared: boolean; accessChanged: boolean }
export function invokeTrackerWrite<T>(operation: TrackerOperation, args: Record<string, unknown>,
  expected: TrackerRevision, targets: readonly TrackerTargetSnapshot[]): Promise<T>;
export function prepareDay(expected: TrackerRevision): Promise<PrepareDayResult>;
```

`invokeTrackerWrite` calls `rpc('apply_tracker_write', {p_operation, p_arguments: {...args, p_expected_targets: targets}, p_expected: expected})`. Callers never put `p_expected_targets` in `args`. It copies `expected` and `targets` before the first await, never refreshes them, never falls back to a direct write. Unknown result shape is not coerced. `prepareDay` first awaits `initializeAccountTimeZone()` (server uses the profile zone; my call), then invokes `prepare-day` with `{}` args and `[]` targets, and parses the three booleans strictly. After `accessChanged: true` the caller refreshes `fetchTrackerAccess` and must not assume protected work was prepared.

Error classes: errors surface unchanged (Supabase error with `.code`); use `trackerErrorKind(error)` to classify. Payloads are never echoed by the server.

### 2.3 `packages/shared/src/logic/tracker-input.ts`

```ts
export type BasicHabitInput = Pick<HabitInput, 'questType'|'stat'|'difficulty'|'time'|'days'|'scheduledDate'|'targetCount'|'timeSet'>;
export interface BasicChainInput { stat: Stat; strictOrder?: boolean; stages: { id?: string | null }[] }
export type HabitEditorInput = { mode: 'basic'; values: BasicHabitInput } | { mode: 'custom'; values: HabitInput };
export type ChainEditorInput = { mode: 'basic'; values: BasicChainInput } | { mode: 'custom'; values: LongQuestInput };
export function toBasicHabitInput(input: HabitInput): BasicHabitInput;   // drops name/description/easyVersion/genre
export function toBasicChainInput(input: LongQuestInput): BasicChainInput; // drops all text
export function habitGatewayInput(editor: HabitEditorInput): { mode: 'basic' | 'custom'; input: Record<string, unknown> };
export function chainGatewayInput(editor: ChainEditorInput): { mode: 'basic' | 'custom'; input: Record<string, unknown> };
```

Gateway payloads (054): basic habit `p_input` keys: `stat, difficulty, time, days` required; optional `questType, scheduledDate, targetCount, timeSet` (omit `timeSet` rather than send null; omit nothing else needed). `time` is `HH:MM`. Custom habit adds `name` (required, already normalized by the caller-side `normalizeEditableQuestName`), optional `description, easyVersion, genre`. Basic chain `p_input`: `stat, stages:[{id?}]`, optional `strictOrder`. Custom chain: `stat, name (required), stages:[{id?, name (required), description?}]`, optional `strictOrder, description`. No other keys (server refuses extras).

Server facts every lane must respect (verified against 053-055):

- `p_expected` must have exactly the four keys `userId, ageVersion, consentVersion, authorityVersion` (`validate_tracker_revision` counts keys). The transport builds a fresh literal with those four fields and never passes a `TrackerAccess.revision` object through as is.
- `p_expected_targets` is required on every operation. It is `[]` for creation (`p_create: true`), gym operations and `prepare-day`. The server compares length and set equality with the live roots, so a duplicate id or a missing id gives `ET003`.
- Basic `habit-save` input must not contain `name`, `description`, `easyVersion` or `genre`, even as null. `timeSet` must be omitted or boolean, never null. `scheduledDate`, `targetCount`, `description`, `easyVersion` and `genre` may be null in custom mode.
- Creation takes a caller-supplied id (`p_id`) that the editor keeps across uncertain retries: `createHabit` takes `creationId`, `saveAtomicLongQuest` takes `id` plus `requestId`, `saveGymRoutine` takes `creationId`.
- Storage path segments for routine and object ids must be lowercase hex UUIDs; the owner segment is `expected.userId`. `newRequestId()` already yields lowercase.
- Order on the Board: `initializeAccountTimeZone` (inside `prepareDay`), then `prepareDay(revision)`, then `fetchTodayHabits`. The server raises when the profile row is missing. When `accessChanged` is true the caller refetches `TrackerAccess`.
- `isConfirmedFailure` (`data/save-outcome.ts`) treats any five-character SQLSTATE as a confirmed failure, so `ET001`, `ET002`, `ET003`, `22023` and `42501` are thrown as is and never turn into `UncertainSaveError` reconciliation loops.

## 3. Operation map (gateway op, argument keys sent, targets, result)

All calls go through `invokeTrackerWrite`. "targets" is what the caller must capture from the view model (`inputKind`) or `fetchTrackerTargets`.

| Operation | Argument keys | targets | Result |
| --- | --- | --- | --- |
| `habit-save` | `p_id, p_create, p_mode, p_input` | create: `[]`; edit: `[habit]` | uuid string |
| `complete_habit` | `p_habit_id, p_completed_on, p_kind` | `[habit]` | null |
| `undo_habit_completion` | `p_habit_id, p_completed_on` | `[habit]` | null |
| `increment_habit_progress` | `p_habit_id, p_date, p_delta` | `[habit]` | number |
| `complete_habit_recovery` | `p_habit_id` | `[habit]` | `{status}` |
| `archive_habit` / `restore_habit` / `delete_habit` | `p_habit_id` | `[habit]` | null |
| `move_backlog_to_one_time` / `move_one_time_to_backlog` | `p_id` | `[habit]` | null |
| `reorder_quests` | `p_quest_type, p_ids` | every id in `p_ids` | null |
| `chain-save` | `p_id, p_request_id, p_create, p_mode, p_input` | create: `[]`; edit: `[chain]` | uuid string |
| `set_long_quest_stage_done_receipt` | `p_stage_id, p_done, p_request_id` | `[parent chain]` | RewardReceipt |
| `reorder_long_quests` | `p_ids` | every id in `p_ids` | null |
| `chain-delete` | `p_id` | `[chain]` | null |
| `gym-routine-save` | `p_id, p_create, p_name, p_unit` | `[]` | uuid string |
| `gym-routine-archive` | `p_id, p_archived` | `[]` | null |
| `save_gym_exercise` | `p_id, p_input` (keys: routine_id, name, position, sets, reps, rest_seconds, rir, notes; optional id, user_id, rir_max, media_path, media_mime) | `[]` | uuid string |
| `remove_gym_exercise` | `p_id` | `[]` | null |
| `delete_gym_routine` | `p_routine_id, p_discard_draft` | `[]` | null |
| `reorder_gym_exercises` | `p_routine_id, p_ids` | `[]` | null |
| `start_gym_session` | `p_routine_id` | `[]` | uuid string |
| `save_gym_session` | `p_session_id, p_weights ([{exercise_id, weight}]), p_finish` | `[]` | null |
| `discard_gym_session` | `p_session_id` | `[]` | null |
| `log_gym_weight` | `p_log_id, p_exercise_id, p_weight` | `[]` | null |
| `prepare-day` | none | `[]` | PrepareDayResult |

Errors: `ET001` under12 paused; `ET002` purpose/authority missing; `ET003` stale revision or target snapshot; `22023` invalid shape or basic payload; `42501` auth/owner/foreign or retired target. Gym uploads: path `<owner>/<routine>/<ageVersion>-<consentVersion>-<authorityVersion>/<objectId>.<gif|mp4>`.

## 4. Changed shared domain functions

Convention: `expected: TrackerRevision` and `targets: readonly TrackerTargetSnapshot[]` are REQUIRED, never optional, never auto-refreshed. TypeScript forbids required params after optional ones, so they are inserted before the first optional parameter. Fitness and creation callers pass `NO_TARGETS`. Unused legacy params (`userId`, `stat`) stay for stability.

### 4.1 `data/habits.ts`

| Function | Old | New | Op |
| --- | --- | --- | --- |
| `createHabit` | `(userId, input: HabitInput): Promise<string>` | `(userId: string, input: HabitEditorInput, expected: TrackerRevision, creationId: string): Promise<string>` | `habit-save`, `{p_id: creationId, p_create: true, p_mode, p_input}`, targets `[]`. Editor keeps one `creationId` across uncertain retries. |
| `updateHabit` | `(id, input: HabitInput, originalName?)` | `(id: string, input: HabitEditorInput, expected: TrackerRevision, targets: readonly TrackerTargetSnapshot[], originalName?: string): Promise<void>` | `habit-save`, `{p_id: id, p_create: false, ...}`; basic to custom conversion is `mode:'custom'` on a basic root. |
| `reorderQuests` | `(questType, ids)` | `(questType: QuestType, ids: string[], expected, targets)` | `reorder_quests` |
| `moveBacklogToOneTime`, `moveOneTimeToBacklog`, `archiveHabit`, `restoreHabit`, `deleteHabit` | `(id)` | `(id: string, expected, targets)` | matching ops |
| `fetchTodayHabits`, `fetchBacklogQuests` | unchanged signature | unchanged; read-only, no preparation. Returned `Quest` gains `inputKind?: TrackerInputKind` and `canWrite?: boolean` (via `fetchTrackerTargets`). Absent means unclassified: treat as custom and read-only. | none |

### 4.2 `data/completions.ts`

| Function | Old | New | Op |
| --- | --- | --- | --- |
| `completeHabit` | `(userId, habitId, stat, kind, completedOn?, timeZone?)` | `(userId, habitId, stat, kind, expected, targets, completedOn?, timeZone?)` | `complete_habit` |
| `completeHabitRecovery` | `(habitId)` | `(habitId, expected, targets)` | `complete_habit_recovery` (status handling unchanged) |
| `undoCompletion` | `(userId, habitId, stat, timeZone?, completedOn?)` | `(userId, habitId, stat, expected, targets, timeZone?, completedOn?)` | `undo_habit_completion` |
| `incrementHabitProgress` | `(habitId, date, delta)` | `(habitId, date, delta, expected, targets)` | `increment_habit_progress` |

### 4.3 `data/long-quests.ts`

| Function | Old | New | Op |
| --- | --- | --- | --- |
| `saveAtomicLongQuest` | `(id, requestId, input: LongQuestInput, create, originalName?)` | `(id: string, requestId: string, input: ChainEditorInput, create: boolean, expected, targets, originalName?: string)` | `chain-save`; create targets `[]`; keeps receipt reconciliation |
| `setStageDoneWithReceipt` | `(stageId, done, requestId)` | `(stageId, done, requestId, expected, targets)` targets = parent chain | `set_long_quest_stage_done_receipt` |
| `reorderLongQuests` | `(ids)` | `(ids, expected, targets)` | `reorder_long_quests` |
| `deleteLongQuest` | `(id)` | `(id, expected, targets)` | `chain-delete` |
| `createLongQuest`, `updateLongQuest`, `reconcileLongQuestStages`, `setStageDone` | direct writes | REMOVED (revoked server-side; verified no web or mobile caller outside tests) | none |
| `fetchLongQuests` | unchanged signature | `LongQuest` gains `inputKind?`, `canWrite?` | none |

### 4.4 `data/gym.ts`

| Function | Old | New | Op |
| --- | --- | --- | --- |
| `saveGymRoutine` | `(userId, name, unit, id?, creationId?)` | `(userId, name, unit, expected, targets, id?, creationId?)` | `gym-routine-save`, `p_create = !id`, `p_id = id ?? creationId ?? newRequestId()` |
| `archiveGymRoutine` | `(id, archived)` | `(id, archived, expected, targets)` | `gym-routine-archive` |
| `saveGymExercise` | `(input)` | `(input, expected, targets)` | `save_gym_exercise` |
| `removeGymExercise` | `(id)` | `(id, expected, targets)` | `remove_gym_exercise` |
| `deleteGymRoutine` | `(id, discardDraft = false)` | `(id, expected, targets, discardDraft = false)` | `delete_gym_routine` |
| `moveGymExercises` | `(routine, ids)` | `(routine, ids, expected, targets)` | `reorder_gym_exercises` |
| `startGymSession` | `(routineId)` | `(routineId, expected, targets)` | `start_gym_session` |
| `saveGymSession` | `(sessionId, weights, finish = false)` | `(sessionId, weights, expected, targets, finish = false)` | `save_gym_session` |
| `discardGymSession` | `(sessionId)` | `(sessionId, expected, targets)` | `discard_gym_session` |
| `logGymWeight` | `(logId, exerciseId, weight)` | `(logId, exerciseId, weight, expected, targets)` | `log_gym_weight` |

Uncertain-write reconciliation logic stays in these functions. Reads (`fetchGym`, history, weights, cleanup list/ack) are unchanged.

### 4.5 Gym media

| Function | Old | New |
| --- | --- | --- |
| `logic/gym-media.ts gymMediaPath` | `(userId, routineId, mime, id)` | `(userId: string, routineId: string, mime: GymMediaMime, id: string, expected: TrackerRevision): string`; path `${userId}/${routineId}/${age}-${consent}-${authority}/${id}.${gif or mp4}`; throws if `expected.userId !== userId` |
| `data/gym-media.ts uploadGymMediaBody` | `(userId, routineId, body, mime)` | `(userId, routineId, body, mime, expected: TrackerRevision)` |
| web `uploadGymMedia` | `(userId, routineId, file)` | `(userId, routineId, file, expected)` |
| mobile `uploadPickedGymMedia` | `(userId, routineId, media)` | `(userId, routineId, media, expected)` |

`deleteGymMedia`, `signGymMedia` unchanged. A refused attachment is not proof the bytes were erased.

### 4.6 Weekly quest and summary

| Function | Old | New |
| --- | --- | --- |
| `data/weekly-quest.ts fetchOrCreateWeeklyQuest` | `(userId, stats, timeZone, now?)` inserts directly | REMOVED. Replaced by read-only `fetchWeeklyQuest(userId: string, timeZone: string, now?: Date): Promise<WeeklyQuest \| null>` (null = not prepared yet). Creation happens in `prepareDay`. No UI caller existed. |
| `prepareDay` (tracker-writes) | new | `(expected: TrackerRevision): Promise<PrepareDayResult>`; called by the store before `fetchTodayHabits` |
| `data/weekly-summary.ts gatherWeekData` | exported | REMOVED (server builds habits and statTotals) |
| `ai/suggestions.ts generateWeeklySummary` | `(weekStart, habits, statTotals, expected?)` | `(weekStart: string, expected?: {access: ProcessingAccess; mailbox: Pick<MailboxStatus,'userId'|'version'>}): Promise<string>`; body is ONLY `{action:'weekly-summary', weekStart, processingAccess:{contractVersion:1, ageVersion, mailboxVersion, consentVersion, authorityVersion}}` |
| `fetchOrCreateWeeklySummary`, `regenerateWeeklySummary`, `fetchSavedWeeklySummary` | `(userId, timeZone, now?)` | unchanged signatures; UI callers need no edit |

`WeeklySummaryHabitDatum` may remain as an exported type; it is no longer sent.

## 5. Native queue contract (Task 7), exact TypeScript

`mobile/lib/write-queue.ts`:

```ts
import type { TrackerRevision, TrackerTargetSnapshot } from '@eiyu/shared/src/data/tracker-access';

export type FailureReason = 'day-passed' | 'recovery-closed' | 'not-on-board' | 'progress-changed' | 'server'
  | 'tracker-paused' | 'purpose-paused';

export interface QueueEntry {
  id: string; userId: string; kind: QueueKind; habitId: string; accountDate: string;
  delta?: number; base?: number; label?: string; createdAt: number; attempts: number;
  status: QueueStatus; failure?: QueueFailure;
  heldForTrackerPause?: true;            // existing under12 flag, unchanged
  heldForProcessingPause?: true;         // new: held for a purpose or revision reason
  trackerRevision?: TrackerRevision;     // captured at enqueue; persisted projection only
  trackerTargets?: TrackerTargetSnapshot[];
}

export interface EnqueueInput { /* existing fields */ trackerRevision?: TrackerRevision; trackerTargets?: TrackerTargetSnapshot[] }
```

- `FAILURE_MESSAGES['purpose-paused']` is required (Record is exhaustive). Wording: explain that the entry is kept, permission or the quest changed, choose Retry after permission returns, original date still applies.
- `classifyError`: `ET001` stays `tracker-paused`; `ET002` and `ET003` map to `purpose-paused`.
- `isExpired` and `expireEntries` treat either held flag as "original date only" (recovery too).
- `isEntry`/`decodeQueue` accept valid v1 entries with or without the new optional fields (`heldForProcessingPause` undefined or `true`; `trackerRevision` four-field object or absent; `trackerTargets` array of snapshots or absent). Storage version stays 1. An entry with no `trackerRevision` is held (`purpose-paused`) for explicit Retry; it is never stamped with a new grant.

`mobile/lib/write-queue-engine.ts`:

```ts
import type { TrackerAccess, TrackerTarget } from '@eiyu/shared';

export interface WriteQueueDeps {
  userId: string; storage: WriteQueueStorage; now: () => Date; timeZone: () => string | null;
  isOnline: () => boolean | null; newId: () => string;
  /** Replaces checkTrackerAccess. Fresh owner-bound read; throws when permission cannot be established. */
  checkProcessingAccess: (entry: QueueEntry) => Promise<{ access: TrackerAccess; targets: TrackerTarget[] }>;
  send: (entry: QueueEntry) => Promise<unknown>;
  readQuest: (habitId: string) => Promise<Quest | undefined>;
  onApplied: (entry: QueueEntry, result?: unknown) => Promise<void> | void;
  onFailed?: (entry: QueueEntry) => void;
}

export interface EnqueueRequest {
  kind: QueueKind; habitId: string; delta?: number; base?: number; label?: string;
  trackerAccess: TrackerAccess;
  trackerTargets: TrackerTargetSnapshot[];
}

export interface WriteQueueEngine {
  load(): Promise<void>; getEntries(): QueueEntry[];
  subscribe(listener: (entries: QueueEntry[]) => void): () => void;
  /** true = accepted and persisted; false = refused on a known denial (nothing persisted, no label copy). */
  enqueue(request: EnqueueRequest): boolean;
  flush(): Promise<void>; sweep(): void;
  retry(id: string): Promise<boolean>;
  dismiss(id: string): QueueEntry | undefined; dispose(): void;
}
```

Behavior fixed by the contract:
- `enqueue` refuses (returns false) when `trackerAccess.canWriteBasic` is false, or when any snapshot has `inputKind: 'custom'` and `canWriteCustom` is false. It persists only `trackerAccess.revision` and `trackerTargets`, never the full capability.
- `flush` calls `checkProcessingAccess(entry)` per eligible entry. `!access.canWriteBasic` holds all live entries as `tracker-paused` with `heldForTrackerPause` (existing). A current target missing, `inputKind` different from captured, or `canWrite` false holds only that entry as `purpose-paused` with `heldForProcessingPause`. A still-basic entry proceeds across unrelated optional-revision changes and is sent with its captured `trackerRevision`. An entry without captured revision or targets is held. A flush never renews a held entry's revision and never drains held entries after regrant.
- `retry(id)` first checks owner, original date and current permission via `checkProcessingAccess`, sets status `uncertain` (reconcile before resend), and may renew `trackerRevision` and `trackerTargets` from the fresh read when the target kind is unchanged. A basic-to-custom kind change returns false (current-record review). `day-passed` entries return false. The hook triggers `flush()` only when it resolves true.
- `send(entry)` (supplied by the native-UI lane) must pass `entry.trackerRevision` and `entry.trackerTargets` to the shared domain functions in section 4.2 and must not fetch a new revision.

`mobile/lib/use-write-queue.ts`:

```ts
export interface WriteQueue {
  entries: QueueEntry[]; offline: boolean;
  enqueue: (request: EnqueueRequest) => boolean;
  flush: () => Promise<void>; sweep: () => void;
  retry: (id: string) => Promise<boolean>;
  dismiss: (id: string) => QueueEntry | undefined;
}
```
`UseWriteQueueOptions` is unchanged. The hook builds `checkProcessingAccess` from `fetchTrackerAccess(userId)` and `fetchTrackerTargets('habit', [entry.habitId], userId)`.

Decisions (my call): `checkTrackerAccess` is removed (superseded by `access.canWriteBasic`); `enqueue` returns boolean instead of void (call sites that ignore the result still compile).

## 6. Call sites per lane

Shared tests that must change with their modules are the shared lane's concern; only UI callers are listed. "T:" lists existing tests that mock or call the function.

### Web lane

| File | Uses |
| --- | --- |
| `web/src/store/eiyu-store.tsx` | createHabit, updateHabit, reorderQuests, moveBacklogToOneTime, moveOneTimeToBacklog, archiveHabit, restoreHabit, deleteHabit, completeHabit, completeHabitRecovery, undoCompletion, incrementHabitProgress, reorderLongQuests, deleteLongQuest, setStageDoneWithReceipt, saveAtomicLongQuest, fetchTodayHabits, fetchBacklogQuests, fetchLongQuests; must add fetchTrackerAccess, prepareDay, fetchTrackerTargets |
| `web/src/web/WebBoard.tsx` | reorderQuests (store-level) |
| `web/src/web/WebGym.tsx` | fetchGym, logGymWeight, saveGymRoutine, archiveGymRoutine, saveGymExercise, removeGymExercise, deleteGymRoutine, moveGymExercises, uploadGymMedia |
| `web/src/web/gym-media.ts` | uploadGymMediaBody (new `expected`) |
| `web/src/web/WebStatus.tsx` | fetchOrCreateWeeklySummary, regenerateWeeklySummary, fetchSavedWeeklySummary (no change needed) |
| `web/src/web/AccountShell.tsx` | Profile grant/withdraw controls via setTrackerConsent |
| `web/src/web/WebQuestEditor.tsx`, `LongQuestEditorDialog.tsx` | HabitEditorInput / ChainEditorInput |
| Tests | `store/__tests__/eiyu-store.lifecycle|reorder|backlog.test.tsx`, `web/__tests__/WebBoard.reorder.test.tsx`, `WebGym.test|detail|copy.test.tsx` |

### Native-UI lane

| File | Uses |
| --- | --- |
| `mobile/contexts/eiyu-store.tsx` | all habit/completion/chain functions above, fetchTodayHabits, fetchBacklogQuests, fetchLongQuests, createHabit; supplies queue `send`, `readQuest`; new capability state |
| `mobile/contexts/gym-store.tsx` | logGymWeight, archiveGymRoutine, removeGymExercise, deleteGymRoutine, moveGymExercises, fetchGym, deleteGymMedia |
| `mobile/app/(tabs)/board.tsx` | reorderQuests |
| `mobile/app/gym-routine-editor.tsx` | saveGymRoutine |
| `mobile/app/gym-exercise-editor.tsx` | saveGymExercise, uploadPickedGymMedia |
| `mobile/components/eiyu/dev-ball.tsx` | createHabit, completeHabit (dev only) |
| `mobile/components/status/weekly-debrief.tsx` | weekly summary fns (no change needed) |
| `mobile/components/eiyu/account-header.tsx` | Profile controls via setTrackerConsent |
| `mobile/components/board/sync-review-sheet.tsx` | Retry button; the store's `retrySync: (id) => void` becomes promise based because `WriteQueue.retry` now returns `Promise<boolean>` |
| `mobile/lib/gym-media-upload.ts` | UNASSIGNED, see section 1 |
| Tests | `contexts/__tests__/eiyu-store.{lifecycle,offline-queue,reorder,sound,widget,long-quests}.test.tsx`, `gym-store.test.tsx`, `components/__tests__/gym-routine-editor|gym-exercise-editor|board-manual-order.test.tsx`, `lib/__tests__/gym-media-upload.test.ts` |

### Native-queue lane

`mobile/lib/write-queue.ts`, `write-queue-engine.ts`, `use-write-queue.ts` and tests `mobile/lib/__tests__/write-queue-engine.test.ts`, `use-write-queue.test.tsx`. The queue only calls `fetchTrackerAccess` and `fetchTrackerTargets` from shared. Its consumer is `mobile/contexts/eiyu-store.tsx` (native-UI lane): the UI lane passes `trackerAccess` and `trackerTargets` to `enqueue` and reads `retry` as a promise.

### Not callers (no change)

`startGymSession`, `saveGymSession`, `discardGymSession`, `fetchOrCreateWeeklyQuest`, `gatherWeekData`, `createLongQuest`, `updateLongQuest`, `reconcileLongQuestStages`, `setStageDone` have no web or mobile source callers.

## 7. Orchestrator notes

- Types `Quest` and `LongQuest` (`types/eiyu.ts`) gain optional `inputKind` and `canWrite`: shared lane edits, as `types/eiyu.ts` is in its set.
- Dependency: `tracker-access.ts` imports nothing from domain modules; `tracker-input.ts` imports types only from `data/habits` and `data/long-quests`.
- The contract agent did not change any existing domain module. `index.ts` and `types/database.ts` gained only the entries described in the report.

## 8. Late server facts (added by orchestrator, 2026-10-24)

Verified while migrating the older SQL tests onto the 053-056 bundle:

- `delete_habit` on a missing, foreign or already deleted habit now fails with `42501` "Tracker target unavailable." It is no longer idempotent. A queued or uncertain delete retry that gets this error after its own earlier attempt must be treated as settled (already deleted), not as a new failure. Never retry it forever.
- Reorder refusals changed. An out-of-date or partial order is refused before any write (`ET003` when the target snapshot set differs, `42501` when an id is missing or foreign). The client reloads the lane and does not partially apply its optimistic order.
- A duplicate completion for the same habit and day maps to `22023`. Treat it as "already recorded" for idempotent UI and queue reconciliation, never as a reason to create a second row.
