# S02 input handover spike — COUNTEREXAMPLES FOUND, NOT AN ADOPTED REPAIR

The owner approved the concrete scratch-only handover probe with “Go”. Purpose: distinguish cached/consumed input from a new arrival across Expo SDK54 public reload, using only synthetic local reminders and token-free links, existing permissions and preserved baseline. Product receiver behavior was not changed. S02 remains INCOMPLETE.

**Later permission correction:** the old notification preflight was insufficient on this API31 phone: missing Android13 POST_NOTIFICATIONS metadata did not prove notifications were disabled. Allow notifications was already on; no permission setting changed. The skipped cases below remain historical non-observations. Subsequent actual SDK-gated repeat-delivery evidence and the bounded listener repair are recorded in [the receiver report](2026-10-21-s02-notification-receiver-repair.md). Link replay/new-input counterexamples remain valid and unresolved.

## Scope and preparation

The Oppo was connected, showing ordinary Dev sign-in, at font1.0. Retained local Auth/database/mailbox were healthy. Android POST_NOTIFICATIONS permission was not granted; no explicit app-op allow/deny record existed. Permission was left unchanged. **Physical notification cases were blocked and not run.** No local notification was scheduled, sent, canceled or cleared, and no notification channel/settings were changed.

Ignored `.superpowers/s02-handover-20261021` preserves the actual installed baseline APK and original scratch layout, +native-intent, app.json, runtime strings and previous build-output APK. Only the existing ignored scratch snapshot received an inert observer overlay and counters in the existing +native-intent hook. Its original receiver return behavior was retained. Counters store only initial/warm counts and A/B/none/other classifications in RAM; no raw link, token, field value or secret digest. The classifier recognizes only exact token-free synthetic URLs and rejects extra query/hash contents to other.

Read exact official SDK54 notification/linking/reload sources and installed expo-notifications0.32.17, expo-linking8.0.12 and Router6.0.24. Two probe tests observed RED against stubs then GREEN for strict URL redaction and explicit duplicate-suppressed reload. A separate test against the **actual installed compiled SDK helper** expected a later delivery with the same notification identifier to replace the old response: it failed, retaining date1 rather than date2. This failing reproduction is retained and unfixed. It is not a physical missed-tap proof or a claim that the product suite passes.

The isolated offline build succeeded **3m46s, exit0,1027 tasks (39 executed,988 up to date)**. APK gate confirmed Dev package, compiled MainActivity configuration, unique native runtime `1.2.0-s02-handover-20261021`, embedded observer/reload/Router markers and OTA disabled. It did not add public fontScale handling or any native override. Installed over Dev without clearing app data. The first launch did not become visible and its screenshot guard refused capture; sanitized checks found an awake phone, launcher focus, existing Dev process and no crash dialog. Explicit activity launch then reported OK and the observer became visible. No app crash was established, no service/application log dump was read and no missing observation was called a pass.

## Physical link observations

All links were the same actual Dev recovery route with only the synthetic query marker A or B and no credentials. Invalid-link screens cannot begin recovery authentication or update a password. The observer displayed RN initial URL classification, Expo cached URL classification, direct warm-event count and existing Router native-intent initial/warm counts. It never displayed or persisted the URL. Each public reload was explicitly pressed with no account write, form draft or provider request pending.

| Case | Observed result |
| --- | --- |
| Ordinary launch | RN none, Expo none; existing Router initial hook classified the root as other. Ordinary sign-in visible. |
| Warm A in an existing runtime | Direct listener saw A once; native-intent warm count incremented and classified A; actual invalid recovery screen opened. |
| Leave warm A, then public reload | New JS boot. RN initial none, Expo cache A, Router initial root/other; ordinary sign-in remained. Warm A **did not** reopen recovery through this Android Router path, although Expo's separate cache retained it. |
| Cold launch A after stopping only Dev | New process/runtime: RN A, Expo A, Router initial A; actual invalid recovery screen visible. |
| Leave cold A, then public reload | New JS boot: RN A, Expo A and Router initial A again; actual invalid recovery screen reopened after it had been left. **Stale launch-intent replay reproduced.** |
| New B near reload after leaving the replayed A | Driver pressed public reload, then used a150ms host delay before dispatching token-free B. New JS boot reported RN A, Expo B, Router initial A and no new-runtime warm callback. New B reached the Expo cache, but the observed Router initialization processed old A. **The new arrival did not take precedence in this attempt.** |
| Stable-runtime B control afterward | Same B URL without reload produced one direct warm B event and one Router warm B classification; actual invalid recovery screen opened. The B marker/receiver were valid outside the handover. |

App-only images were saved with synthetic/empty-field and overlay guards and visually inspected. Normal, warm-A, warm-after-reload and cold-A/replayed-A images showed the expected screens. The near-reload B image showed the observer's conflicting A/B metrics while the underlying recovery body was absent at that captured instant; it is **not** proof of a fully rendered recovery body or successful callback acceptance. The runtime/native-intent metrics and stable B control establish the narrower input-selection counterexample. The150ms value is a host delay after the press, not a precise measurement of native teardown/listener registration. One tested timing is not an exhaustive race study.

## Interpretation and next boundary

Public reload alone provides neither consumed cold-intent semantics nor reliable new-input priority for this tested sequence. Consuming Eiyu's JS RAM transfer once does not consume the Activity launch intent. Substituting Expo's cached URL as always fresh is also unjustified: the warm-A control showed it persisting after reload. No token, bearer URL or secret digest may be stored to repair this. Do not enable product guarded reload on the strength of the earlier manifest continuity result. The current safe-refresh approach remains blocked pending a separately reviewed supported input-ownership/consumption design or a narrower refresh availability rule with explicit limits.

Notification handling also remains unresolved: the installed SDK-helper reproduction is failing; physical cached/repeated/new notification cases were not attempted because existing permission was unavailable. No blanket notification/cache clear is authorized as a substitute. All other S02 font/write/Auth/bootstrap, receiving/origin, consent/authority, drain/cache and data-request/retention gates remain open. These token-free counterexamples do not prove an actual secret-bearing callback, account-switch or app race failure/pass.

## Cleanup verified

Four scratch inputs were restored byte-exact; their experimental versions, observer modules/tests, failing SDK reproduction, driver, build artifacts and all images remain ignored and retained. Previous scratch build output restored; temporary X alias absent. Preserved actual installed baseline reinstalled without clearing data, and installed APK bytes compared equal in RAM with only equality emitted. Ordinary sign-in/no probe/no recovery route observed. Font remained1.0; direct USB57321 confirmed,57326 absent. No signup, verification/recovery email, password update, tracker mutation, provider call/contact, production configuration, deployment, paid spend, staged change, commit,028 or later phase. Public release remains blocked.
