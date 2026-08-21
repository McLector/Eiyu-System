# EIYU SYSTEM — Requirements & Feasibility

**Version 3.0 · Lean edition** — supersedes the earlier 3-document SDLC set (trashed for being over-scoped)
**Framing:** written as a PM handing requirements to a developer (same person, different hats)

---

## 1. Overview

**What it is:** a mobile habit tracker where completing habits levels up a 5-stat character sheet, styled after Solo Leveling, built on Atomic Habits mechanics (implementation intentions, two-minute rule, never-miss-twice recovery).

**One-sentence core function:** *turns completed daily habits into visible character progression.*

**Goals, in order:**
1. Daily tool that replaces the manual "Eiyu System" tracking sheet
2. Real product — ships to Play Store, tested by people the developer knows
3. Portfolio piece demonstrating real engineering practice
4. Learning vehicle for React Native, TypeScript, Supabase

**Explicitly not goals:** iOS launch day one (Android-first), monetization, social/competitive features, a large userbase.

---

## 2. Feasibility

### 2.1 Technical — feasible
Everything here maps to a documented Expo SDK 54 / Supabase capability. No ML, no custom native modules, no real-time multiplayer. The two things that need proving by building, not by planning:

- **The completion-reward animation has to feel good** — confirmed doable, build it early regardless, since the whole loop depends on it.
- **Auth/sync adds real complexity** (RLS policies, session handling, offline-then-sync conflicts) that a purely local app wouldn't have. Not a blocker, just the main source of build time.

### 2.2 Schedule — the honest number
Solo developer, ~8–10 hrs/week around thesis and coursework. Rough estimate for everything in §3: **150–200 hours**. At 10 hrs/week that's **15–20 weeks**.

**Recommendation:** ship in two waves regardless of what the final doc says elsewhere — a **Core wave** (auth, habit CRUD, the loop, streaks/recovery, stats, notifications) that's a genuinely complete usable app, then a **Full wave** (radar polish, Long Quests, Weekly Quest, AI features, dashboard refinements). Core wave is where "shippable" actually happens; don't let Full-wave features hold up getting it in testers' hands.

### 2.3 Cost — near zero
Expo, React Native, SQLite: free. Supabase: free tier covers this easily (well under 500MB / 50k MAU for a friends-and-testers rollout). Google Play Developer account: $25 one-time, only needed at actual publish time. AI API calls: a few dollars a month at most, given low frequency (weekly summary, occasional suggestions).

### 2.4 Legal/ethical — clean
No copyrighted names/art/text used from Solo Leveling or Atomic Habits — mechanics and inspiration only. Standard Supabase auth (email/password, optionally Google) — no unusual data collected. One rule worth stating outright: **no guilt-based or shame-based copy anywhere in the app** — the whole point of the recovery mechanic is to avoid the punitive pattern other habit apps use.

**Verdict: proceed.** No red flags, one schedule recommendation (split into Core/Full waves) baked into the plan below.

---

## 3. Feature List

### Core tracking
- Create/edit/archive a habit — name, schedule (daily / specific weekdays), time, stat assignment
- Today's list — what's due, sorted by time
- Complete in one tap
- History/calendar view of past completions
- Local notifications at scheduled time

### Atomic Habits mechanics
- **Easy version** per habit — a scaled-down ~2-minute fallback, worth partial XP, keeps the streak alive
- **Streak freeze + Recovery Quest** — miss a day → streak pauses (doesn't reset) → 24h window to complete the easy version and restore it → if the window lapses, streak resets

### Gamification (Solo Leveling skin)
- **5 stats** — STR, INT, DEX, WIS, CHA — every habit tagged to one
- **XP + levels** per stat, animated on completion
- **Radar/spider chart** of the five stats
- **Overall Rank** (E → S) derived from average stat level
- **Weekly Quest** — auto-generated each week, targets the weakest stat
- **Long Quests** — optional multi-stage tracking for big goals (thesis, certifications, books)

### Dashboard
- Real-time stats view — local data, updates the instant a habit is completed. Not optional, not AI — this is the "reward made visible."

### Auth & Sync
- Sign up / log in (email+password, optionally Google)
- Data synced to Supabase so it survives a lost phone / new device
- Each user's data private to them (Row Level Security)

### AI (small, deliberately scoped)
- **Weekly summary** — short paragraph on the Status screen, once a week, one real pattern + one thing going well
- **Easy-version suggester** — 3 AI-suggested easy versions when creating a habit, optional to use
- **Long Quest breakdown** — turns a goal name into 3–6 editable stages

**Explicitly excluded:** AI auto-generating daily habits (removes the point of choosing them yourself), AI chatbot companion, in-app currency/shop, class/skill trees, social features, streak "shields."

---

## 4. Requirements

Flat, prioritized. **M**ust = Core wave · **S**hould = Core if time allows · **C**ould = Full wave.

### Habits
| ID | Requirement | Pri |
|---|---|---|
| R-01 | Create a habit with name, schedule, time, and stat | M |
| R-02 | Every habit must have both a full version and an easy version defined at creation | M |
| R-03 | Edit or archive an existing habit | M |
| R-04 | Today's list shows only habits scheduled for the current day, sorted by time | M |
| R-05 | Complete a habit (full) in one tap | M |
| R-06 | Complete the easy version in one additional tap/action | M |
| R-07 | Undo a completion within the same day | S |
| R-08 | View a calendar/history of past completions | M |

### Streaks & recovery
| ID | Requirement | Pri |
|---|---|---|
| R-10 | Track a consecutive-day streak per habit | M |
| R-11 | One missed day freezes the streak instead of resetting it | M |
| R-12 | A frozen streak generates a 24-hour Recovery Quest (easy version) | M |
| R-13 | Completing the Recovery Quest restores the streak count | M |
| R-14 | Missing the recovery window resets the streak to 0 | M |
| R-15 | Recovery/reminder copy is neutral, never guilt-based | M |

### Stats & progression
| ID | Requirement | Pri |
|---|---|---|
| R-20 | Maintain 5 stats: STR, INT, DEX, WIS, CHA | M |
| R-21 | Award XP on completion (full = 100%, easy = ~20%) | M |
| R-22 | Calculate stat level from XP | M |
| R-23 | Calculate an overall Rank (E–S) from average stat level | M |
| R-24 | Animate XP gain and stat bar movement on completion | M |
| R-25 | Radar chart of all 5 stats | S |
| R-26 | Real-time dashboard reflecting current stats | M |

### Weekly Quest & Long Quests
| ID | Requirement | Pri |
|---|---|---|
| R-30 | Auto-generate a Weekly Quest targeting the lowest-performing stat | C |
| R-31 | Show weekly progress toward that quest | C |
| R-32 | Create a Long Quest with a name and ordered stages | C |
| R-33 | Track Long Quest progress as stages completed / total | C |

### Notifications
| ID | Requirement | Pri |
|---|---|---|
| R-40 | Local notification at each habit's scheduled time | M |
| R-41 | Notify when a Recovery Quest is generated | M |
| R-42 | Global and per-habit notification toggle | S |

### Auth & sync
| ID | Requirement | Pri |
|---|---|---|
| R-50 | Sign up / log in with email + password | M |
| R-51 | Optional Google sign-in | S |
| R-52 | Password reset flow | M |
| R-53 | User data syncs to Supabase and is scoped to that user only (RLS) | M |
| R-54 | App remains usable offline; syncs when back online | S |

### AI
| ID | Requirement | Pri |
|---|---|---|
| R-60 | Generate a weekly summary paragraph from the past 7 days of data | C |
| R-61 | Suggest 3 easy-version options during habit creation | C |
| R-62 | Break a Long Quest name into 3–6 suggested stages | C |
| R-63 | AI calls run through a backend proxy — no API key ever ships in the app | M *(once any AI feature is built)* |
| R-64 | Every AI output is a suggestion the user can edit or ignore, never auto-saved | M *(once any AI feature is built)* |

### Non-functional
| ID | Requirement | Pri |
|---|---|---|
| R-70 | Core loop (open app → complete habit → see reward) takes under 30 seconds | M |
| R-71 | No data loss on crash/force-close | M |
| R-72 | TypeScript strict mode, no `any` in app code | S |
| R-73 | Business logic (XP, streaks, recovery) as pure, unit-tested functions | S |
| R-74 | Works on Android 8+; iOS best-effort if a test device is available | M |

---

## 5. Data Model

**Entities:**

- **user** — from Supabase auth (id, email)
- **profile** — display name, class, target role, theme; belongs to a user
- **stat** — the 5 fixed stats, each with current XP and level; belongs to a user
- **habit** — name, easy version, schedule, time, stat, archived flag; belongs to a user
- **habit_completion** — one record per completion (date, full or easy, XP awarded); belongs to a habit
- **streak** — current count, best count, state (active/frozen/broken); one per habit
- **long_quest** — name, target stat, deadline; belongs to a user
- **long_quest_stage** — ordered stages within a long quest
- **weekly_quest** — week, target stat, target count, current count

**Key relationships:** a user has one profile, five stats, many habits. Each habit has one streak and many completions. A long quest has many stages. All tables scoped to `user_id` with Supabase RLS so users only ever see their own rows.

---

## 6. Screens

**House screens** (minimize where reasonable):
1. **Board** — today's habits, the core loop lives here
2. **Quest Editor** — create/edit a habit
3. **Status** — stats, radar, weekly summary (tabs or sections within one screen)
4. **Long Quests** — list + detail (detail as a bottom sheet, not a new screen)
5. **Settings** — theme, notifications, account, sign out

**5 house screens.**

**Gate screens** (exempt from minimization — one-time/rare flows):
- Login
- Sign up
- Forgot password
- Onboarding (first-launch habit setup)

### Core Loop flow

```
notification fires
      │
      ▼
   open app
      │
      ▼
    BOARD ── tap habit ──> XP animates, bar fills ──> streak ticks up
      │                          │
      │                          └─ if leveled up: brief level-up moment
      │
      └─ frozen streak? recovery banner shown, one tap to resolve
```

---

## 7. Risks

| Risk | Response |
|---|---|
| Reward animation ends up feeling flat | Build and feel-test it early, before investing in the rest |
| Auth/sync eats more time than the local-only version would have | Accepted tradeoff — needed for real testers; keep it to Core wave, don't gold-plate |
| Scope creep (this has already happened once) | Anything not in §3 gets written down separately, not built until Core wave ships |
| Thesis/coursework competes for time | Core wave is the actual milestone that matters; Full wave can slip without the project failing |
| AI adds complexity before the core app is proven | AI features are Could-priority, Full wave only — app must work completely without them |

---

*End of document.*
