# Eiyu System 🗡️

A habit tracker built with React Native/Expo (mobile) and React/Vite (web) that turns daily habits into visible RPG character progression (Solo Leveling aesthetic) grounded in Atomic Habits mechanics.

**Live web app:** [eiyu-system.vercel.app](https://eiyu-system.vercel.app)
**Mobile:** distributed as an installable Android APK via EAS (see [`mobile/`](./mobile)) — not on the Play Store.

## Overview

The Eiyu System replaces manual habit tracking with a rewarding, gamified loop. It implements core *Atomic Habits* mechanics — like implementation intentions, the two-minute rule (called a Penalty in the app), and a never-miss-twice recovery system — while wrapping the experience in a sleek RPG interface inspired by *Solo Leveling*.

Your real-life habits translate directly into XP for your character's stats (STR, INT, DEX, WIS, CHA), affecting your overall hunter Rank (E → S).

### Key Features

* **Core Habit Tracking**: Schedule daily habits and assign them to specific RPG stats.
* **Penalty Fallbacks**: Define a small two-minute-rule Penalty for every habit (e.g., 2 minutes of stretching instead of a 1-hour gym session) to maintain your streak for partial XP.
* **Streak Freeze & Recovery**: Missing a day doesn't immediately reset your streak to zero. Instead, your streak freezes and generates a 24-hour "Recovery Quest." Complete it to save your streak!
* **RPG Progression**: Complete habits to earn XP. Level up your stats and watch your radar chart grow in real-time.
* **One-time quests and Backlog**: Give a one-off quest a day or no date at all (a set time needs a date), or park an idea in the Backlog with an optional genre (tool, concept, docs / article, software idea, to-do). Move it between Backlog and today's One-time lane from its menu (or by dragging, on web); a One-time quest whose day passes unfinished returns to the Backlog at midnight. Undated and upcoming quests sit on the One-time lane marked "No date" or "Upcoming <date>", can be completed any time, and never return to the Backlog; the date can be changed until the quest is finished.
* **Long Quests**: Multi-stage goals that track progress across weeks, separate from daily habits. On the web they live on the Chain Progression page: the selected chain fills the page and a Your chains list beside it switches between chains. Each stage reads Done, Current or Locked, the current stage has a COMPLETE STAGE button, and the last finished stage can be undone from its menu. On Android the Chain tab lists your chains and opens each on its own screen with the same stages, COMPLETE STAGE button and undo; AI stage suggestions are not offered on the phone.
* **Offline completions (Android)**: Completing or undoing a quest, changing a quantity quest's progress, and finishing a recovery keep working without a connection. The change shows at once with a Waiting to sync tag, is kept across the app being closed, and is sent when the phone is back online. The server only accepts a completion for the current day, so a change still waiting when the day ends is not applied: the Board lists it under Not saved, where you can dismiss it. Everything else (editing, archiving, Chain, Gym) still needs a connection.
* **Home-screen widget (Android)**: An "Eiyu: Today" widget shows your TODAY count and today's quests, with a tick for done and a ring for open. It reads a copy the app saves whenever the board changes, so it never needs a connection or a sign-in of its own. A change still waiting to sync shows Waiting to sync next to it, and a failed one shows Not saved. If the board it holds is from an earlier day it says Open Eiyu to load today instead of showing old ticks, and after you sign out it asks you to sign in. Android refreshes it at least every 30 minutes, but it is only as fresh as the last time the app ran. Tapping it opens the Board on the Daily lane. It is read-only: you cannot complete a quest from it. It needs the 1.2.0 build, which is a native change and cannot arrive as an over-the-air update.
* **Gym Progress**: Routines of exercises with sets, reps, rest, RIR and an optional GIF or MP4 video guide. Pick an exercise from the list to see its guide with its notes beside it and its numbers below. Type a weight into Current and press Enter (or the arrow) to log it; the weight before it becomes Previous. There is no workout to start or finish. On Android the Gym tab has a routine chip (with Include archived and a new-routine button), the exercise list, and a swipeable full-screen card per exercise with the guide, the numbers and a large weight field with LOG WEIGHT; routines and exercises have full-screen editors that can attach a GIF or MP4, and Workout history is under the routine's menu. The exercise form has a clearly labelled drop area for the demonstration (drag a file onto it on web, tap the card on the phone). On the phone the guide starts muted and a speaker button turns its sound on.
* **AI Weekly Summary**: A Gemini-powered natural-language recap of the week's progress, generated server-side (the API key never reaches the client) — always a suggestion you can edit or discard, never auto-saved.
* **Safe layout (Android)**: The tab bar is part of the screen rather than floating over it, and it includes the phone's navigation bar, so ADD A QUEST, NEW CHAIN, ADD EXERCISE and the last row of every list stay visible with gesture or 3-button navigation and at any system font size.
* **Show password**: an eye button on the password and confirm-password fields of the sign-in and sign-up forms (web and Android).
* **Supabase Backend**: Full cloud sync — habits, stats, completions, streaks, and long quests are all persisted and synced across devices, shared between the mobile and web clients.
* **Auth**: Email/password auth with session persistence, display-name sign-up, and password reset. On Android, Settings is a sheet from the account menu: dark/light switch, eight colour palettes (saved on the account, like on web), quest reminders, completion sound and Quest History.
* **History**: Calendar-based completion history with per-day drill-down.
* **Notifications**: Local push notification scheduling for habit reminders (mobile only).
* **Weekly Quests**: Auto-generated weekly targets per stat (not shown in the current Status screens of either app).

## Project Structure

This is an npm-workspaces monorepo with three packages sharing one Supabase backend:

```
eiyu-system/
├── mobile/                     # Expo (React Native) app — the original client
│   ├── app/                    # Screens (expo-router, file-based routing)
│   ├── components/eiyu/        # Custom UI (flat, palette-driven System look)
│   ├── lib/                    # Mobile-specific Supabase client, notifications, etc.
│   ├── widgets/                # Android home-screen widget (headless task handler + drawing)
│   ├── eas.json                # EAS Build/Update profiles (development/preview/production)
│   └── maestro/                # Maestro E2E test flows
├── web/                        # Vite + React web client — deployed to Vercel
│   └── src/
│       ├── web/                 # Web-specific screens (WebBoard, WebStatus, Landing, ...)
│       ├── pages/                # Router route components
│       ├── store/                # Session + app state (eiyu-store)
│       └── lib/                  # Web-specific Supabase client, cache adapter
├── packages/shared/             # @eiyu/shared — XP/level/rank/streak logic and DB types,
│                                 # consumed by both mobile and web
├── backend/supabase/            # SQL migrations (001–038, run in order) + Edge Functions
│   ├── README.md                 # How to apply migrations + verify what's applied
│   └── functions/ai-proxy/       # Gemini-backed weekly-summary Edge Function
└── docs/                        # Requirements doc, design/migration plans
```

`mobile/`, `web/`, and `packages/shared` are npm workspaces (see root `package.json`); each has its own `package.json`, dependencies, and scripts.

## Getting Started

### Prerequisites

- Node.js 22.x
- npm
- A [Supabase](https://supabase.com) project (free tier works)
- For mobile builds: an [Expo](https://expo.dev) account + [`eas-cli`](https://docs.expo.dev/eas/)

### Installation

1. Install dependencies (from the repo root — this installs all three workspaces):
   ```bash
   npm install
   ```

2. Run every Supabase migration in filename order from `backend/supabase/`:
   `001_profiles.sql` → `038_backlog_genre_optional_time.sql`
   See [`backend/supabase/README.md`](./backend/supabase/README.md) for how to apply them and verify they landed.

3. Copy the environment file for whichever client you're running and fill in your Supabase credentials:
   ```bash
   # mobile
   cp mobile/.env.example mobile/.env
   # web
   cp web/.env.example web/.env
   ```
   Both use the same shape:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co       # mobile
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   VITE_SUPABASE_URL=https://your-project.supabase.co               # web
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

4. Run a client:
   ```bash
   npm run start --workspace mobile   # Expo dev server
   npm run dev --workspace web        # Vite dev server
   ```

   For mobile, the output gives you options to open in a [development build](https://docs.expo.dev/develop/development-builds/introduction/), [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/), [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/), or [Expo Go](https://expo.dev/go).

### Mobile distribution (EAS)

The mobile app isn't on the Play Store — it ships as a downloadable APK, self-hosted for beta use:

- **Full rebuild** (native deps or `app.json` changes): `eas build --profile preview --platform android` from `mobile/`, then install the resulting APK from the link EAS prints.
  The home-screen widget draws without the app's screens, so a build meant to show it should bundle its JavaScript (a release build); a development build only draws it while Metro is reachable.
- **JS/asset-only update** (no rebuild needed): `eas update --branch preview` pushes an OTA update that the installed app picks up on next launch.

### Running Tests

```bash
npm run lint --workspaces          # lint every workspace
npm test --workspace mobile        # mobile: XP / streak / rank logic (lib/__tests__/)
npm test --workspace web           # web: component tests
npm test --workspace packages/shared
```

## Learn More

- [Expo Documentation](https://docs.expo.dev/)
- [EAS Build & Update](https://docs.expo.dev/eas/)
- [Supabase Documentation](https://supabase.com/docs)
- [Atomic Habits](https://jamesclear.com/atomic-habits) — the core habit philosophy
