# Eiyu System — Web App: Phase 5 Design (Figma Make Wiring)

Status: approved, ready for implementation planning
Date: 2026-08-29

## 1. Goal and context

Phase 5 of the monorepo migration (`docs/2026-08-28-eiyu-web-monorepo-design.md`),
now unblocked by the Figma Make link. Turns the exported UI shell into a real,
working web app in `web/`, wired to the same Supabase backend and the same
`@eiyu/shared` package `mobile/` already consumes.

**Risk profile, by design, is the inverse of the monorepo migration.** That
work was dangerous because it moved existing, working code — hence the heavy
phase-gate ceremony. This is purely additive: a new `web/` folder where a
mistake is cheap and revertible. The process stays lean accordingly — same
brainstorm → spec → plan → SDD pipeline, lighter gates, own worktree and
branch off `main` (not appended to the already-merged migration branch).

**What's already true, verified by direct inspection of the Figma Make
export** (fileKey `tg0GAV59vmqCxeJkjsCWMD`), not assumed:
- Stack: React 19 + Vite 8 + Tailwind CSS 4 + TypeScript 5.7, `recharts` for
  the radar chart. `package.json` pins `"react": "^19.0.0"` — satisfied by
  the workspace's `19.1.0` override, no conflict expected (still checked
  live at Phase 1's build gate, not just assumed).
- `App.tsx` is a single-page app with manual `useState` screen-switching
  (`stage`: landing → auth → app; `screen`: board/status/longquests/settings)
  — no router, no state management library, no Supabase client, all data is
  mock (`initialUser` from `data.ts`).
- File inventory matches the original UI brief screen-for-screen: `Landing`,
  `WebAuth`, `WebBoard`, `WebStatus`, `WebLongQuests`, `WebSettings`,
  `WebQuestEditor`, `WebHistory`, `Sidebar`.
- `types.ts` is close to `packages/shared/src/types/eiyu.ts` but incomplete:
  missing `questType` and `frozenDate`, `description` is named `note`.
- **Both AI surfaces are real and present**, confirmed by reading the actual
  components: `WebStatus.tsx` has a full `AiSummary` component (mocked
  narrative text) under its "Weekly Review" tab, and `WebQuestEditor.tsx` has
  an "✦ AI Suggest" button next to the easy-version field. Both currently
  stubbed/non-functional.
- **Known bug in the export**, to fix during type reconciliation, not
  before: `WebQuestEditor.tsx`'s `handleSave` tracks `questType` in local
  `useState` but never includes it in the `Quest` object it builds — the
  habit/one-time toggle is currently cosmetic. **Fix lands in Phase 3** (type
  reconciliation) — record this explicitly in the SDD ledger when that phase
  starts, not just here.

## 2. Decisions

- **Router: React Router v7.** Replaces the `stage`/`screen` state machine.
  Routes mirror `mobile`'s `expo-router` structure: `/`, `/auth`, `/board`,
  `/status`, `/longquests`, `/settings`, `/history`, `/quest-editor/:id?`.
  Chosen over TanStack Router — the route set is small (7 routes, only one
  with a real param) and doesn't need TanStack Router's type-safe
  params/search-validation to justify its steeper learning curve. React
  Router is the lower-risk default, consistent with this project's pattern
  of picking boring choices.
- **Data layer: mirror `contexts/eiyu-store.tsx`, don't invent one.**
  TanStack Query 5 + `@eiyu/shared`'s data helpers. `web/src/main.tsx` calls
  `initSupabaseClient()` (browser-default storage — no AsyncStorage) before
  anything imports a shared data helper. This is literally the second
  module graph the `148c35f` uninitialized-client guard was built for.
- **Types: `packages/shared/src/types/eiyu.ts` wins.** The export's
  `src/types.ts` and `src/data.ts` (mock `initialUser`) are deleted in the
  same commit that wires real queries. UI components adapt to the real
  shape; the domain is never forked to fit the UI.
- **AI features are in scope**, confirmed above — this triggers the
  `ai-cache` abstraction the original monorepo design doc deferred pending
  exactly this confirmation.

## 3. The `ai-cache` abstraction — its own phase, its own gate

This is the one piece of Phase 5 that touches `packages/shared` and
`mobile/` rather than being purely additive in `web/` — it moves
`lib/ai.ts`'s logic and `lib/weekly-summary.ts` out of `mobile/`, and
relocates/adjusts `mobile/lib/__tests__/ai-cache.test.ts` and
`ai-proxy-error.test.ts`. That's the same shape of risk the monorepo
migration's Task 3/Task 4 split was designed to isolate — if this refactor
and web's data-wiring land in the same phase, a mobile regression and a web
bug become indistinguishable at the gate. It gets its own phase, gated
independently: mobile suite green (with relocated AI tests), shared suite
green, `web/` still building against its original mocks, untouched.

**Cache-adapter shape:** async-shaped interface —
`getItem(key): Promise<string | null>`, `setItem(key, value): Promise<void>`,
`removeItem(key): Promise<void>` — matching `ai.ts`'s existing async call
sites. Mobile's AsyncStorage adapter becomes a thin pass-through; the web
`localStorage` adapter wraps synchronous calls in resolved promises.
Designing it sync-first for `localStorage`'s convenience would instead force
awkward async-wrapping into mobile's side, which already speaks async
natively. Registered via its own `initCacheAdapter()` call (parallel to,
but separate from, `initSupabaseClient()` — distinct subsystems, no reason
to couple their init calls), invoked once at each app's startup.

## 4. `ai-proxy` CORS allowlist — named deliverable, not a footnote

Read directly from `backend/supabase/functions/ai-proxy/index.ts`:

```ts
// No web deployment exists yet (mobile-only app) — only the local Expo web
// dev server is allowlisted. Add the production origin here once a web
// build is deployed. Native mobile requests never send an Origin header, so
// this has no effect on iOS/Android.
const ALLOWED_ORIGINS = new Set([
  'http://localhost:8081',
  'http://localhost:19006',
]);
```

Two entries already present (both Expo web dev ports) — Vite's default dev
origin, `http://localhost:5173`, is absent. Without it, the first AI call
from `web/` in dev fails CORS, and the symptom (a rejected fetch) looks
exactly like an `ai-cache` abstraction bug, not a backend config gap.

- **Phase 3 (wire real data):** add `'http://localhost:5173'` to
  `ALLOWED_ORIGINS` and run `supabase functions deploy ai-proxy` — required
  before that phase's live-verify gate can exercise either AI surface.
- **Phase 5 (auth + polish / deploy prep):** add the production origin once
  a deploy target is chosen, and redeploy again. Actually deploying `web/`
  itself is a separate decision from adding its origin to this allowlist —
  don't conflate "decided the deploy target" with "deployed and updated
  CORS," track them as two checklist items even if they happen together.

## 5. Phases

Six phases (five original + the `ai-cache` split). Each phase gates before
the next starts; ceremony lighter than the migration (no worktree-per-phase
requirement, but still scope→build→test→live-verify→commit per phase).

1. **Scaffold** — export → `web/`, real `package.json`, builds under the
   root workspaces install and the `19.1.0` React override.
   **Gate:** `npm run dev` + `vite build` clean from a root install.

2. **`ai-cache` abstraction** (§3) — extract `ai.ts`'s proxy-calling logic
   and `weekly-summary.ts` into `packages/shared` behind the async
   cache-adapter interface; relocate/adjust mobile's AI tests.
   **Gate:** mobile suite green (adjusted), shared suite green, `web/`
   unchanged (still on its original mocks).

3. **Wire real data** — `initSupabaseClient`, `initCacheAdapter`, TanStack
   Query, delete `data.ts`/`types.ts`, reconcile types (including the
   `questType` save-bug fix from §1), wire both AI surfaces through the
   Phase 2 abstraction, add the CORS dev origin (§4) and redeploy. A
   **minimal, throwaway-quality email/password auth form** goes in here too
   — not because Phase 5 needs early auth polish, but because every shared
   data helper fails against RLS with no session, and this phase's
   live-verify gate needs one to test against. `WebAuth`'s real UI/UX,
   magic-link/OAuth, and Supabase dashboard redirect-URL config are Phase 5,
   not this phase — this is scaffolding just sufficient to get a session.
   **Gate:** live-verify against the real Supabase project with a real
   account — no mocks, both AI surfaces confirmed working end-to-end.

4. **Routing** — React Router v7 replaces the state machine; auth gate
   becomes a route guard. Works cleanly now because Phase 3 already
   produced a working (if crude) auth path.
   **Gate:** all routes reachable, refresh-safe, auth guard redirects
   correctly.

5. **Auth + polish** — `WebAuth` wired to the real `supabase-js` browser
   flow, replacing Phase 3's throwaway form; dashboard redirect-URL config
   (your action, not code, if magic-link/OAuth is added); remaining screens
   verified; deploy-target decision made (not necessarily executed).
   **Gate:** full manual pass through every screen with a real account.

6. **ESLint/tooling for `web/`** — authored here; this is also where the
   barrel-discipline lint rule deferred in the migration's ledger
   (forbidding `@eiyu/shared/*` deep imports) lands for both apps sharing
   one config.

## 6. Out of scope for this plan

- Actually deploying `web/` to a hosting target (Vercel/Netlify/Cloudflare
  Pages/etc.) — Phase 5 decides the target, doesn't necessarily execute the
  deploy.
- Any mobile-side UI/UX change — this plan only touches `mobile/` inside
  the narrow `ai-cache` extraction in Phase 2.
