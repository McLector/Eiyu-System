# Board refresh integration ledger

This ledger records local phase approvals and integrations. Remote push, production data changes, deployment, and publishing remain out of scope.

## Phase 0 — foundation, fixtures, and baseline

- Base main SHA: `b840bb723229ba34a19a8a73a07ff3da7e952d81`
- Candidate branch: `codex/board-refresh-phase-00`
- Candidate scope: fixture correction/independence tests, Phase 0 evidence reports, and local browser/native runner scenario documentation.
- User authorization: the user said “proceed” on 2026-09-21 after the package was presented as **REVIEW READY — AWAITING USER**. This is recorded as approval to land Phase 0 and begin the next planned phase; no remote or production action was authorized.
- Candidate checks: recorded in `phase-00-report.md`; `git diff --check` passed.
- Landed commit SHA: to be recorded after the local Phase 0 commit.
- Post-main smoke: to be recorded after fast-forwarding local `main`.

Phase 1 remains the only authorized implementation scope after this landing. It must receive its own review package and user stop.
