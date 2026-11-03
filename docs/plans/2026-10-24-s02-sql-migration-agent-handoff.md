# S02 SQL test migration agent: running status

Runner: node .superpowers/sdd/2026-10-23-s02-tracker-consent-implementation/sql.mjs iterate supabase/tests/<file> <name>
Baselines are in .superpowers/sdd/2026-10-23-s02-tracker-consent-implementation/sq-baseline-NNN.json

## Baseline
Pass already (no change needed): 010, 011, 021, 022, 026, 027, 028, 031, 033, 035
Fail at baseline: 001 002 003 004 006 007 008 012 013 014 015 016 018 019 020 023 024 025 029 036
Skipped (unwrapped or runner refuses, multi-session): 005 009 017 030 032 034 037

## Fixed and green
- 001: sq-001-fix-01 pass 23/23
- 002: sq-002-fix-01 pass 31/31
- 003: sq-003-fix-01 pass 57/57
- 004: sq-004-fix-03 pass 34/34 (plan 33->34, added direct-write denial assertion)
- 006: sq-006-fix-09 pass 21/21 (plan 20->21, same reason)

## Remaining (in order)
007 008 012 013 014 015 016 018 019 020 023 024 025 029 036

## Patterns
- pg_temp.gw(op,args,targets) helper wraps apply_tracker_write with current revision.
- Fixture rows inserted as owner (reset role ... set local role authenticated); birth_date 2000-01-01 in signup metadata; custom-tracker grant for legacy roots.
- Unique violation inside gateway becomes 22023 'Invalid tracker input.'; cross-user target becomes 42501 'Tracker target unavailable.'.
- reads no longer materialize: use gw('prepare-day','{}'); historical dates via superuser ensure_habit_occurrences fixture.
- 004: set_long_quest_stage_done (no receipt) revoked; use set_long_quest_stage_done_receipt via gateway with fresh request ids.

## COORDINATION NOTE (02:30)
A second agent instance is editing supabase/tests files in ascending order (007, 008 done/in progress by it).
This instance (resumed) takes the tail DESCENDING: 036, 029, 025, 024, 023, 020, 019, 018, 016, 015, 014, 013, 012.
Do not edit those until marked here. Runner names for this instance: sq-NNN-tail-NN.
- (tail agent) 036: sq-036-tail-01 pass 52/52 (section count 34->36: tracker_input_provenance + tracker_purpose_authority from 056 manifest)
- (tail agent) 029: sq-029-tail-01 pass 49/49 (no_plan; direct writes now 42501, gateway paths ET001 while paused; prepare-day refused while paused; storage paths use tuple)
