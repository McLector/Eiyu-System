# Eiyu System — Web App: Phase 5 Plan B Design (Session, Routing, Real Auth)

Status: approved, ready for implementation planning
Date: 2026-08-29

## 1. Goal and context

Plan A (merged to `main` at `deb3227`) wired the web app to real data across every screen but deliberately deferred three things: routing (the app still runs on a `stage`/`screen` `useState` machine in `App.tsx`), `WebAuth.tsx`'s real UI/UX (the app currently authenticates through a throwaway `DevAuth` form), and web-specific tooling. Plan A's final whole-branch review also surfaced a structural issue that routing and real auth would both make worse if left alone: `App.tsx`, `web/src/store/eiyu-store.tsx`, and `web/src/web/WebStatus.tsx` each call `useSession()` independently, so each resolves its own `loading`/`session` transition on its own render — a desync the review's root-cause theory ties to an intermittent "stuck on Loading forever" symptom observed once during Plan A's browser walkthrough.

**Risk profile is the middle case between Plan A's two extremes.** Plan A was purely additive (new `web/` folder, cheap to revert). Plan B modifies the auth/session core of an already-working, already-verified app — routing touches every screen's mount path, and session consolidation touches the exact code the race lives in. That's more risk than "additive polish," less than "new subsystem." Process stays the same pipeline (brainstorm → design doc → plan → SDD) with the same per-task-review-plus-one-whole-branch-review gate structure Plan A used; only the design doc itself is leaner, since most of the real decision-making already happened in the brainstorm this doc is transcribing.

**Own branch, no worktree.** `web-plan-b-session-routing`, branched off `main`'s current tip (this design doc's own commit, so the branch's history includes the doc it's built from). Unlike Plan A, this branch has no Figma MCP dependency, so a separate worktree buys nothing — Plan A's own final review already drew this exact distinction: worktree isolation is for external-transport dependencies and directory-safety concerns Plan B doesn't have, while *branch* isolation (mandatory here, unlike Plan A) is for exactly this profile — rewriting a working core.

## 2. Decisions

### 2.1 Session context — one provider, one source of truth

**Problem:** three independent `useSession()` call sites mean three independent async resolutions of the same question ("is there a session, and have we finished checking"), which can and did desync.

**Design:** a new `web/src/store/session-context.tsx` exporting `SessionProvider` and `useSession()` (kept as the public name — matches this codebase's existing convention of `useEiyu()`, not `useEiyuContext()`, for its other context hook). The existing `web/src/hooks/useSession.ts` (with its already-verified race-condition fix — traced both orderings against the real code; neither leaves `session` flip-flopping back to `null` after resolving) becomes the *internal* implementation `SessionProvider` calls exactly once. Nothing outside `session-context.tsx` imports `web/src/hooks/useSession.ts` directly after this phase.

**API surface**, deliberately closed — this is an auth-identity boundary, not a data boundary:

```ts
interface SessionContextValue {
  session: Session | null;
  user: User | null;       // session?.user ?? null — one definition, not three
  loading: boolean;        // tri-state: true until the first resolution, see 2.2
  signOut: () => Promise<{ error: AuthError | null }>; // thin wrap of supabase.auth.signOut(),
                                                          // mirrors supabase-js's own shape so
                                                          // the calling UI decides how to surface
                                                          // the error — Settings' Sign Out button
                                                          // already has the UI for it from Plan A
}
```

`user`'s type is `@supabase/supabase-js`'s auth `User` (id, email, etc.) — never `UserProfile` (rank, stats, XP), which stays exactly where it already lives, in TanStack Query via `eiyu-store.tsx`. This boundary is written down explicitly because it's the thing that prevents the context from re-accreting into a second god-object down the line: if a future task wants to add something to this context, that's a doc amendment, not a silent addition.

`useSession()` throws `'useSession() must be used within a SessionProvider'` when called outside the provider — same throw-on-misuse pattern as `packages/shared/src/supabase/client.ts`'s guard and `packages/shared/src/cache/adapter.ts`'s `getCacheAdapter()`. Silent `undefined` consumers are exactly how three independent call sites happened in the first place.

**Provider ordering in `main.tsx`** (load-bearing, not stylistic):

```
SessionProvider → QueryClientProvider → EiyuProvider → App
```

`QueryClientProvider` before `EiyuProvider` is a hard requirement (`EiyuProvider` calls `useQueryClient()` internally). `SessionProvider` outermost is a clean choice — everything downstream, including the query layer, can assume identity is already resolving — but it is not equally load-bearing; nothing breaks if `SessionProvider` and `QueryClientProvider` swap, since `SessionProvider` doesn't touch the query cache. `EiyuProvider` stops calling `useSession()` itself and instead calls the new context's `useSession()` to derive `userId` — this is the one required consumer-side change in `eiyu-store.tsx` beyond the import swap.

**Gate:** the race scenario is explicitly re-tested (not assumed fixed by inspection) — rapid sign-in/sign-out, a hard refresh mid-session, and confirming `App`, `eiyu-store`, and `WebStatus` all observe the same `loading→false` transition on the same render, not three different ones.

### 2.2 UTC fix — same phase, separate commit

`web/src/web/WebHistory.tsx`'s "TODAY" section derives today's date from local `Date` methods (`getFullYear()`/`getMonth()`/`getDate()`) while the rest of the app — `fetchMonthHistory`'s `Date.UTC` boundaries, `completeHabit`'s default `completedOn` — consistently uses UTC via `@eiyu/shared`'s `toDateKey`/date-utils. Near a local/UTC day-boundary window, the TODAY cell can miss a real completion. This shares its fix shape with 2.1 ("stop re-deriving state locally, consume the shared module") and deserves the same review lens, but lands as its **own commit** within this phase so the session-consolidation gate (race re-test) and this gate (an injected-clock midnight-boundary test, not the real clock) stay independently attributable — one phase, two reviewable units.

### 2.3 Routing — React Router v7 replaces the state machine

**Route table:**

| Route | Class | Notes |
|---|---|---|
| `/` | public | Pure auth-state redirector — no Landing page (see below) |
| `/auth` | public | `DevAuth` during this phase; swapped for real `WebAuth` in Phase 3 |
| `/board`, `/status`, `/longquests`, `/settings`, `/history` | protected | |
| `/quest-editor/:id?` | protected | No `id` = create, `id` = edit |

**Landing is deleted, not kept.** The export's `Landing.tsx` is Figma-Make-generated marketing copy with no content strategy and no audience yet (it only ever renders for a logged-out visitor, and there is no deploy target or traffic). Mobile's own `/` (`mobile/app/index.tsx`) is already a pure redirect — `loading` → render nothing, then `session ? '/(tabs)/board' : '/auth'` — confirmed by direct read, not memory. Web's `/` matches that exactly:

```tsx
function RootRedirect() {
  const { session, loading } = useSession();
  if (loading) return null; // or a spinner — never redirect before this resolves
  return <Navigate to={session ? '/board' : '/auth'} replace />;
}
```

Deleting is the reversible direction: restoring `Landing.tsx` from git history or the design brief is cheap if a real deploy plan later wants a public-facing page; carrying a permanently-unvisited screen through every Plan B gate is not. If the deploy mini-plan (out of scope here, §4) later decides this app gets a public marketing entry point, that's where `Landing.tsx` gets re-added as a scoped item — not speculatively now.

**Guard mechanics — one implementation point.** A single `<RequireAuth>` layout route wraps the protected route set via `<Outlet>`, consuming `useSession()` from 2.1. No per-route hook scatter.

- **While `loading`:** render a spinner (or `null`), never redirect. This is where the tri-state from 2.1 earns its keep — acting before the first resolution is the classic bounce-to-auth-then-back flicker bug.
- **Unauthenticated on a protected route:** `<Navigate to="/auth" replace state={{ from: location }} />` — `replace`, always, so the back button never re-enters a protected page after a redirect.
- **Authenticated on `/auth`:** `<Navigate to={location.state?.from ?? '/board'} replace />` — the `from` capture is standard React Router v7; post-login returns you where you were headed.
- **Session death mid-app** (token expiry, a `SIGNED_OUT` event while on `/status`): the guard re-evaluates on the session transition through the same single context and redirects automatically — no special-casing, including for Settings' own Sign Out button.

**Modal → page conversions, two behavioral details:**

1. `App.tsx`'s `editingId` state dies; the URL param replaces it. `/quest-editor/:id?` derives `editingQuest` from `useEiyu().user.quests.find(q => q.id === id)` internally. **A present-but-not-found `id`** (typo'd, deleted, or another user's — RLS makes the last two indistinguishable) **must redirect to `/board`, not render an empty create-form** — a `null` lookup result with a real `id` in the URL is a distinct case from "no `id` at all, must be creating," and collapsing them is exactly the bug this note exists to prevent.
2. `/history` becomes a real route (mobile parity — it's a top-level screen there too), not an overlay. It's actually reached today from Settings' "Quest History → VIEW" row (not a Board header link, despite what the original UI brief describes — verified against the real wired code, not the brief). That access point becomes a `navigate('/history')` call; the Sidebar stays 4 items — a restructure phase doesn't grow the nav.

**Gate:** every route reachable by direct URL entry (not just in-app navigation), refresh-safe on every route (including `/quest-editor/:id`), back-button never re-enters a protected route after an auth redirect, and the loading case never flashes a redirect before the session resolves.

### 2.4 Real `WebAuth` + `signOut` fix — one phase, same subsystem

`DevAuth.tsx` is **deleted outright**, not feature-flagged during a transition — Plan A's browser walkthrough already proved the real sign-up/sign-in/session-persistence flow works end to end against the live project, so there's nothing left for a parallel throwaway path to de-risk. `web/src/web/WebAuth.tsx` (untouched since Plan A, already has the full login/signup/forgot-password UI including password-strength meter) gets wired to real `supabase.auth.signInWithPassword`/`signUp`/`resetPasswordForEmail` calls, mounted at `/auth`.

Bundled into this phase because it's the same subsystem: the `signOut()` silent-failure gap Plan A's final review flagged (`void supabase.auth.signOut()` with no error surface) is closed here, for free — `signOut` already returns `{ error }` per 2.1's contract, so this is "use what 2.1 built," not new plumbing.

Supabase dashboard redirect-URL configuration (if magic-link/OAuth is added) is **your action, not code** — flagged as an external dependency, not a task.

**Gate:** full manual pass through every screen with a real account, through the real `WebAuth` UI specifically (not `DevAuth`) — sign-up, sign-in, forgot-password, sign-out, and a failed sign-out actually surfacing an error in the UI.

### 2.5 Tooling + cosmetics

ESLint config for `web/`, plus the barrel-discipline rule (forbidding `@eiyu/shared/*` deep imports) deferred since the original mobile-monorepo migration — this finally lands, covering both `mobile/` and `web/` under one config. Plan A's final-review Minor-list cosmetics ride along here if genuinely free: `WebQuestEditor.tsx`'s two separate `@eiyu/shared` import lines (natural to touch if this phase's own changes already touch that file's imports — not worth a dedicated pass otherwise), unused `today` in `WebBoard.tsx`, unused `SnowflakeIcon` export. Scroll restoration (React Router v7 makes it cheap) is polish, not a gate item.

## 3. Phase breakdown

1. **Session consolidation + UTC fix** — §2.1 and §2.2, two commits, one phase.
2. **Routing** — §2.3, replaces the state machine.
3. **Real `WebAuth` + `signOut` fix** — §2.4.
4. **Tooling + cosmetics** — §2.5.

Each phase gates before the next starts, matching Plan A's ceremony: scope → build → test → live-verify → commit. One whole-branch review at the end, same as Plan A.

## 4. Out of scope

- **Deploy execution** — hosting choice, Vite build config for production, the SPA-fallback rewrite (`/*` → `index.html`, needed because Vite's dev server handles client-side routing by default but production static hosts don't), and the coupled `ai-proxy` production-origin addition + redeploy. This is its own future mini-plan, not a gate on any Plan B phase — coupling a CORS/production-origin change to "whatever the last phase happens to be" is exactly the kind of afterthought that already had to be caught once, in Plan A's Task 6.
- **Long-quest edit parity** — `WebLongQuests.tsx` already has a real creation surface (the inline "NEW QUEST" panel, wired to `saveLongQuest` in Plan A). What's genuinely missing is editing an *existing* long quest — rename, add/remove stages — which mobile's `long-quest-editor` screen has (including AI stage-breakdown suggestions) and web does not. Recorded here as a known gap with a future home; it's a feature-parity project, not a restructure-phase task.
- **Landing page content** — deleted per §2.3; not rewritten, not relocated. If a future deploy plan wants a public entry point, that plan re-adds it as a scoped item.
