# S02 safe font refresh — adversarial design review

October20. The owner requested “Review and double check to see if there's anything we might have missed or failed to consider. Go” instead of approving the written design. This is an inline author review of the proposed design against retained device evidence, installed source and official references. It is not an independent review or implementation/physical acceptance. No new reviewer was delegated.

**Outcome: the initial proposal was not ready for implementation.** The [design](2026-10-20-s02-safe-font-refresh-design.md) has been corrected, with feasibility gates explicitly open. S02 remains INCOMPLETE. No product code, phone state, backend, deployment or provider configuration changed during this review.

## Findings and disposition

### 1. Blocking: state can disappear before the JS guard acts

The device ledger already records quiet-release Weekly returning to Board after a system font change, before app navigation. Its public manifest fontScale experiment retained Activity/Weekly but did not reflow text. See the October19 evidence in [the device ledger](2026-10-16-s02-device-verification.md), particularly the paragraphs beginning “The quiet release was placed” and “A throwaway native candidate”. Android also documents [configuration-change activity recreation](https://developer.android.com/guide/topics/resources/runtime-changes).

A guard around a later reload cannot preserve a form already lost to this earlier event. The revised design requires a minimal, separately reviewed exact-SDK54 activity-continuity experiment before broad integration. If public manifest handling is proposed, preserve existing configuration handling, verify generated/merged manifest and supported event forwarding, and use an appropriate new native runtime/binary. Dirty forms and RAM recovery must survive both scale directions before pressing Refresh. The prompt and finish/cancel controls must actually be usable at large text. **Feasibility unresolved; historical partial APK is not accepted.** Ordinary process death does not gain a promise to preserve secret drafts.

### 2. High: a successful Auth preparation could veto itself

The initial rule invalidated preparation on every session transition, yet its own public refresh emits TOKEN_REFRESHED. Installed `node_modules/@supabase/auth-js/src/GoTrueClient.ts` saves the session at line5065 and awaits subscribers at line5084 before resolving the refresh. The proposed universal invalidation would reject ordinary successful preparation; awaiting SDK work inside a subscriber could create a wait cycle.

The revision separates identity transitions from token revisions and permits only the expected same-owner event during its owned preparation, followed by final validation. Sign-out/sign-in, A→B→A, recovery and unrelated account/session replacement still veto. Callbacks only record state; no SDK-await inside them. Late completion cannot revive a timed-out intent. **Specification corrected; exact SDK coalescing, storage, lifecycle and event-race tests remain unperformed.**

Stopping automatic refresh is not a universal SDK/request drain. Authenticated reads/subscriptions can also trigger session acquisition. All such participants must be covered before the quiet point can be trusted. Offline signed-in refresh remains deferred; ordinary offline quests stay available. No stronger hosted request-drain claim follows.

### 3. High: old incoming events can look new after reload

`mobile/lib/notification-taps.ts:20` reads the native last notification response; its handled identifier/date is held only in a React ref at line21. The JS reload resets that ref. A previously handled response can therefore navigate again and override the intended tab. The [official SDK54 notification source](https://github.com/expo/expo/blob/sdk-54/packages/expo-notifications/src/NotificationsEmitter.ts) exposes last-response and clear operations, but clearing broadly during commit can erase a concurrent newer tap. Consumed initial Auth intents also require an explicit old/new distinction.

The revision requires supported one-time consumption and concurrent-new-event acceptance before enabling affected paths. Raw URLs, tokens and secret digests cannot become replay records. A RAM epoch alone does not prove cross-runtime handover. **Feasibility unresolved.** The post-invocation link window must remain fail closed; lost recovery may require reopening/requesting a link, never automatic credential replay.

### 4. High: queue promises and permissive decoding cannot prove durability

`mobile/lib/write-queue-engine.ts:110` defines persistence whose rejection is caught at line118. Loading also substitutes null on a storage-read failure. `mobile/lib/write-queue.ts:288` decodes malformed content as an empty array. An awaited existing promise or empty decoded value can therefore falsely certify a safe restart.

The revision requires a new truthful checkpoint result, strict canonical owner/revision readback, and confirmed key absence for an empty queue. All enqueue/Retry/dismiss/expiry/held-state changes must affect its revision. A denied action cannot disappear behind optimistic UI. Uncertain nonqueued writes need their existing result-check path, not a generic promise rejection or screen close. **Specification corrected; implementation and real-write acceptance remain open.** This does not claim to fix every historical queue persistence failure.

### 5. High: returning from Home is not proof of a fresh runtime

Once native reload is invoked, a rejection or timeout does not prove a restart cannot still happen. Releasing a React-owned lock on provider remount would let a late restart interrupt fresh work. Going Home and returning can resume the same runtime.

The revision keeps the post-dispatch latch for the JS runtime lifetime, across provider/Strict Mode remounts, and never automatically retries. An unconfirmed restart requires fully stopping and reopening the app; Android App info/Force stop instructions may be needed. Never clear storage or uninstall. Before invocation, cancellation remains reversible; actual outstanding operations retain their leases until settled. **Specification corrected; no-op/late native behavior and usable recovery instructions remain physical gates.**

## Other boundaries retained

- A tab ticket is a display preference, not permission or proof of the same login session across process death. No field values, full back stack, credentials, callback URL or secret digest may be stored.
- The five-minute durable ticket and bounded preparation need clock-change/replay handling. Active attempts use monotonic elapsed time; stale or ambiguous tickets forfeit restoration without deleting normal app data.
- Route selection must finish before queue dispatch or automatic read-or-create behavior, including transient Router mounts. No extra AI request, resend, held-action Retry or S04 trigger/quota change is authorized.
- Activity preservation, JS reload, process death and server response ambiguity are distinct events. Passing one does not prove the others safe.
- Matching runtime/build/origin, image inspection, actual held local writes, account switches and recovery remain required. The previous spike used older scratch source; current consent/queue source has no matching native acceptance.

## Next step and review limits

Revise and review the minimal activity-continuity/prompt and incoming-event feasibility experiment before any broad app coordinator implementation. A future implementation plan must put those proofs first and stop if they fail; written design and plan approval are still pending. No experiment/build/install is authorized merely by this review record.

This review inspected source and historical qualifications; it did not rerun software suites or physical checks. Earlier suite counts remain historical checkpoints for their recorded source. No new passing test or successful repair is claimed. Preserve all dirty work, fixtures, ignored artifacts and numbered handoffs; do not create028 until all S02 gates actually close.

## October21 subsequent evidence — narrow prerequisite only

After explicit approval of a separate scratch-only probe, the [continuity experiment](2026-10-20-s02-font-continuity-spike.md) observed the same actual Activity instance/JS boot and retained synthetic signup draft/token-free invalid recovery route through both font directions. The native blocked notice and these existing exit controls were usable at1.6; clipping remained elsewhere. Finding1 now has positive limited feasibility evidence, while all-form/secret recovery/current-client and combined-reload acceptance remain open. Finding3 incoming-event handover is still unproved. No broad implementation approval follows. Actual baseline/default font/direct USB were restored and verified; S02 INCOMPLETE.

## October21 incoming-event source investigation

The owner asked to continue. Read-only review checked exact installed expo-notifications0.32.17, expo-linking8.0.12, Router6.0.24 and RN0.81 source, plus the official SDK54 notification/linking sources. No new product or experiment behavior was implemented in this step.

- The installed notification hook's compiled `determineNextResponse` compares request identifiers only, retaining the previous response when another delivery uses the same identifier. Eiyu's outer hook compares identifier/date, but its recurring-reminder test mocks the SDK hook itself and directly supplies the second response. That test does not cover the installed hook's filtering. This is a source-level integration concern, not yet a device-proved missed notification.
- Installed native NotificationsEmitter clears only its last-response bundle. NotificationManager separately retains pending-response collections and replays them to added listeners; its addListener code does not consume those collections. A successful public clear is therefore not evidence that every native replay source is empty. The JS clear event resets hooks, not the manager's retained pending entries.
- Android RN getInitialURL reads the Activity's ACTION_VIEW intent data without consuming it. Expo Linking also retains a companion initialURL. Installed Router's Android path uses RN initial-URL retrieval; its per-runtime memoization does not prove cross-runtime consumption. Eiyu's +native-intent currently ignores the initial/warm distinction and hands recovery credentials off in RAM. Its existing consume helper empties that JS pending transfer once, not the native intent. No public one-time consume-initial-link operation was found in the inspected APIs; do not invent one or use native/private field access by assumption.

These findings strengthen the need for actual old-versus-new event observation before adopting a restart handover. A proposed separate disposable spike uses only synthetic local reminders and token-free links across public reload, including repeat delivery with the same request identifier and a new tap/link during handover. It would use existing notification permission only, preserve the installed baseline, avoid Auth submissions and real callback credentials, and touch/cancel only its own synthetic notifications. No blanket clear of unrelated notifications/cache, reminder-settings change, backend/provider request or product receiver change is implied. Approval of this concrete new probe remains pending; previous manifest-continuity approval does not cover it. No physical handover pass is claimed.

### Subsequent approved spike — counterexamples observed

The owner then approved that concrete probe with Go. The [results](2026-10-21-s02-input-handover-spike.md) reproduce cold token-free launch-intent replay and failure of a near-reload B arrival to take precedence over old Router initial A, with stable B control. Warm A did not replay through RN/Router but remained cached by Expo. Notification permission was unavailable and left unchanged; no physical notification cases or cache clear ran. The actual compiled SDK-helper same-ID/later-date reproduction failed and is retained unfixed; observer tests2 GREEN. Finding3 is now a demonstrated blocker for the tested public-reload approach, not merely a speculative concern. No secret-bearing callback/account-switch pass/failure follows. Exact baseline/source/default font/direct USB cleanup verified. S02 INCOMPLETE.

## October22 Text leaf probe CONCLUDED — negative reflow result, cleanup verified

The approved isolated SDK54 Text probe completed after physical unlock. AtDefault1 both samples measured120/5lines. Normal Settings1.6 updated the public scale and selected line callback8 while both heights stayed120. Ordinary rerender and explicit plain Text key remount left120; settled unobscured image visibly clipped both samples. Same actual Activity instance/JS boot/exact synthetic draft/parent recovery marker through1↔1.6, key counters0→1→2. Parent marker is synthetic, not real Router/recovery acceptance. Text-key-only is insufficient; no product repair adopted and no specific native cache root cause proved. Do not broaden to keyed screens/providers or another unapproved probe.

Two initial driver preflight stops after ready were not app failures; subsequent sanitized direct launch and guarded observations worked. Original large-before image has a transient generic OS Simple mode tip missed by the pre-capture guard; retained but not unobscured evidence. Settled large image and Default images were inspected. Source testsRED2/GREEN2, lint0, inherited scratch handover test type error disclosed; build2m2s0 and compiled gate passed.

Final cleanup explicitPASS: six scratch inputs and old build output byte-restored, all experiment inputs/APK/images preserved, isolated synthetic package/data retained force-stopped. Actual baseline Dev byte-equal in RAM/signed-out visible/font1/direct57321/no57326/noX, no Dev data clear. Seven-record consistency assertions passed for negative finding+cleanup. Full report: 2026-10-22-s02-text-leaf-spike.md. No account/provider/backend/production/spend operation. Supported full font repair remains a gate; S02 INCOMPLETE, no028/S03.

## October23 approved next font probe — underway, no repair claim

After the repaired export client's accepted physical refusal/cleanup, read-only installed-source/upstream review found a distinct cache-input hypothesis: tiny explicit public letterSpacing changes, rather than remounting identical Text props. Owner explicitly approved the isolated prop-change probe. See docs/plans/2026-10-23-s02-text-prop-spike.md. Two fixture testsRED→GREEN; affected lint0; targeted probe/test TypeScript0. Separate-package/runtime SDK54 build running with OTA disabled, preserved repaired Dev baseline and six scratch input/output before-images. No product font change, internal flag, scaling suppression, dependency/SDK change, account/provider call or fresh physical reflow result. Current observed phone connected/awake/font1.0. Full-font/real Router/recovery/write acceptance remain open; S02 INCOMPLETE, no028/S03/S04.

## October23 public layout-prop experiment — limited positive finding, cleaned up

The explicitly approved disposable public letterSpacing probe completed. See docs/plans/2026-10-23-s02-text-prop-spike.md. Default bothText120/5lines; live1.6 unchanged120; selected0.01→309.3/8lines with visible END while control stayed120; return1.0 selected stayed309.3 until0.02→120/5. Same actual Activity/JS boot/exact synthetic draft/parent route marker before deliberate reference restart. Fresh1.6 both309.3/8 matches the selected measurement. This is positive plain-Text feasibility, not whole-app/Router/recovery/TextInput/nestedText/repeated-cycle acceptance or a specific native root cause. Unmodified headings still clipped. First hot image has a generic OS tip over upper controls; settled selected images were inspected. No unrelated setting changed.

TestsRED2→GREEN2/lint0/targetedtypes0/build5m03s0/compiled isolation and OTA gatePASS. Final cleanupPASS: all6scratchinputs/oldoutputbyte-restored, repaired Dev bytes unchanged in RAM/sign-in visible, Default1.0/direct57321/no57326/noX; separate synthetic package/data force-stopped and retained; all artifacts preserved. No font product change, reload, internal flag, scaling suppression, dependency/SDK change, account/provider/hosted/spend operation. Additional target/cycle proof and reviewed product design are required before adoption. S02/public release INCOMPLETE; no028/S03/S04.
