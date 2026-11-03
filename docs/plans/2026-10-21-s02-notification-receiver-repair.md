# S02 recurring notification receiver — local repair, scoped physical evidence

The owner approved continued S02 work on the narrowed font design, a supported notification-listener repair and remaining physical acceptance, and asked not to stop for routine decisions. This bounded existing-flow repair uses exact official Expo SDK54 notification APIs; no SDK upgrade, private API, dependency patch, native cache clear or persistence was added. S02 remains INCOMPLETE.

## Product change and tests

`mobile/lib/notification-taps.ts` now subscribes to the public response listener before reading the public synchronous last-response snapshot. It avoids the installed SDK hook's identifier-only filter, keeps the latest response in RAM while sign-in is not ready, and deduplicates matching identifier/date/action deliveries. A live event observed during snapshot acquisition takes precedence. Only default taps navigate; stale callbacks after unmount are ignored, the listener is removed, and a failed cache read leaves live listening available. Existing lane parsing/legacy Board fallback remain.

Tests first observed **6 failed/14 passed** against the old implementation, then **20 passed** after the change. The six surrounding native notification/recovery/root-route suites passed **48 tests**, exit0. Mobile typecheck exited0. Initial affected lint had an import-order warning; moving the existing test import to the top resolved it, and affected lint plus the20 tests passed again. No web/shared/SQL product change was made for this receiver repair; their earlier full-suite counts remain historical rather than being rerun for this bounded change.

This fixes same-runtime delivery handling. It does not claim cross-runtime native-cache consumption, notification account binding, recovery-route priority, or public-reload handover safety. The original isolated SDK-helper failure remains retained as dependency-behavior evidence; the product now bypasses that hook rather than changing it.

## Permission evidence correction

The earlier handover spike skipped physical notification cases after the POST_NOTIFICATIONS grant marker was absent. That was an insufficient preflight: the Oppo is **Android API31**, and the Android13 runtime-permission marker does not establish disabled notifications on this OS. Normal Oppo notification Settings showed Allow notifications already on. No notification permission/channel setting was changed. The actual SDK grant check subsequently permitted the synthetic scheduling below. Earlier references to a proved permission denial are withdrawn; the historical physical cases were skipped, not attempted and denied by Android.

The owner had authorized temporary enablement/restoration if necessary. It proved unnecessary. A later attempt to use the public USB stay-awake service during testing was unavailable; its preserved original value was checked unchanged. No lock method or lock bypass was used.

## Current-source physical harness

Ignored `.superpowers/s02-notification-current-20261021` preserves the actual installed baseline, old scratch source and a separate current mobile/shared source snapshot. Staged current source matched337 files byte-for-byte, excluding the declared root-overlay/app-runtime changes. Existing package/dependency and native-plugin declarations matched before staging. Its release build succeeded **1m27s, exit0,1027 tasks (36 executed,991 up to date)**, with unique runtime `1.2.0-s02-notification-current-20261021`, verified Dev package/embedded current processing APIs/Router, and OTA disabled. Local loopback transport remains a diagnostic overlay; no final release-origin/native policy parity is inferred.

The harness imports the actual repaired receiver and real installed notification SDK, enables its synthetic receiver explicitly, and observes only actual Board-routing calls/allowlisted lanes before forwarding to the original Router method. The ordinary product receiver remains sign-in gated. The phone stays signed out, so protected Board navigation returns to sign-in; this is **real SDK-to-receiver routing-call acceptance, not authenticated Board-render acceptance**. No mailbox/Auth/provider operation is needed for this harness.

Throwaway harness tests observed RED2/GREEN3 for own-ID scheduling/cleanup and permission refusal, then RED1/GREEN1 for its explicitly enabled UI. It uses only two fixed synthetic IDs and the existing reminder channel, and never calls a permission request, all-notification cancellation or native cache clear. A native Settings surface remained foreground on first launch; explicit Dev activity launch then showed the correct observer. No application crash was established from that missing first observation.

| Physical event | Actual receiver result |
| --- | --- |
| First synthetic A | One routing call, daily lane. |
| Later synthetic A, same identifier | Second routing call, daily lane. This is the repeat-delivery case hidden by the old SDK hook. |
| Synthetic B | Third routing call, one-time lane. |
| Explicit cleanup | Receiver disabled; cancellation/dismissal of only the two synthetic IDs completed and displayed cleaned. No native response-cache erasure is claimed. |

App-only initial/repeat-A/B/cleanup images were captured under empty/synthetic-field and overlay guards; repeat-A/B pixels were inspected. Notification-shade nodes were handled only in RAM to tap the exact synthetic title; no shade screenshot, unrelated content or notification payload was emitted/stored. Existing reminders and all experiment artifacts were preserved.

## Ongoing acceptance checkpoint

The harness APK is preserved, and a second **clean current-source** Dev candidate without the observer was built under ignored `.superpowers/s02-current-clean-20261021` (1m20s/exit0,1027 tasks36executed991uptodate), gated and installed without clearing data. Its retained mailbox prepare diagnosis and both late-response/account-switch cases subsequently passed; see [qualified current-device acceptance](2026-10-21-s02-current-device-acceptance.md). Recovery receiving continues separately. Preserve the actual baseline until final cleanup is verified. The prior scratch-source snapshot remains recoverable; do not delete any newly staged or old ignored artifacts.

The narrowed font design keeps app-triggered reload absent: initial/cache emptiness cannot exclude an arrival after the check, and token-free cold replay/new-input counterexamples remain open. No public release, deployment, provider contact/inference, paid spend, staged change, commit,028 or S03 is authorized by this repair.
