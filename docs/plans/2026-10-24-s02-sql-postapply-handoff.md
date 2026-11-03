# S02 SQL post-apply test conversion — handoff (agent run, 2026-10-24)

Runner: `node .superpowers/sdd/2026-10-23-s02-tracker-consent-implementation/sql.mjs <test|race> <file> <name>`; outputs `<name>.json` in that directory (names prefixed `pa-`).

## Runner contract (TDD)
- RED: new case "race mode also admits the converted post-apply cross-session tests and nothing else" failed with `Unexpected race test` (10/11 pass).
- GREEN: `raceTests` now lists 005, 009, 017, 030, 032, 034, 041 (`node --test sql-contract.test.mjs`: 11/11). `raceBody`, other modes and the stack guard are unchanged.

## Per-file conversion status (all green)
| file | mode | run | assertions | notes |
|---|---|---|---|---|
| 005 | race | pa-005-01 | 24 | chain via `chain-save`, toggles via `set_long_quest_stage_done_receipt`; added negatives (wrong snapshot ET003, strict order P0001, legacy toggle 42501) |
| 017 | race | pa-017-02 | 27 | same shape + XP 60 and 1 bonus + 2 stage reward rows (pa-017-01 failed on my wrong reward-row count assumption: rows are stage x2 + bonus x1) |
| 009 | race | pa-009-01 | 39 | habit via `habit-save`, completions via `complete_habit`, deletes via `delete_habit`; waiting second delete is now 42501 (contract change) ; legacy RPCs denied; retired ID not reusable |
| 030 | race | pa-030-03 | 14 | writer uses gateway `habit-save` basic edit; fixture needs age-notice consent row for `set_account_birthday` (EP001 otherwise); waiting mutation holding the PRE-declaration tuple is refused ET003 (age version changed), a fresh tuple is ET001 |
| 034 | race | pa-034-01 | 19 | unchanged semantics; top-level `begin;..commit;` cleanup became one `do $cleanup$` block (no top-level transaction control) |
| 013 | test | pa-013-03 | 103 | wrapped; fixed a lock self-collision: `mailbox_state ... like 'd130%'` also touched the committed race account 099 (leftover from an earlier failed run), now restricted to the two in-transaction accounts |
| 037 | test | pa-037-01 | 14 | restructured to a single wrapped form: committed fixture created/removed through the dblink writer (fixed IDs d3700000-..., pre-clean), barrier restored from captured definition (explicit assert), fixture no longer retained |

Failed/superseded attempts (names burned): pa-005 none, pa-017-01, pa-030-01 (EP001 consent), pa-030-02 (ET001 vs ET003), pa-013-01/02 (statement timeout, then my script bug), none else.

## Full suite (names pa-full-001..043, sequential, one psql session at a time)
All 43 files PASS, 1599 assertions total. race mode: 005 (24), 009 (39), 017 (27), 030 (14), 032 (29), 034 (19), 041 (22); every other file in test mode. Per-file assertion counts: 001 23, 002 31, 003 57, 004 34, 006 21, 007 38, 008 58, 010 17, 011 10, 012 37, 013 103, 014 35, 015 30, 016 19, 018 16, 019 11, 020 61, 021 12, 022 10, 023 38, 024 38, 025 52, 026 25, 027 58, 028 37, 029 49, 031 59, 033 55, 035 41, 036 52, 037 14, 038 56, 039 148, 040 47, 042 22, 043 11. JSON per run: `.superpowers/sdd/2026-10-23-s02-tracker-consent-implementation/pa-full-NNN.json`.

## Lint
`npm run db:lint` (= `supabase db lint --local --schema public --level error`) was NOT run: it resolves the DB from the repo CLI config, and per memory the config's ports can point at a different stack than this disposable one. Equivalent run directly in the isolated container instead: plpgsql_check (available extension, created inside begin..rollback, confirmed not installed afterwards) over every plpgsql non-trigger function in public+private, with extra/other/security warnings on.
Result: 0 errors. 8 warnings, 7 new (all in 054): `apply_tracker_write` 42804 "target type is different type than source type" (x2, line 5), `save_tracker_chain` same 42804, `tracker_argument_types` "marked IMMUTABLE but expression is STABLE" (x3) plus unused variable `ignored`. 1 older: `reserve_weekly_summary_regen` unused variable `s`. Raw output in the agent scratch dir `pa/lint.csv`.

## Leftover check
After the suite: no rows for any test fixture ID in auth.users / processing_consent / tracker_input_provenance / habits / deleted_habit_history; no open AI admission or outstanding epochs; no leftover dblink sessions. auth.users went 23 -> 22: the one removed row is 013's own committed race account `quota-race@example.invalid` (id d1300000-...-099, left by an earlier aborted 013 run; 013 deletes it by fixed ID in its own cleanup). Untouched retained rows from older runs (not removed): 2 x `s02-export-snapshot-*@example.invalid` (old 037 runs), `admission-ec93...@example.invalid` (old 034), plus the oppo-*/owner-export-*/s02-* fixtures.

## Contract notes learned
- Waiting duplicate `delete_habit` is now 42501 (not idempotent success).
- A write holding a pre-birthday-correction tuple is ET003 (ageVersion changed); only a fresh tuple reaches the ET001 pause check.
- `set_account_birthday` still needs the accepted age notice row (EP001 otherwise), independent of the gateway.
- A wrapped test sharing `like 'd130%'` updates with a committed dblink fixture self-deadlocks (013 fixed).
