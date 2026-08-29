# Eiyu System — Web UI Brief (for Figma Make)

> Complete project rundown derived directly from the codebase. Every token, color, font and
> layout rule below is copied from the actual source (constants/eiyu-theme.ts,
> constants/eiyu-data.ts, components/eiyu/*, app/*). Use this as the single source of truth
> when designing the web version.

---

## 1. What This Product Is

**Eiyu System** is a gamified habit tracker styled after the anime *Solo Leveling* — a "System"
interface that turns real-life daily habits into RPG character progression. The core loop,
grounded in James Clear's *Atomic Habits*:

1. User schedules daily habits ("quests") and assigns each to one of 5 RPG stats.
2. Completing a quest awards XP to that stat.
3. Stats level up; a 5-axis radar chart grows; the user's overall Hunter Rank (E→S) rises.
4. Missing a day **freezes** the streak and generates a 24-hour "Recovery Quest" instead of
   resetting to zero (never-miss-twice recovery).
5. Every habit has an "easy version" (two-minute rule) — completing it awards partial XP (~20%).
6. "Long Quests" are multi-stage personal projects with AI-suggested stage breakdowns.
7. An AI generates a weekly summary of the user's performance (Gemini via a Supabase Edge Function).

**Tone/voice:** futuristic "system window" HUD — mono-spaced status readouts, uppercase
letterspaced labels, glowing cyan accents, glassmorphic panels over a deep navy gradient.
Japanese RPG aesthetic. Terms used in UI: "Hunter", "Quest", "Rank", "System".

**Platform note:** the existing app is React Native (Expo) mobile with tab-bar navigation.
The web version should re-interpret this as a desktop layout while preserving the exact
visual language below.

---

## 2. Technical Architecture (context only — not needed for UI)

```
UI Layer    app/ — expo-router file-based routing
            Root Stack → Auth gate → (tabs) + modal screens
Component   components/eiyu/ — custom design system:
            glass, gradient, radar chart, icons
State       contexts/
            AuthProvider — Supabase session (auth-store)
            EiyuProvider — TanStack Query + optimistic updates
Domain      lib/ — pure functions, unit-tested
            XP curve, rank, streak/freeze algorithms, dates
Data        lib/supabase.ts + per-entity query helpers
Backend     Supabase: Postgres, RLS, RPCs, Gemini Edge Function
            14 ordered SQL migrations in backend/supabase/
```

**Stack:** TypeScript (strict), expo-router 6, React 19, TanStack Query 5 (local-first,
AsyncStorage-persisted), Supabase JS v2, Reanimated 4, expo-blur, expo-linear-gradient,
react-native-svg. Web is supported via react-native-web (notifications are no-op'd on web).

---

## 3. Design System

### 3.1 Typography (Google Fonts, loaded at app root)

| Token         | Font                        | Usage |
|---------------|-----------------------------|-------|
| display       | **Rajdhani 700 Bold**       | Big titles ("Today's Quests"), rank letters, section headers, RETRY buttons — the "system HUD" font |
| displaySemi   | Rajdhani 600 SemiBold       | Tab bar labels (10px, letterSpacing 1), GhostButton labels (16px), small uppercase headers |
| displayMed    | Rajdhani 500 Medium         | Secondary display text |
| body          | Inter 400 Regular           | Body copy, quest names, list rows |
| bodyMed       | Inter 500 Medium            | Emphasis |
| bodySemi      | Inter 600 SemiBold          | Strong emphasis |
| mono          | JetBrains Mono 500 Medium   | XP numbers, streak counts, timestamps, countdowns, progress fractions |
| monoSemi      | JetBrains Mono 600 SemiBold | System readouts emphasis |

Recurring type patterns:
- Small uppercase labels with letterSpacing 1–1.5 (e.g. "WEEKLY QUEST", "STATUS OVERVIEW")
- Body text 13–14px, lineHeight ~21
- Large display numerals 20px (section titles) up to 38px (rank letter)
- Tab bar labels: Rajdhani SemiBold 10px, letterSpacing 1, uppercase

### 3.2 Color Tokens — Dark theme (default, primary experience)

```
text:          #dff0fb                 (near-white ice blue)
muted:         rgba(163,210,230,0.55)
dim:           rgba(163,210,230,0.38)
accent:        #67e8f9                 (cyan — THE brand color)
accentGlass:   rgba(103,232,249,0.08)
accentHover:   rgba(103,232,249,0.14)
accentBorder:  rgba(103,232,249,0.22)
accentStrong:  rgba(103,232,249,0.38)
glass:         rgba(6,22,42,0.65)      (card background w/ blur)
glassSm:       rgba(6,22,42,0.75)      (compact cards / inputs)
glassBorder:   rgba(103,232,249,0.12)
track:         rgba(6,20,40,0.8)       (progress bar track)
modal:         rgba(5,18,35,0.97)
overlay:       rgba(3,13,26,0.85)
nav:           rgba(4,12,22,0.92)      (tab bar w/ 40-intensity blur)
navBorder:     rgba(103,232,249,0.1)
navDim:        rgba(163,210,230,0.35)
pageGradient:  #040f1e → #030c18 → #040e1c   (3-stop vertical, deep navy)
body:          #030d1a
```

### 3.3 Color Tokens — Light theme (secondary, "daylight" variant)

```
text:          #0b1e32
muted:         rgba(14,52,80,0.55)
dim:           rgba(14,52,80,0.38)
accent:        #0891b2                 (teal-cyan)
accentGlass:   rgba(8,145,178,0.08)
accentHover:   rgba(8,145,178,0.14)
accentBorder:  rgba(8,145,178,0.22)
accentStrong:  rgba(8,145,178,0.38)
glass:         rgba(255,255,255,0.62)
glassSm:       rgba(255,255,255,0.78)
glassBorder:   rgba(8,145,178,0.2)
track:         rgba(8,145,178,0.1)
modal:         rgba(237,248,255,0.97)
overlay:       rgba(180,220,245,0.75)
nav:           rgba(210,240,255,0.92)
navBorder:     rgba(8,145,178,0.15)
navDim:        rgba(14,52,80,0.35)
pageGradient:  #d6ebf8 → #e5f4ff → #d4e9f6   (pale blue)
body:          #d6ebf8
```

### 3.4 Semantic / Data Colors

**Stat colors** (used consistently everywhere — tags, XP bars, radar chart, editors):
- STR `#f87171` (red)
- INT `#60a5fa` (blue)
- DEX `#fbbf24` (amber)
- WIS `#c084fc` (purple)
- CHA `#fb923c` (orange)

**Rank colors** (badge text / border / bg / outer glow):
- S: gold `#ffd700`, bg rgba(255,215,0,0.14), glow rgba(255,215,0,0.45)
- A: magenta `#e879f9`, bg rgba(232,121,249,0.14), glow rgba(232,121,249,0.4)
- B: blue `#60a5fa`, bg rgba(96,165,250,0.14), glow rgba(96,165,250,0.4)
- C: green `#4ade80`, bg rgba(74,222,128,0.14), glow rgba(74,222,128,0.4)
- D: slate `#94a3b8`, bg rgba(148,163,184,0.1), glow rgba(148,163,184,0.3)
- E: gray `#64748b`, bg rgba(100,116,139,0.08), glow rgba(100,116,139,0.2)

**Difficulty tags:** Easy green `#4ade80`, Medium amber `#fbbf24`, Hard red `#f87171`
— ~12%-alpha bg, ~20% alpha border, pill radius 6, 11px uppercase-ish text.

**Success / XP toast:** green `#4ade80` text on `rgba(74,222,128,0.22)` with
border `rgba(74,222,128,0.55)`, radius 8, mono font (e.g. "+20 XP").
**Danger / destructive:** `#f87171`.
**Recovery / frozen:** ice blue `#93c5fd` + snowflake icon; banner uses
bg `rgba(59,130,246,0.1)`, border `rgba(96,165,250,0.3)`.

### 3.5 Shape, Material & Layout Language

- **Glassmorphism everywhere.** Cards: radius 20, 1px glassBorder, semi-transparent bg +
  background blur intensity 40 (web: `backdrop-filter: blur(30–40px)`). Compact cards /
  inputs: radius 14, blur 30, glassSm background.
- **Page background:** fixed 3-stop vertical gradient (pageGradient); all content scrolls
  above it. Bottom nav bar: blurred (nav bg + 40-intensity blur), 1px cyan-tinted top border
  (navBorder), transparent elsewhere.
- **Buttons — GhostButton (the primary button style across the app):** fully pill-shaped
  (radius 50), paddingVertical 14, 1px accentBorder border, accentGlass background,
  label Rajdhani SemiBold 16px letterSpacing 1 in accent cyan, optional icon at left with 8px gap.
  Pressed = 75% opacity; disabled = 50% opacity. Web equivalent: subtle hover using accentHover.
- **Secondary text buttons:** transparent, 1px accentBorder, radius 8, uppercase Rajdhani
  letterspaced labels (e.g. "RETRY").
- **Progress bars:** 5–6px tall, radius 4, colored fill on `track`, fill animates
  (scaleX, ~550ms, cubic ease-out) — on web use a width/transform transition of ~550ms.
- **Checkboxes:** 28×28, radius 8, 1.5px border. Completed: border rgba(74,222,128,0.5),
  bg rgba(74,222,128,0.15), green `#4ade80` check icon. Frozen (incomplete): border
  rgba(96,165,250,0.4). Default: accentBorder.
- **Dividers:** 1px hairline in glassBorder, used inside glass lists between rows.
- **Icons:** custom thin-stroke SVG icon set (sword/board, status/radar, scroll, gear,
  snowflake, chevrons, check, plus, sun/moon, stat symbols). Draw similar minimal line icons.
- **Motion:** rows/toasts fade-in-up (~180ms) and fade-out-up (~520ms); XP toast floats up
  from its row; modals slide up from bottom; haptic feedback on tap (web: subtle transitions).
- **Rank badge:** square-ish (72px), radius 18, 2px rank-colored border, rank-colored bg
  tint, big rank letter in Rajdhani Bold 38px, outer glow shadow in rank glow color.
- **Accessibility:** real progressbar/checkbox semantics; keep accessible labels in web build.

---

## 4. Navigation & Screen Inventory

Root is a **Stack with an auth guard**: unauthenticated → Auth screen only;
authenticated → tab shell + three modal sheets (slide-up: quest-editor, history,
long-quest-editor).

### 4.1 Tab bar (bottom, blurred, uppercase Rajdhani labels)
1. **BOARD** (sword icon) — daily habit dashboard
2. **STATUS** (radar icon) — character sheet
3. **QUESTS** (scroll icon) — long quest tracker
4. **SETTINGS** (gear icon) — user settings

### 4.2 Auth screen (full-screen, no tab bar)
Three modes in one screen: **Login / Sign up / Forgot password**.
- Fields: email, password. Sign up adds display name, confirm password, terms checkbox
  (terms open in a modal sheet).
- Password strength meter: Weak / Okay / Good / Strong — colors
  `#f87171` → `#fbbf24` → `#4ade80` → `#4ade80`.
- Inline validation errors under fields; submit shows spinner; outcomes shown as
  emoji-titled notice cards (e.g. "📧 check your email").
- Glass panels on the gradient background; GhostButton as submit.

### 4.3 BOARD — daily habit dashboard (home screen)
Order of content, top to bottom:
1. **Header:** user name + hunter class, glowing **RankBadge**, link to history.
2. **Stats strip (GlassView):** per-stat row `name · level digit (mono, stat color) ·
   thin animated XP bar` for all 5 stats.
3. **Recovery banner (conditional):** ice-blue card (colors above), radius 16 —
   snowflake icon + title "STREAK FROZEN — RECOVERY QUEST" (Rajdhani, #93c5fd),
   countdown "{n}h left" in mono on the right, habit name, "Easy version: …" line,
   then GhostButton "Mark Recovery Complete" (awards +4 XP toast).
4. **Weekly Quest card:** auto-generated weekly target for the user's weakest stat,
   e.g. "Complete 5 INT quests this week" + progress pill.
5. **Section header:** "Today's Quests" (Rajdhani 20px) + subtitle "{completed} of {total}
   completed" + progress pill "{completed}/{total}" (mono, accent, on accentGlass) at right.
6. **Quest list (one GlassView, dividers between rows):**
   - Row: checkbox (28×28) · quest info · stat tag + difficulty pill at right.
   - Quest info: name (Inter, 14px), meta row (🔥 {streak} in mono, or a **"TODAY"**
     pill for one-time quests; reminder time in dim), optional collapsible note
     "📝 {description}" (single line collapsed, tap to expand).
   - Frozen quests: snowflake icon beside tags.
   - Completed rows: whole row opacity 0.55, name line-through + muted.
   - XP toast: appears anchored to the row on completion, mono "+{n} XP" in green.
   - Interactions: tap checkbox = complete (+20 XP); long-press (web: hover menu /
     secondary button) = complete easy version (+4 XP); tap row body = edit.
   - Empty state text; error state: message in red + "RETRY" text button.
7. FAB / plus button → quest-editor modal.

### 4.4 STATUS — character sheet
- **Segmented two-tab toggle:** "STATS" | "WEEKLY" (pill buttons, radius 10,
  active = accentGlass bg + accentBorder).
- **Stats tab:**
  - Player card: name, class, big glowing rank badge, "RANK" label, rank subtitle.
  - **5-axis radar chart** (SVG, ~240px): 4 concentric grid rings, radial spokes,
    filled polygon in accent cyan (1.5px stroke, vertex dots r=3), stat letters
    labeled at each axis.
  - Per-stat rows: colored stat name, level pill (bordered, radius 8),
    mono "{xp}/{xpMax}", thin XP bar in stat color.
- **Weekly tab:**
  - Day-by-day rows (Sun–Sat): day label, progress bar, completion dots (6px).
  - Per-stat totals row beneath.
  - **"AI Weekly Summary" card:** small uppercase title + generated narrative
    paragraph (prefetched on mount; loading state while generating).

### 4.5 QUESTS — long quest tracker
- Cards for each Long Quest: name, stat color tag, **stage checklist** (2–8 checkbox
  rows), overall progress, chevron expand/collapse.
- Delete with inline confirm modal ("Delete this quest?") — not a browser confirm.
- Empty state; plus button → long-quest-editor modal.

### 4.6 SETTINGS
Glass-grouped rows (Dividers between):
- **Dark mode toggle** (sun/moon icons)
- **Notifications toggle** (triggers OS permission request)
- Reminder sound toggle
- Profile section (display name / class)
- **History** link row (chevron)
- Danger zone: **Sign out** (red `#f87171`, chevron)
- Custom switch: track (radius pill) + sliding thumb; active = accentGlass track +
  accent thumb; inactive = dim thumb.

### 4.7 Quest Editor (modal, slide-up) — habit create/edit
Fields:
- Quest name (text input, glassSm)
- Description / note (optional)
- **Quest type:** Recurring habit vs One-time quest
- **Stat selector:** 5 colored chips STR/INT/DEX/WIS/CHA (selected = stat color)
- **Difficulty:** Easy / Medium / Hard pills (green/amber/red)
- Reminder **time picker** ("HH:mm", displayed 12h with AM/PM)
- **Days-of-week selector:** Sun–Sat toggle chips
- "Easy version" field with **✨ AI SUGGEST** button (Gemini suggests a 2-minute
  fallback; 20s timeout, cached 24h; show inline error on failure)
- Save (GhostButton) / Cancel

### 4.8 Long Quest Editor (modal)
Name, stat chips, stage list (min 2, max 8, add/remove),
**✨ AI SUGGEST STAGES** button (breaks goal into stages), Save.

### 4.9 History (modal) — calendar month view
- Month navigation: ‹ Month Year ›
- Weekday header row (S M T W T F S)
- Day grid with **completion dots**: green dot = full completion, amber = easy/partial.
- Tapping a day drills into a per-day list: completed habits with kind + XP awarded.

---

## 5. Reusable Components (components/eiyu/)

| Component | Exact behavior |
|-----------|----------------|
| Screen | Scroll scaffold w/ safe-area + keyboard-aware scrolling (web: page container) |
| PageBackground | Fixed full-viewport gradient backdrop (pageGradient) |
| GlassView | Blurred glass card — radius 20 (14 when `small`), 1px glassBorder, glass/glassSm bg + backdrop blur 40/30 |
| Divider | 1px hairline in glassBorder |
| GhostButton | Primary pill button — spec in §3.5 |
| RadarChart | SVG 5-axis radar — 4 grid rings (25/50/75/100%), spokes, filled polygon, vertex dots, stat labels |
| icons.tsx | Custom SVG set: Board, Status, Scroll, Gear, Check, Plus, Chevron, Snowflake, Stat, Sun/Moon |

## 6. Data Model (drives what each screen renders)

**App types (types/eiyu.ts):**
- `Stat = STR | INT | DEX | WIS | CHA`
- `Rank = E | D | C | B | A | S`
- `Difficulty = Easy | Medium | Hard`
- `QuestType = habit | one_time`
- `Quest`: id, name, stat, difficulty, easyVersion (null for one-time), description,
  questType, time ("HH:mm"), days (weekday numbers), streak, frozen, frozenHoursLeft,
  frozenDate, completed
- `LongQuest`: id, name, stat, stages[] (id, name, done)
- `UserProfile`: name, userClass, rank, stats Record<Stat, {level, xp, xpMax}>,
  quests[], longQuests[]

**Supabase tables:** profiles (display_name, user_class, target_role, theme),
stats (one row per stat, total xp), habits (name, easy_version, description, quest_type,
stat, difficulty, reminder_time, days[], archived), habit_completions (completed_on,
kind full|easy, xp_awarded), streaks (best), long_quests + long_quest_stages (ordered,
done), weekly_quests (week_start, stat, target/current), weekly_summaries (week_start,
summary). RPCs: complete_habit, undo_habit_completion (atomic + server-side XP),
increment_stat_xp. Row-Level Security throughout.

## 7. Business Rules (drive all UI states)

- **XP:** full completion = **+20 XP**; easy/recovery = **+4 XP** (~20%). Server-computed.
- **Level curve:** level N costs `100 + (N−1)×25` XP. Stats start at level 1 (0/100).
- **Rank:** average of 5 stat levels → S≥40, A≥30, B≥20, C≥10, D≥5, else E.
- **Streak:** consecutive *scheduled* days completed; today-not-yet-done does not break it.
  **Freeze:** first missed scheduled day → 24h recovery window the next day, streak held,
  countdown shown, recovery completion backdated to the missed day. Window lapses →
  streak resets to 0 ("broken").
- **Weekly Quest:** auto-generated weekly target for the **weakest stat** (lowest level,
  tie → lowest XP → alphabetical), roughly one completion per weekday; one-time quests
  excluded from the count.
- **AI features:** easy-version suggestions, long-quest stage breakdown, weekly narrative
  summary — all proxied through a Supabase Edge Function (Gemini), 20s client timeout,
  24h TTL client cache.
- **Optimistic UI:** completions/stage toggles update instantly and roll back with an
  inline error if the server rejects — design should assume instant feedback.

## 8. Suggested Web Layout Translation

- The 4 tabs map naturally to a **sidebar or top-nav web app**; the modals (quest editor,
  history, long quest editor) become right-side drawers or centered dialogs.
- Keep the **dark theme as the hero experience** (deep navy gradient + cyan glass);
  offer light as a toggle (Settings).
- Preserve the three signature visual moments: the **glowing Rank badge**, the
  **animated radar chart**, and the **glass quest rows with XP toasts**.
- Board should feel like a "daily mission terminal": stats strip up top, recovery banner
  and weekly quest as alert cards, quest list as the main work area.
- Backdrop blur + rgba surfaces over the gradient is the core material; avoid solid
  opaque cards except modals.
