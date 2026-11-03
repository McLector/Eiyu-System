# S02 copy lane handoff (2026-10-24)

Status: DONE. Local only; nothing staged or committed.

Changed:
- `packages/shared/src/logic/legal-content.ts`: DRAFT marker removed; `TRACKER_PURPOSE_NOTICES` now the approved decision 9 text with 30-day / 12-month periods; new `childBody` field (12-17 text) per notice; new `DATA_REQUEST_RESPONSE` (decision 8); privacy policy gained sections `CUSTOM TRACKER AND FITNESS` and `HOW LONG WE KEEP THINGS`, and `YOUR CONTROL` now carries the request-response wording (decision 13). Notice versions unchanged.
- `packages/shared/src/logic/__tests__/legal-content.test.ts`: new assertions; two old assertions updated (privacy headings, custom label wording, "read-only" instead of "does not request deletion").
- `docs/plans/2026-10-24-s02-operating-runbook.md` (new).
- No web/mobile test needed changing (they use the real constants).

Open for the owner/orchestrator:
- No product component renders `childBody` or `DATA_REQUEST_RESPONSE` yet (components were out of scope). A UI lane should show `childBody` for declared 12-17 accounts.
- Retention periods in the label/body text are literals; changing a number means a new notice version.
- The runbook notes the trusted functions are executable only by the DB owner role (execute revoked from service_role too).
