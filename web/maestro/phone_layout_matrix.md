# Web phone layout verification

Run this scenario in a clean browser profile signed into the disposable local
test account. Do not use a personal or production session. Inspect the same
browser engine at 320, 390, 768, and 1280 CSS pixels, in both themes, and at
200% browser zoom.

For each viewport, record the bounding rectangles of the brand, each primary
route link, and the account trigger. Confirm no two rectangles intersect and
that the page's `scrollWidth` does not exceed its `clientWidth`. At 320 px,
keyboard-tab through the navigation and into the account menu; the focused
route must scroll into view and retain a visible focus ring. On a touch-sized
viewport, scroll the Board lane tabs to Archived and activate it.

Inspect `.board-lane-tabs` in both themes. The standard `scrollbar-color` and
the WebKit thumb/track computed colors should match `--c-muted-flat` and
`--c-panel`, respectively. Keep a visible horizontal-scroll affordance.

Use only these computed rectangles/colors for the measurement record. Store
screenshots and any private run log under the ignored `maestro-logs/` path;
keep credentials and account details out of this tracked scenario.
