# S02 public SDK54 reload font spike — CONCLUDED, NOT AN ADOPTED REPAIR

The owner approved this disposable Oppo experiment, then confirmed the phone was unlocked. This is not approval to add a product reload hook or to activate/release anything. S02 remains INCOMPLETE.

## Question and boundaries

Can Expo SDK54's public `reloadAppAsync` recover the observed hot font-scale layout without making route/draft or pending-write recovery unsafe? The exact [SDK54 Expo export](https://github.com/expo/expo/blob/sdk-54/packages/expo/src/Expo.ts), [reload contract](https://github.com/expo/expo/blob/sdk-54/packages/expo-modules-core/src/reload.ts) and [Android delegate](https://github.com/expo/expo/blob/sdk-54/packages/expo-modules-core/android/src/main/java/expo/modules/kotlin/defaultmodules/CoreModule.kt) were read. It reloads the same JavaScript bundle through ReactDelegate; it promises no draft or navigation persistence.

The installed baseline Dev APK was copied before changes, and the scratch root layout and prior build-output APK were preserved. A throwaway overlay exists only in the ignored retained scratch snapshot. It displays inert sample text, public fontScale, measured sample height and a nonsecret runtime boot marker, plus an explicit reload button. Two tests first failed against a null stub, then passed for explicit reload/duplicate-press suppression in one runtime and safe failure/retry. No product source, internal RN flag, font suppression or SDK version was changed.

The native experiment uses the retained Dev package `com.mclector.eiyusystem.dev` and retained SDK54 scratch source, with loopback-only transport and OTA disabled only in its ignored release overlay. It is not the latest consent candidate and cannot establish physical acceptance of050/current clients. Unique build logs/markers and probe artifacts are under ignored `.superpowers/s02-font-public-20261020`. Raw diagnostics, input values and unrelated screen content are withheld. No credentials, OTPs or bearer references are used by the probe.

## Planned observations

1. Verify experiment bundle markers and intended package before installation. Preserve the installed baseline and app data; never clear storage or uninstall Dev.
2. At system font1.0, enter only a synthetic unsaved signup display name, without submitting to Auth. Compare route/draft before and after an explicit reload. Distinguish reload loss from any later Android font-change recreation.
3. Through normal Settings UI, change only font size to Very large1.6. Compare inert sample layout and app-only images before/after the public reload. Full accessibility strings alone are insufficient visual proof. Restore Default1.0 in cleanup.
4. A positive reflow result is insufficient for adoption. If route or draft recovery fails, reject an unconditional automatic reload and keep the gate open. Duplicate-press unit tests are not a physical guarantee for actual account writes, queue uncertainty or provider calls. Do not risk actual pending mutations with a reload approach already shown unsafe; record that acceptance as unresolved rather than simulate a pass.
5. Restore the preserved baseline APK with app data retained, restore the scratch root layout, and check default scale/direct USB forwarding. Keep all probe files/images/build artifacts for review.

## Result

The isolated release build succeeded: **4m15s, exit0,1027 tasks (23 executed,1004 up to date)**. Package inspection confirmed the intended Dev identity. The embedded bundle contained the unique public-reload reason and Router markers. The ASCII search for the Unicode probe heading did not match; the installed UI subsequently displayed the exact heading and numeric instrumentation. The intended probe, rather than just a build result, was observed before testing.

| Observation | Actual result |
| --- | --- |
| Default1.0 initial sample | Measured69 layout units; inert sample visible. |
| Default1.0 synthetic signup draft followed by explicit public reload | Before: signup mode and exact synthetic draft present. After: new runtime boot, login mode, draft absent. No signup was submitted. |
| Hot Default1.0 → Very large1.6 | Public dimension scale updated to approximately1.6, same boot, measured height remained69. Unobscured image visibly clipped the sample after its opening sentences and clipped heading/button labels. |
| Public reload while1.6 | New runtime boot, height185. Unobscured image showed every sample word and complete probe/reload labels. Sign-in controls also reflowed. The overlay intentionally covers part of the form, so this is not whole-screen layout acceptance. |
| Very large1.6 → Default1.0 without another reload | Scale returned1.0 while sample height stayed185 in that runtime; a subsequent public reload restored69. The stale-layout issue occurs in both directions in this experiment. |
| Actual credential-free `/auth/recovery` route followed by public reload | Invalid-link route visible before reload; login visible afterward and recovery state absent. No tokens, password or update were supplied. |

The1.6 comparison was repeated to obtain unobscured visual evidence. The first hot image included an unrelated generic system Simple mode banner. Its initial screenshot guard checked app nodes but missed the heads-up overlay; it is retained as occluded evidence, not proof of sample visibility. The driver was strengthened to reject non-app text overlays in the content area. `hot-clear.png` and `reloaded-clear.png` were then captured and visually inspected. No notification setting or Simple mode was changed.

**Conclusion:** the public API is a supported reflow primitive for this retained SDK54 build, but an unconditional reload is not an accepted product repair. It discards unsaved form state and loses the tested route. No hook was added to product code. A guarded recovery design would need to avoid reload during editing/recovery and handle actual in-flight mutations/queue uncertainty without storing passwords, OTPs or bearer references.

Duplicate-press suppression and failed-reload retry passed the two automated probe tests. **Actual pending-write/queued-action duplicate prevention was not exercised or proved.** The prior route/draft counterexamples rejected unconditional adoption, so no real pending mutation was deliberately interrupted. This is an explicit unresolved acceptance condition, not a simulated pass. No inference, mailbox send, signup, birthday correction, quest write or account-history deletion was requested by the experiment.

Cleanup restored Default1.0 through ordinary Settings UI. The modified scratch layout was separately archived and its prior bytes restored. The experiment APK/images/source/tests/logs remain ignored and preserved. Baseline APK restoration and byte-equality/transport checks are recorded in the continuation checkpoint; no fresh050/current-consent physical pass is inferred from this old scratch-source experiment. S02 remains INCOMPLETE.
