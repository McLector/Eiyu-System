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
* **Sync & Auth**: Built with Supabase to safely sync your progress across devices.

## Getting Started

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

### Prerequisites
- Node.js (v18+)
- npm or yarn
- Expo CLI

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a:
- [Development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go)

## Project Structure (Core Wave)

The app utilizes Expo's [file-based routing](https://docs.expo.dev/router/introduction).
- `app/` - Application screens (Board, Status, Quests, Settings)
- `components/eiyu/` - Custom UI components with the glass/Solo Leveling aesthetic
- `constants/` - Theme data, constants, and mock structures
- `contexts/` - Global state management for stats, XP, and habits

## Learn More
- [Expo Documentation](https://docs.expo.dev/)
- [Supabase Documentation](https://supabase.com/docs)
