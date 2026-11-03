# S02 admin mobile handoff, 2026-10-24

Status: DONE, local only, nothing staged or committed.

## Files
- New: `mobile/components/status/review-request.tsx`, `mobile/components/eiyu/retention-notice.tsx`.
- Edited: `status/tracker-consent.tsx` (ReviewRequest when authority is pending and not granted), `status/debrief-consent.tsx` (weekly-debrief only, pending, not granted), `eiyu/account-header.tsx` (RetentionNotice above the tracker consents).
- Tests: `components/__tests__/{review-request,review-request.placement,retention-notice}.test.tsx`; `account-header.test.tsx` mocks `fetchRetentionNotice` and gains two retention cases.

## Mirrors web
Same copy, phases (idle, form, sending, sent, cancelling), 280-char limit, hint, error kinds (limit, already-open shown as sent and cancellable, not-needed, anything else generic). Retention date is formatted by hand (no Intl) so it never shifts with time zone.

## Open
- Backend handoff has no "Final signatures" section yet, and `fetchMyReviewRequests` does not exist in shared, so after a reload the button shows again (ER002 recovers into the cancel state), same gap as web.
- Retention notice shape (`{purpose, removalDueOn, reminded}`) is still the 061 guess; re-check when 061 lands.
