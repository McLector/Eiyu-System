# Phase 01 executive summary — safe lifecycle persistence and history preservation

Status: **REVIEW READY — AWAITING USER**

Date / branch: 2026-09-21 / `codex/board-refresh-phase-01`

Base revision: `ace2a58f8d8e926e0b9902ba6836bbabf3c7a964` (approved Phase 0 landing)

Candidate revision: uncommitted working tree; no Phase 1 commit created

Detailed evidence: `docs/plans/board-refresh/phase-01-report.md`

## What changed for the user

The data layer now separates executable habit state from retained historical evidence. Permanent deletion removes the real habit and dependent operational rows while preserving dated history, completion kind, XP evidence, and weekly-reader inputs. Archive/restore retains the same definition and ID, records account-timezone pause intervals, prevents paused-day backfill, and preserves recovery deadlines. Shared readers and transport understand the new boundary.

There are no visible lifecycle controls yet. Archive, Restore, Delete permanently, confirmations, cache/reminder effects, and cross-platform journeys remain Phase 2 work.

## Requirement and acceptance summary

| Requirement / acceptance | Delivered evidence | Result |
| --- | --- | --- |
| R1/R2/R12; P1-AC1 | Actual row deletion, dependent cleanup, immutable ledger, no duplicate retry evidence | PASS |
| R11; P1-AC2 | History, Weekly Review, recurring Weekly Quest, and AI summary readers combine live/retained evidence; shared reader tests | PASS at data boundary |
| R13; P1-AC3 | Owner checks, RLS/grants, direct-delete block, forged-ledger block, account cascade | PASS |
| P1-AC4 | Two independent-session races: delete/delete and committed completion/delete; single XP/evidence outcome | PASS |
| P1-AC5 | Archive intervals, legacy/off-day/timezone/one-time behavior, open recovery deadline, stale writes, no backfill | PASS |
| P1-AC6 | Fresh reset, schema lint, 314 pgTAP tests, populated upgrade rehearsal, shared/web/mobile/static/build gates | PASS |

## Verification snapshot

- SQL: 9 files / 314 pgTAP tests; schema lint clean.
- Shared: 25 suites / 210 tests; TypeScript clean.
- Web: 8 Vitest files / 26 tests; TypeScript clean; production build clean; ESLint 0 errors.
- Mobile: 7 Jest suites / 16 tests; TypeScript clean; Expo SDK 54 lint 0 errors.
- Upgrade rehearsal: populated synthetic pre-Phase-1 data survived the additive migration and lifecycle delete boundary.
- Local-only execution: database stopped after verification; no remote or production state was touched.

## Review findings and limits

- Incumbent warnings remain: mobile duplicate-import lint warnings, Vite config/chunk warnings, and Supabase WARN-level RLS init-plan recommendations. No Phase 1 advisor errors were reported.
- The local npm PowerShell launcher points at a missing roaming npm CLI file; direct repository-local binaries were used for checks.
- UI/store/reminder/browser/Android lifecycle behavior is intentionally not claimed in Phase 1.
- iOS native execution is unavailable on Windows.

## Decision and next boundary

Phase 1 is **REVIEW READY — AWAITING USER**. User approval is required before creating a Phase 1 commit or beginning Phase 2. No commit, remote push, production migration, or deployment was performed for Phase 1.
