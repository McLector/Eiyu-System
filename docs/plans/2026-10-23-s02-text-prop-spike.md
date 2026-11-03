# S02 approved public Text prop spike — CONCLUDED, LIMITED POSITIVE RESULT

The owner approved “Run this isolated prop-change probe.” Question: does a tiny explicit public letterSpacing change (0→0.01→0.02), compared with an unchanged Text and fresh-start reference, cause correct layout after normal Oppo font changes 1.0↔1.6 while parent state remains mounted? This is a disposable experiment, not an approved product repair. S02/public release remain INCOMPLETE.

## Source evidence and limits

Installed Expo54.0.37/RN0.81.5/Reanimated4.1.7/Worklets0.5.1 are retained. RN TextMeasureCache.h includes fontSize, fontSizeMultiplier, letterSpacing and lineHeight in measurement equivalence/hash. ParagraphShadowNode.cpp dirties measurement on new props and caches content. These facts motivate a different cache-input experiment from the previously failed same-props key remount; they do not identify the phone's root cause or prove a prop change repairs it.

[RN0.81 public Text styles](https://reactnative.dev/docs/0.81/text-style-props#letterspacing) documents letterSpacing; [exact Expo SDK54 font documentation source](https://raw.githubusercontent.com/expo/expo/sdk-54/docs/pages/versions/v54.0.0/sdk/font.mdx) was read before experiment code. The current Expo versioned config URL redirects to latest, so it was not treated as SDK54 evidence; exact sdk-54 config source was read separately.

The upstream [surface-relayout change](https://github.com/react/react-native/pull/53770) has a linked [backout](https://github.com/react/react-native/pull/53997); a merge label alone is insufficient evidence of a supported shipped repair. The installed internal font-layout feature flag defaults false; it is not enabled or adopted. [Small-font inline attachment repair](https://github.com/react/react-native/pull/57132) addresses a different below-1.0 attachment conversion case, not proof for Eiyu's plain Text live1.0↔1.6 clipping. A legacy-architecture toggle is not a simple compatible alternative here: installed Reanimated/Worklets Gradle guards explicitly require the new architecture. No dependency/configuration architecture change follows.

## Approved scope and implementation evidence

Separate package com.mclector.eiyusystem.dev.s02spacingprobe; runtime1.2.0-s02-text-prop-20261023. Standalone Expo/Inter/Text only, no Auth/Router/providers/queues. Synthetic draft and home/recovery markers are parent state, not actual product navigation. Reuse the prior public fontScale Activity handler solely in the experiment. No reload/internal flag/scaling suppression/SDK change/account/provider call. Preserve the repaired Dev APK/data, all earlier synthetic packages and all artifacts; restore Default font and original scratch inputs/output afterward.

Artifacts: `.superpowers/s02-text-prop-20261023`. Two tests first failed against an empty View for missing controls. Implemented explicit public prop updates with mounted leaf/control/parent, unchanged control spacing and dimension observation without automatic spacing changes; two tests then passed. A command initially used a workspace-relative path from the scratch directory and failed to copy the source; no product files changed. That invocation's eventual test run saw the separately corrected source and passed, so the separately recorded tests-green-actual.log is the clean GREEN reference. A test-driver template quoting error was caught by node --check and corrected before execution. Lint output is empty; exit/result collection pending.

Six scratch input before-images and old APK output preserved before staging. Native OTA explicitly disabled; isolated callback schemes/providers and exact standalone markers require compiled-artifact verification. Detached offline build running. No physical font setting changed or reflow result observed yet. Fresh-start reference will intentionally reset only this standalone synthetic draft after preserving both-direction observations; it does not prove recovery across product process death.

Full product suites were already verified for the export repair immediately before this ignored standalone experiment and are not repeated as evidence for native font reflow. No release, S03/S04 or028.

## Physical results and cleanup

Build5m03s/exit0,1027tasks47executed980up-to-date; native/Gradle deprecation notices retained. Compiled gate passed for separate package/runtime/Activity, public fontScale manifest bit, callback/provider isolation, standalone markers and OTA disabled. Package was absent before installation; repaired Dev APK byte equality was checked in RAM. Both unit tests passed; affected lint and targeted probe/test TypeScript exited0.

| Observation | Selected height / latest line callback | Control height / latest line callback | State |
| --- | --- | --- | --- |
| Default1.0, draft and synthetic recovery marker set | 120 / 5 | 120 / 5 | spacing0 |
| Normal Settings→1.6 | 120 / 5 | 120 / 5 | Same Activity/JS boot/draft/route |
| Explicit selected spacing0.01 | 309.3 / 8 | 120 / 5 | Same Activity/JS boot/draft/route |
| Settled1.6 observation | 309.3 / 8 | 120 / 5 | Selected sample visibly complete through END |
| Normal Settings→1.0 | 309.3 / 5 | 120 / 5 | Same Activity/JS boot/draft/route |
| Explicit selected spacing0.02 | 120 / 5 | 120 / 5 | Same Activity/JS boot/draft/route; complete sample |
| Fresh start at1.6, spacing0 | 309.3 / 8 | 309.3 / 8 | New Activity/boot, synthetic draft/route intentionally reset for reference |

Actual scale1.6 reported approximately1.6000000238. Selected Text retained its React host identity in the unit experiment; Activity/JS/parent continuity was directly observed physically before the deliberate reference restart. Fresh reference measurement matches the changed selected Text, while its image is viewport-limited below the first sample; do not claim full fresh-screen/control visibility. The first hot large image includes the generic Simple mode tip over its upper controls; preserve it as occluded evidence, not a fully unobscured before-screen. The subsequent spacing/settled/default images were visually inspected; no tip control or Simple mode preference was activated. Remaining unmodified headings visibly clip at large scale.

Conclusion: the tested tiny public layout-prop update is a **positive plain-Text reflow primitive** in both tested directions, with retained synthetic parent state and a matching cold large measurement. It is not a whole-app repair, proof of a particular native cache defect, TextInput/nested-text/selection/IME acceptance, repeated-cycle result, actual Router/recovery acceptance or permission to change typography throughout the product. No reload/internal flag/scaling suppression/dependency patch/SDK change was used.

Final cleanup PASS: Default1.0 restored through normal Settings; isolated synthetic package/data retained force-stopped; repaired Dev bytes unchanged in RAM and ordinary sign-in visible; direct57321→57321/no57326; no X alias. Six scratch inputs and prior APK output byte-restored, experiment sources/output/APK/images retained. Record consistency assertions passed across both-direction and fresh-reference observations. No Dev data clear, Auth/mailbox/provider operation, hosted change or spend. S02/public release INCOMPLETE.
