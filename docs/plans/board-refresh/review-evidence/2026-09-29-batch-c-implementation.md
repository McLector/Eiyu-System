# Repair C implementation checkpoint

Date: 2026-09-29. Branch: `codex/board-refresh-repairs`. Implementer: **gpt-6-sol, medium**, explicitly authorized by the user. Reviewer: parent Codex. This is a code and local schema checkpoint; rendered browser and Android device acceptance remain separate.

## Changed behavior

- Web profile and Settings use URL-backed overlays. Opening adds a same-page history entry; Back/Forward can close/reopen without replacing the board lane or page. The legacy `/settings` route resolves to the same Board-backed Settings overlay. Settings can navigate directly to History.
- Web overlays portal outside the page root with a theme attribute, make the page inert and hidden from accessibility while open, contain Tab focus, restore focus on close, and block dirty/pending profile navigation. Native profile editing confirms discard, blocks dismissal during save, uses `KeyboardAwareScrollView`, disables fields during save, and guards duplicate saves. Native legacy Settings opens the same account Settings sheet.
- Shared validation, RPC, and direct table writes use code-point length and the same ECMAScript whitespace trim contract. A field changed by the user must be 1–80 code points after trimming. An untouched legacy value longer than 80 code points remains stored and readable while the other field or timezone changes. A direct write to a changed field is normalized and validated by trigger.

## Migration ordering

`026_profile_editing.sql` was corrected in place because its former constraint would reject preexisting long values **before** a later repair could run. `027_profile_compatibility_repair.sql` handles installations where the old 026 had already applied. No values are truncated. Both scripts are additive to the active local dataset. This historical migration correction is intentional and must be reviewed as part of rollout.

`scripts/integration/profile-upgrade-rehearsal.cjs` creates a new `template0` database for each run and leaves it for review. It bootstraps only the minimal local `auth.users` table and `auth.uid()` needed by the canonical SQL migrations; it is a schema rehearsal, **not a full GoTrue Auth stack**. Default mode inserts a pre-026 profile with an 81-code-point display name and NBSP Class before applying 026/027. `--fresh` applies 001–027 first and signs up a fixture afterward. It never resets the active local database.

## Executed evidence

| Boundary | Result |
| --- | --- |
| Isolated legacy upgrade | PASS: 001–025, 81-emoji/NBSP fixture, corrected 026/027, unchanged long name, valid Class/timezone edit, NBSP/BOM blank rejection, changed over-limit rejection, direct-write normalization. Parent independently reran PASS. |
| Isolated fresh install | PASS: 001–027 before fixture signup, 80 emoji accepted and 81 rejected, blank and direct-write checks. Parent independently reran PASS. |
| Existing profile SQL pgTAP | 17/17 PASS. |
| Web suite | 16 suites / 51 tests PASS, including new portal, dirty Back/Forward, pending, Settings→History and legacy route tests. |
| Native suite | 13 suites / 44 tests PASS, including new dirty discard, pending error, and shared Settings route tests. |
| Shared suite | Parent full run: 27 suites / 220 tests PASS. |
| Type checks | Web and mobile `tsc --noEmit` PASS. |

No remote migration or deployment was performed. Numbered migration rollout verification remains a prerequisite before these clients ship.

## Open review

- Parent rendered browser review of dark/light portal appearance, real browser Back/Forward, focus and Settings History/legacy behavior.
- Android small-height, 200% text, keyboard, Back and TalkBack acceptance. Local emulator is unavailable on this host; APK build passed with the repository's Windows native staging script, but this does not prove device behavior.
- D–F repair batches remain open.
