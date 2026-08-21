# Changelog

All notable changes to the **Eiyu System** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - Core Wave

### Added
- **Initial App Structure**: Setup Expo and file-based routing.
- **UI Architecture**: Added base components for the Solo Leveling / glass UI aesthetic (`ghost-button`, `glass-view`, `radar-chart`, `divider`).
- **Core Screens**: 
  - `Board` (Daily habit view)
  - `Status` (Stats and radar chart view)
  - `Long Quests` (Multi-stage goal tracking)
  - `Settings` 
  - `Quest Editor` (Habit creation)
  - `Auth` (Sign in / Sign up)
- **State Management**: Added `eiyu-store` for context management.
- **Documentation**: Finalized `eiyu-system-requirements-v3.md` and updated the `README.md`.
- **Git Config**: Added robust `.gitignore` rules for environment variables, AI configs, and IDE settings.
