# Eiyu System — Web Version: Monorepo & Migration Design

Status: approved, ready for implementation planning
Date: 2026-08-28

## 1. Goal and decisions already made

Add a web version of Eiyu System, built from a UI already drafted in Figma Make,
to the same GitHub repo as the existing Expo mobile app. Decisions locked in
during brainstorming:

- **Same repo, sibling folders** — `mobile/` and `web/` at the project root, so
  either app can be worked on by `cd`-ing into its folder.
- **Shared business logic** — the platform-agnostic parts of the current
  `lib/` (XP curve, rank, streak/freeze math, Supabase query helpers) are
  extracted into a shared package rather than duplicated, so the two apps
  can't drift on things like XP math or streak rules.
- **Same backend** — both apps point at the same Supabase project/database.
  A mobile account logs into the web app and sees the same data. This needs
  no architecture work — it's the default outcome of "two clients, one
  Supabase project."
- **Web framework: deferred, not guessed.** Figma Make usually emits
  React + Vite + TypeScript + Tailwind, but the plan does not assume this.
  The exact stack is confirmed once the Figma Make project link is provided,
  and only Phase 5 (scaffolding `web/`) depends on it.

## 2. Repo layout

```
mobile/            current root Expo app, moved in as-is
web/               new app, seeded from the Figma Make export once the link
                    is provided
packages/shared/   platform-agnostic logic + Supabase query helpers (below)
backend/           unchanged — already shared, one Supabase project for both
docs/              unchanged
```

Root `package.json`:
```json
{
  "workspaces": ["mobile", "web", "packages/shared"],
  "overrides": { "react": "<pinned>", "react-dom": "<pinned>" }
}
```
The `overrides` pin is required — npm workspaces hoist dependencies flat, and
without it `web`'s React could resolve to a different version than the one
RN 0.81.5 expects, which breaks at runtime. Root `package.json` does not proxy
build scripts; each app is run from inside its own folder.

**Recorded decision:** `mobile/` keeps its existing `expo start --web` /
`app.json` static web output as-is (harmless RN-web smoke test), but it is
**not** the product's web experience going forward — `web/` is. No conflict:
two independent build outputs of two independent apps.

## 3. `packages/shared/src/` — scope

```
logic/     eiyu-logic.ts, date-utils.ts, validation.ts, quest-recurrence.ts,
           format-error.ts
data/      habits.ts, completions.ts, stats.ts, profile.ts, long-quests.ts,
           history.ts, weekly-quest.ts, weekly-review.ts
supabase/  client.ts (live-binding singleton, §4)
types/     database.ts, eiyu.ts
constants/ eiyu-data.ts
```

`weekly-quest.ts` and `weekly-review.ts` are filed under `data/`, not
`logic/` — they import `@/lib/supabase`, so they're query helpers like the
rest of `data/`, not pure functions.

**Stays in `mobile/lib/`, does not move:**
- `ai.ts`, `haptics.ts`, `notifications.ts`, `notification-prefs.ts` — genuinely
  RN/Expo-coupled (AsyncStorage, expo-haptics, expo-notifications).
- `supabase.ts` — mobile's own client construction (AsyncStorage-backed
  storage adapter); each app builds its own.
- `safe-padding.ts` — RN-free in its imports, but its actual job (resolving
  Yoga's edge-vs-shorthand padding rules for `components/eiyu/screen.tsx`)
  has no web equivalent. Reusability tracks what code is *for*, not just its
  import list.
- `weekly-summary.ts` — imports `generateWeeklySummary` from `@/lib/ai`,
  which is AsyncStorage-coupled. Moving it would drag RN storage into the web
  bundle. Revisit once the Figma Make export shows whether `web/` needs the
  AI-narrative weekly summary feature at all.
- `constants/eiyu-theme.ts`, `constants/theme.ts` — RN style-object tokens.
  `web/` will carry its own theme file matching the Figma Make output (same
  visual language, not literally shared code).

`packages/shared` ships TypeScript source directly (no build step), with
`"main"`/`"types"` in its `package.json` pointing at `src/index.ts` — a
single barrel export, no deep subpath imports. This keeps it framework-
independent: both Metro and Vite consume TS source fine, and this decision
doesn't need to wait on the Figma Make stack confirmation.

## 4. Shared Supabase client

```ts
// packages/shared/src/supabase/client.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

export let supabase: SupabaseClient<Database>;

export function initSupabaseClient(client: SupabaseClient<Database>): void {
  supabase = client;
}
```

Each app builds its own client (mobile: AsyncStorage + url-polyfill; web:
browser defaults) and calls `initSupabaseClient()` once at startup. Verified:
every data helper in `packages/shared/src/data/` only touches `supabase`
inside function bodies (never at module scope), so this needs zero internal
changes to those modules — they keep importing `{ supabase }` unchanged and
ES module live bindings do the rest.

## 5. Phased migration plan

Each phase: scope → implement → `tsc --noEmit` clean → tests green →
live-verify against the real backend → commit (ask first) → only then next
phase. No CI exists yet, so these phase gates are the safety net; each phase
should leave `main` in a working, revertable state.

### Phase 1 — Workspace skeleton
Root `package.json` gets `workspaces` (including `"web"` from the start —
verified empirically on this machine's npm 11.5.2 that a workspace entry
pointing at a nonexistent or empty directory is silently skipped, not an
install error) + `overrides`. Create empty `mobile/`, `web/`,
`packages/shared/`.
**Gate:** `npm install` succeeds; `npm ls --workspaces` shows what's expected.

### Phase 2 — Move mobile in
`git mv` the current root app (app/, components/, contexts/, hooks/,
assets/, maestro/, app.json, eas.json, tsconfig.json, eslint.config.js,
jest.setup.js, all of `lib/` as-is, trimmed `package.json`) into `mobile/`
as one self-contained app — **no shared extraction yet**. `.env` (the real,
gitignored file, not just `.env.example`) moves too: `mobile/.env`.
**Gate:** `tsc --noEmit` clean, full test suite green, `expo start --web`
still works, all run from inside `mobile/`.

This phase is deliberately just a move, not a refactor — it isolates "did
moving files break anything" from Phase 3's "did extracting shared logic
break anything." A failure here can only be a path/config issue.

### Phase 3 — Extract `packages/shared`
Carve the scope in §3 out of `mobile/lib`, `mobile/types`,
`mobile/constants/eiyu-data.ts` into `packages/shared`; add `client.ts` and
wire `initSupabaseClient()` into `mobile/lib/supabase.ts`.

**Blast radius, quantified (verified by grep, not estimated):** 38 import
statements across `app/`, `contexts/`, `components/`, `hooks/` reference the
modules moving to `packages/shared` — this is not a `lib/`-internal change.
Heaviest consumers: `contexts/eiyu-store.tsx` (10), `components/eiyu/dev-ball.tsx`
(5), `app/quest-editor.tsx` and `app/(tabs)/status.tsx` (4 each). The
mobile-retained `lib/ai.ts`, `lib/weekly-summary.ts`, and `lib/supabase.ts`
also import shared modules and need their imports updated too. All of it is
mechanical (rewrite to `@eiyu/shared`), but budget it as a repo-wide pass
across ~20+ files, not a `lib/`-only edit.

Also add to `mobile`'s jest config:
`moduleNameMapper: { '^@eiyu/shared$': '<rootDir>/../packages/shared/src/index.ts' }`
(same alias in `mobile/tsconfig.json`). This resolves the shared package's
real source path directly, outside `node_modules` — necessary because
`jest-expo`'s default `transformIgnorePatterns` only whitelists RN-specific
packages and would otherwise leave `@eiyu/shared`'s TypeScript untransformed,
producing a syntax error on import.

**Gate:** `tsc --noEmit` clean in both `mobile/` and `packages/shared/`;
mobile's full test suite green; `packages/shared`'s own test suite (moved
with the code, running under plain `ts-jest`/node — no `jest-expo` preset,
nothing RN in there) green.

### Phase 4 — SDK 54 monorepo config + cache purge
Set `experiments.autolinkingModuleResolution: true` in `mobile/app.json` —
confirmed via the live Expo v54 docs: forces Metro's JS resolution of
`react`/`react-native`/autolinked native modules to match Expo Autolinking's
results, explicitly recommended for SDK 54 monorepos (auto-enabled only from
SDK 55 onward). This only matters once a symlinked workspace package exists,
which is why it comes after Phase 3, not folded into Phase 2.

Delete `.expo/` and any local `android/` (gitignored CNG output, may contain
stale absolute build-cache paths from the old root), run
`npx expo start --clear` once from `mobile/`, wipe `node_modules` and
regenerate the lockfile via a clean `npm install` at root.

Also: add `mobile/.env.example` — fixes a pre-existing gap in the repo (it
never existed despite the README referencing it) with the `EXPO_PUBLIC_*`
vars, unrelated to the move itself but natural to fix while touching env
setup.

**Gate:** re-run all of Phase 2 and Phase 3's checks from a clean state.

### Phase 5 — Scaffold `web/`
Once the Figma Make project link is provided: confirm the actual generated
stack, bring the code into `web/`, wire it to `@eiyu/shared` and its own
Supabase client (browser-default storage), add `web/.env.example` with
whatever env-var prefix that framework requires.
**Gate:** builds, typechecks, and live-verifies against the real Supabase
project — log in with a real account and see real data, not a mocked
response.

## 6. Open items (deliberately deferred, not forgotten)

- **Web framework** — confirmed in Phase 5 from the actual Figma Make export.
- **`ai.ts` / `weekly-summary.ts` shareability** — revisit once Phase 5
  shows whether `web/` needs the AI-suggest / AI-weekly-summary features;
  if so, these need their AsyncStorage-based 24h cache replaced with a
  pluggable cache interface before they can move to `packages/shared`.
- **Deployment target for `web/`** (Vercel/Netlify/Cloudflare Pages, etc.) —
  not decided; not needed until Phase 5.
