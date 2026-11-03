# S02 bounded nested Text / TextInput probe — CONCLUDED

S02 **INCOMPLETE**; public release blocked. Owner approved this disposable SDK54 probe, then instructed that it finish, restore settings and end further font investigation. No product font repair was adopted.

Artifacts: `.superpowers/s02-font-matrix-20261023`, including both APK variants, before-images, failed preparation records, source/tests, sanitized metrics and guarded synthetic images. Separate package `com.mclector.eiyusystem.dev.s02fontmatrix`; second runtime `1.2.0-s02-font-matrix-20261023b`. Normal scaling remained enabled. No reload, internal flag, dependency/SDK change, account/provider request or Dev data clear.

## Method and qualifications

Selected nested Text, single-line and multiline TextInput changed only a public letterSpacing offset, 0→0.01→0.02→0.01. Existing base spacing, nested child styles and mounted parent draft/route state remained. Controls had unchanged spacing. Selected drafts had one extra synthetic character relative to controls, so input content is not perfectly identical. Public focus/selection controls were explicit, one-shot and removed their selection prop after matching native acknowledgment; spacing/font changes did not deliberately set focus or selection.

First fixture preparation failed before any font change: compressed accessibility omitted a visible IME; keyboard interception and unsuccessful modifier shortcuts prevented valid multiline setup. These are retained preparation failures, not app font failures. A second fixture used explicit public focus/selection controls. No secret, account content or raw hierarchy was retained. Parser/IME guards observed RED before GREEN15; fixture controls observed RED before GREEN3. Targeted types/lint exited0. First build2m09s/exit0; second2m14s/exit0; both compiled isolation/runtime/OTA gates passed. These are historical outputs, not rerun full product suites.

## Accepted observations

All rows below retained the same actual Activity and JS boot, synthetic recovery marker and exact two draft values. `N` is selected/control nested height and line count; `S` single input height; `M` multiline layout height. Values are native callback measurements, not complete visual or cold-reference equivalence.

| Observation | Offset | N height / lines | S height | M height | Focus and selection |
| --- | --- | --- | --- | --- | --- |
| Default, prepared single | 0 | 96/96; 4/4 | 48/48 | 90/90 | Native single focused, range2–6; command1 acknowledged |
| First live1.6 before spacing | 0 | 96/96; 4/4 | 48/48 | 90/90 | Same single focus/range, command1 |
| First1.6 after spacing | 0.01 | 232/96; 6/4 | 56.7/56.7 | 211.3/211.3 | Native single focused, same range; no new command |
| Return1.0 before spacing | 0.01 | 232/96; 6/4 | 56.7/56.7 | 211.3/211.3 | Native single focused, same range |
| Return1.0 after spacing | 0.02 | 96/96; 4/4 | 48/48 | 90/90 | Native single focused, same range; command1 |
| Default, prepared multiline | 0.02 | 96/96; 4/4 | 48/48 | 90/90 | Native multi focused, range2–6; command2 acknowledged |
| Second live1.6 before spacing | 0.02 | 96/96; 4/4 | 48/48 | 90/90 | Same native multi focus/range, command2 |
| Second1.6 after spacing | 0.01 | 232/96; 6/4 | 56.7/56.7 | 211.3/211.3 | Native multi focused, same range; no new command |

The inspected large-font image shows selected nested content readable through END, preserved bold nested words and a larger selected single-line draft than its control. Multiline fields were below that image's viewport. Input controls also changed layout height despite unchanged spacing, while content-size callbacks differed (selected211.3/control134 at large). Do not infer uniform correct input glyph rendering from equal layout heights, or claim a fresh-start reference for this expanded fixture.

After the guarded picture hid the IME/scrolled, explicit multiline reselection did not complete its acknowledgment. Command3 stayed pending. Default1.0 was restored normally, but selected nested height stayed232 and input heights stayed56.7/211.3 before spacing. The guarded final spacing operation refused pending selection. Final multiline return reflow and post-cycle native edit are **UNPROVED**; this is not proof of a product font/selection defect. No new fixture or further hypothesis was pursued.

Conclusion: positive bounded nested-Text reflow and single-line both-direction continuity; positive multiline focus/selection continuity through the second large-font change. The complete repeated-cycle input/visual/edit acceptance is incomplete. This primitive is not an accepted whole-app repair, actual Router/recovery preservation or duplicate-write proof. Earlier plain-Text cold-reference evidence keeps its separate scope. Font investigation is now bounded; no further probe is queued.

## Restoration

Cleanup verification exited0: Default1.0; repaired Dev APK byte-equal in RAM to its preserved baseline; actual source-defined ENTER SYSTEM / Forgot password? / Register controls and empty-or-exact-placeholder fields observed; direct57321→57321, no57326 or X alias. Isolated package/data retained force-stopped. Six scratch inputs and prior build output byte-restored; all experiment sources/output/APKs retained. Initial cleanup guards incorrectly expected a Sign In label and empty strings rather than the actual login label/placeholders; correcting the read-only guard established cleanup, with no login, logout or data mutation. No broad suite rerun, deployment, publishing, provider traffic/contact or spend.
