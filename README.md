# Eiyu System 🗡️

A mobile habit tracker built with React Native & Expo that turns daily habits into visible RPG character progression (Solo Leveling aesthetic) grounded in Atomic Habits mechanics.

## Overview

The Eiyu System replaces manual habit tracking with a rewarding, gamified loop. It implements core *Atomic Habits* mechanics—like implementation intentions, the two-minute rule (easy versions), and a never-miss-twice recovery system—while wrapping the experience in a sleek RPG interface inspired by *Solo Leveling*.

Your real-life habits translate directly into XP for your character's stats (STR, INT, DEX, WIS, CHA), affecting your overall hunter Rank (E → S).

### Key Features

* **Core Habit Tracking**: Schedule daily habits and assign them to specific RPG stats.
* **Two-Minute Rule Fallbacks**: Define an "easy version" for every habit (e.g., 2 minutes of stretching instead of a 1-hour gym session) to maintain your streak for partial XP.
* **Streak Freeze & Recovery**: Missing a day doesn't immediately reset your streak to zero. Instead, your streak freezes and generates a 24-hour "Recovery Quest." Complete it to save your streak!
* **RPG Progression**: Complete habits to earn XP. Level up your stats and watch your radar chart grow in real-time.
* **Supabase Backend**: Full cloud sync — habits, stats, completions, streaks, and long quests are all persisted and synced across devices.
* **Auth**: Email/password auth with session persistence, display-name sign-up, and password reset.
* **History**: Calendar-based completion history with per-day drill-down.
* **Notifications**: Local push notification scheduling for habit reminders.
* **Weekly Quests**: Auto-generated weekly targets per stat.

## Getting Started

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

### Prerequisites

- Node.js (v18+)
- npm or yarn
- Expo CLI
- A [Supabase](https://supabase.com) project (free tier works)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the environment file and fill in your Supabase credentials:
   ```bash
   cp .env.example .env
   ```
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Run the Supabase migrations in order from `backend/supabase/`:
   `001_profiles.sql` → `009_increment_stat_xp_function.sql`
   See [`backend/supabase/README.md`](./backend/supabase/README.md) for details.

4. Start the development server:
   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a:
- [Development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go)

### Running Tests

```bash
npm test
```

Tests live in `lib/__tests__/` and cover the core XP / streak / rank logic.

## Project Structure

The app uses Expo's [file-based routing](https://docs.expo.dev/router/introduction).

```
eiyu-system/
├── app/                        # Screens (expo-router)
│   ├── (tabs)/                 # Tab bar screens
│   │   ├── board.tsx           # Daily habit board
│   │   ├── status.tsx          # Stats & radar chart
│   │   ├── quests.tsx          # Long quests tracker
│   │   └── settings.tsx        # User settings
│   ├── auth.tsx                # Sign in / Sign up
│   ├── history.tsx             # Calendar history modal
│   └── quest-editor.tsx        # Habit creation & editing
├── backend/
│   └── supabase/               # SQL migration files (run in order)
├── components/eiyu/            # Custom UI (glass / Solo Leveling aesthetic)
├── constants/                  # Theme, XP data, and app-wide constants
├── contexts/
│   ├── auth-store.tsx          # Supabase auth context (session, signIn/Out/Up)
│   └── eiyu-store.tsx          # Global app state (habits, stats, XP)
├── lib/                        # Business logic & Supabase query helpers
│   ├── supabase.ts             # Typed Supabase client
│   ├── eiyu-logic.ts           # XP, level curve, rank, streak algorithms
│   ├── habits.ts               # Habit CRUD
│   ├── completions.ts          # Completion recording & XP award
│   ├── stats.ts                # Stat XP fetching
│   ├── history.ts              # Month-based completion history
│   ├── weekly-review.ts        # Weekly quest generation & progress
│   ├── notifications.ts        # Push notification scheduling
│   ├── notification-prefs.ts   # Notification preferences (AsyncStorage)
│   ├── profile.ts              # User profile fetch/update
│   ├── date-utils.ts           # UTC date helpers
│   └── format-error.ts         # Error message normalisation
├── types/
│   ├── database.ts             # Hand-written Supabase DB types
│   └── eiyu.ts                 # App-level types (Stat, Rank, Habit, etc.)
└── docs/
    └── eiyu-system-requirements-v3.md
```

## Learn More

- [Expo Documentation](https://docs.expo.dev/)
- [Supabase Documentation](https://supabase.com/docs)
- [Atomic Habits](https://jamesclear.com/atomic-habits) — the core habit philosophy
