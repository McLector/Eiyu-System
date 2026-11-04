# S02 tracker consent, client side: independent review (2026-11-03)

A fresh read-only reviewer covered the shared, web and native client work for tracker consent, the offline queue, reminders, the widget filters and AppText. It ran no tests. This records an AI review, not a human or legal one.

No High findings. Every protected write traced goes through `invokeTrackerWrite`, which copies the revision and targets before its first await and pins the session owner. Failed or foreign access reads fail closed.

## Medium

| # | Finding | Where | Disposition |
| --- | --- | --- | --- |
| C1 | A 22023 is treated as "already recorded", but 054/057 map unique, check, not-null and FK violations all to 22023. A completion failing for another reason can read as success. | `data/completions.ts:42`, `mobile/lib/write-queue.ts:190`, web `eiyu-store.tsx:351` | Fix, tests first: settle only after re-reading the quest. |
| C2 | Web Profile grant or withdrawal does not refresh the quest lists, so the board keeps a stale `canWrite`. Mobile does refresh. | `web/src/web/TrackerPermissions.tsx:16` | Fix, tests first. |
| C3 | Offline at cold start nothing can be queued, because the tracker read is never persisted. | `mobile/contexts/eiyu-store.tsx:89` | Owner decision: see the checkpoint. |
| C4 | `runtimeVersion` not bumped for the native `fontScale` change. | `mobile/app.json` | Fix: 1.3.0 with the APK rebuild. |
| C5 | The notices promise removal after 30 days, but the job is not live. | `legal-content.ts`, 061 | Release gate: enable the job with the notices. Added to the checklist. |
| C6 | Web `runLifecycle` and `runMove` capture a stale `userId`, so a refused write does not re-read access. | web `eiyu-store.tsx` near 505 | Fix, tests first. |

## Low

| # | Finding | Disposition |
| --- | --- | --- |
| C7 | Reminders and the widget treat unknown capability as granted; `DELIVERED_REMINDER_NOTICE` is never shown. | Review when fixing C3, since both concern unknown access. |
| C8 | Store-level `attemptedDeletes` treats a later 42501 as a successful delete after a confirmed failure. | Fix: remove the store copy. |
| C9 | An expired-hold notice can reach the wrong account during a switch. PLAUSIBLE; the message has no names. | Fix: check `disposed`. |
| C10 | A teen can briefly see the adult notice while the age read loads or fails. | Fix: hold the grant button until the read settles. |
| C11 | Concurrent consent toggles, no confirmation on withdrawal, web Gym wording for a paused account. | Reconsider after the owner's own testing. |
| C12 | `gym/[id].tsx:190` uses a raw `TextInput`; the guard misses some import forms; `InsideAppText` leaks through inline Views. | Fix the input and the guard. |
| C13 | `dev-ball.tsx:245` calls `undo_habit_completion`, revoked in 054, so the DEV wipe fails. | Fix or remove. |

## Checked and sound

Shared access parsing and target reads are strict and owner-bound. `invokeTrackerWrite` rejects caller-supplied targets and has no direct-write fallback. Gym uploads carry the captured revision. The tracker and age queries stay out of the persisted cache, and only the age band is cached, never the birthday. The queue drops other users' entries, Retry keeps the original date, and expiry keeps exactly 30 days. AppText changes nothing at launch, and the config plugin is idempotent.

## Not checked by the reviewer

`ReviewRequest`, the mobile long-quest editor and gym screens in depth, the widget task handler, notification taps, sign-out cache clearing, and native Android behaviour of `fontScale`.

## Outcome (2026-11-03)

| # | Result | Commit |
| --- | --- | --- |
| C1 | Fixed. A 22023 settles only if the completion row is really there. | `b8cba72` |
| C2 | Fixed. A web grant or withdrawal reloads the quest lists. | `c3c6464` |
| C3 | Fixed in two parts. A per-account marker of the last confirmed access decides whether to queue; it holds custom access too, because every existing or named quest is custom. That marker alone did nothing on a device, because the saved quests were wiped on every cold start (see below). | `c883def`, `62171fb` |
| C4 | Fixed. App and runtime version 1.3.0. | `51ee47d` |
| C5 | Still a release gate. | |
| C6 | Fixed with C8. A refused write now re-reads access for the current account. | `f7e7a14` |
| C7 | The notice now shows after a custom withdrawal. Unknown access stays allowed for reminders and the widget, per design line 81 ("after observed withdrawal"). | `1aa1852` |
| C8 | Fixed. A delete settles only if an earlier attempt got no answer and the reply says the target is gone. | `f7e7a14` |
| C9 | Fixed. | `4943982` |
| C10 | Fixed for loading and offline: neither notice shows, a grant waits, withdrawal stays open. A failed read still shows the adult wording with the grant open, accepted because the server decides what the account may do. | `8cd795e` |
| C11 | Open, to reconsider after the owner's own testing. | |
| C12 | Input and guard fixed. The `InsideAppText` leak through inline Views is accepted. | `969299a` |
| C13 | Removed the wipe from the dev menu. | `19ef2d6` |

**Found while fixing C10, not by the reviewer:** web Profile gave its permissions and data export sections the same key, so a re-render could leave a stale copy on screen. Fixed in `514c7ec`.

**Found in the emulator batch, not by the reviewer:** the saved quests have never survived a cold start, online or offline. The account cleanup treated "no user" during the session check as a sign-out, removed what the restore had just loaded, and offline then saved the empty cache over the good copy. A device with no connection showed "Couldn't load quests". Only queries whose last fetch succeeded were saved as well, so one failed refresh dropped good data from the copy. The unit tests for C3 missed this because their mocks kept returning quests while "offline" and had no loading phase for the session. Both causes are fixed in `62171fb`, and this behaviour is on `main` too, so the fix matters beyond S02.

These results rested on unit and component tests until the emulator batch below.

### Emulator batch, 2026-11-04

Release APK from `62171fb` at version 1.3.0 against the local stack, on an x86_64 emulator at API 35. The artifact gate passed.

| Check | Result |
| --- | --- |
| Offline cold start shows saved quests and profile, twice in a row | Passed |
| Offline tap queues, and survives a restart while still offline | Passed, 0 rows in `habit_completions` |
| Reconnecting without a restart sends it | Passed, exactly 1 row, streak 1 |
| C4: version 1.3.0 and `fontScale` in the installed Activity | Passed |
| Draft in the quest editor across 1.0 and 1.6, several cycles | Passed: same Activity and process, draft and focus kept, text grows and rewraps |
| Typing and return in a multiline field after a cycle | Passed |
| C12: typed gym weight across 1.0 and 1.6 | Passed |
| Cold launch at 1.6: Board, Gym, editors | Passed |
| Discarded draft leaves no write | Passed, 0 rows |
| Account switch shows nothing from the previous account | Passed |
| C10 and teen account: plainer wording, review step, agreement unavailable | Passed |

**Not covered here:** auth fields and a selection range during a font change, and anything specific to a physical phone. Those stay on the Oppo checklist.

**How to test a font change:** leave the app, change the size, come back. React Native reads the new scale when the app resumes, so changing it with `adb` while the app stays in front leaves old text beside clipped new text. That looks like a product bug and is not what a person sees.

### Three fixes after the batch, 2026-11-04

The emulator batch showed three problems the reviewer had not listed. All three are fixed test-first and checked on a release APK from `8fa3f22`, same emulator and local stack. The artifact gate passed.

1. **Reminders on Android 13 and newer (`0e2f846`, `8fa3f22`).** Reminders default to on, but the app only asked for permission when someone turned them on by hand. Every new account saw a failure banner Retry could not clear, and reminders never rang. The app now asks when a first quest is saved or when Retry is tapped, and never on launch or restore.
2. **Offline launch (`0e2f846`).** The sync cancelled every scheduled reminder before fetching the quests, so one launch with no connection removed them all and showed a raw "TypeError: Network request failed". The quests are now fetched first.
3. **Text under the status bar (`1316026`).** The top inset was padding inside the scrolling content on the sign-in, sign-up and recovery screens, so it scrolled away. It now sits outside the scroll view.

The first attempt at fix 1 was wrong in a way only a device could show. It looked for `undetermined`, and its test mocked that value, but on API 33 and newer Expo SDK 54 reports `denied` with `canAskAgain: true` both before the first prompt and after one refusal. The fresh install therefore said notifications were refused before ever asking. `8fa3f22` keeps the app's own record of having asked, and the tests now use the real native shapes.

| Check | Result |
| --- | --- |
| New account with no quests: launch and sign-in | Passed: no banner, no prompt, no alarms |
| Saving the first quest | Passed: one system prompt, and after Allow 7 alarms and no banner |
| Cold restart after allowing | Passed: no second prompt, 7 alarms kept |
| Account with a quest on a wiped app | Passed: "needs permission" banner, no prompt at launch, 0 alarms |
| Retry, refuse, Retry, refuse | Passed: two prompts, then the refused wording. The permission reads `USER_FIXED` after the second |
| Retry, a further quest save and a cold restart after that | Passed: no prompt in any of them, refused wording kept |
| Open phone settings | Passed: opens the system settings screen |
| Granting afterwards, then Retry | Passed: banner clears, 14 alarms for 2 quests |
| Offline cold start with reminders scheduled | Passed: 7 alarms before and after, no `TypeError` banner, saved quest shown |
| Reminder time changed on the server while offline, then reconnect with no restart | Passed: alarms moved to the new time |
| A reminder reaching the phone | Passed: notified at the scheduled minute with the quest name and "Time for your quest" |
| Scrolled sign-up form | Passed: text clips below the status bar |

**Not covered here:** Android 12 and older, which the Oppo will exercise only in passing since it has no such prompt, and reminders across a device reboot.

**Seen and left alone:** offline with a queued change, the Board stacks the "1 change waiting" line above the red offline message. The Gym and tracker consent choices read like plain text links. Empty password fields show placeholder dots that look prefilled. `privacy@eiyusystem.app` wraps oddly at font scale 1.6.

**Emulator trap:** the first run of the first-quest check showed no prompt because the emulator's Android system died at that moment. The PC had 428 MB of memory free, with a finished Gradle daemon holding 1.3 GB. Stop the daemon after a build, and check `dumpsys` answers before believing a missing dialog.

### Oppo batch, 2026-11-05

A physical Oppo phone (CPH2113, Android 12, API 31) over USB, against the local stack through `adb reverse`, on the release APK from `8fa3f22`. The phone already held that exact build: its installed `base.apk` and the archived APK have the same SHA-256, so nothing was reinstalled. The font size was changed through the phone's own Settings slider, with the app left and resumed each time. `adb shell settings put system font_scale` is refused on this phone (`WRITE_SETTINGS` denied to the shell). The largest slider stop reports `font_scale` 1.6.

| Check | Result |
| --- | --- |
| Step 0: version 1.3.0 and `fontScale` in the installed MainActivity | Passed: configChanges `0x400007b0` includes `0x40000000` |
| Cold launch at 1.6: Board, Status, Chain, Gym, the quest-type chooser, the habit editor | Passed: text complete, nothing clipped |
| Editor draft across 1.0 to 1.6 and 1.6 to 1.0, several cycles | Passed on five of six changes (see below): same Activity and process, route and draft kept, focus and keyboard back, text grows and every box re-sizes |
| Multiline Note with text selected, both directions | Passed: the selection and its toolbar stayed, and the toolbar re-laid itself out at the new size |
| Typing, Return and cursor in the multiline Note after the cycles | Passed (the case the font-gate handoff listed as unproved) |
| Sign-in form with an unsent email draft, both directions | Passed: same process, text kept, focus and keyboard back, fields and labels fit at 1.6 |
| No duplicate writes from the font change | Passed: `habit_completions` 6 before, 6 after. The write queue was not inspected |
| Text really grows at 1.6 | Passed |

**One failure, not explained.** The first change after a cold launch at 1.6 (1.6 to 1.0, with a word selected in the multiline Note, driven by hand) returned to the same Activity and process, but the screenshot showed the Board with no editor open. The Board rows and the quest-type chooser cards kept their 1.6 heights around 1.0 text. Later changes did not reproduce it: a leave-and-return with no font change, 1.0 to 1.6, 1.6 to 1.0, both again with a selection, and a repeat of the same set-up (cold launch at 1.6, editor with a two-line draft, first change to 1.0; the selection was not confirmed in that last run). The stale Board spacing was gone afterwards. The cause is open. Treat the font gate as passed on the evidence above with this one unexplained miss recorded, not as proof it cannot happen.

**Evidence caveat.** The helper scripts (`oppo-snap.ps1`, `font-wait.ps1`, `ui-oppo.ps1`) read `uiautomator dump` output. On a screen with continuous animation the dump fails with "could not get idle state" and the scripts then read the previous dump file. Their "draft present" and "focus" lines after a font change are therefore not evidence. Every result above rests on screenshots. The scripts should delete the file before dumping and fail loudly.

**Seen and left alone:** Status shows "The System couldn't load the heatmap." in red for the test account. It is not a font matter and was not investigated, so it may be specific to the local stack. The Board's second quest meta line sits under the floating buttons at 1.6, which looks like scroll overlap and was not scrolled to confirm.

**Not covered:** a selection made by a person's finger (the long-press was made with `adb`), the sign-up form at 1.6, the Register and recovery screens, Android versions other than 12, reminders across a reboot, and the write queue contents.

**Cleanup:** the five disposable test accounts were deleted (0 remain, 22 other accounts untouched), the reverse rules were removed, font size is back to Default and the display size override is unchanged.
