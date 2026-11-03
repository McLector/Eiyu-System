# S02 admin web + shared client handoff, 2026-10-24

Status: DONE, local only, nothing staged or committed.

## Files
- Shared: `packages/shared/src/data/operator.ts` (+ `__tests__/operator.test.ts`), `types/database.ts` (8 RPC entries), `index.ts` (export), `logic/legal-content.ts` (+ test, backup wording).
- Web: `store/operator.ts`, `web/PostSignInRedirect.tsx`, `pages/AdminPage.tsx`, `web/AdminConsole.tsx`, `web/AdminMfa.tsx`, `web/ReviewRequest.tsx`, `web/RetentionNotice.tsx`; edited `router.tsx` (/admin), `RootPage.tsx`, `pages/AuthPage.tsx`, `web/TrackerConsent.tsx`, `web/DebriefConsent.tsx`, `web/TrackerPermissions.tsx`.
- Tests: `web/__tests__/{AdminRouting,AdminMfa,AdminConsole,ReviewRequest,ReviewRequest.placement,RetentionNotice}.test.tsx`.

## Aligned to backend 060 (read from the SQL)
- list rows use `requestId` (mapped to `id`), email/note may be null, `status` ignored.
- error codes ER001 limit, ER002 already open (shown as "sent", cancellable), ER003 not needed, 42501 denied, 22023 invalid.
- pause reason codes dispute/report/other (UI sends `dispute`).

## Guesses until 061 lands (re-check)
- `operator_list_retention` rows: `{email, purpose, withdrawnAt, reminderDueOn, removalDueOn, status}`.
- `get_tracker_retention_notice`: array of `{purpose, removalDueOn (yyyy-mm-dd), reminded}` (null = none).

## Gaps for the owner/backend
- No RPC returns the caller's own open request, so after a reload the "Request review" button shows again; ER002 is handled by showing the cancel state.
- `operator_pause_purpose` takes a user id only and the queue does not return user ids, so the pause form needs the account id (UUID); an email is refused client-side.
