# Supabase migrations

Run these in order, once, against your Supabase project — either paste each file into the Supabase Dashboard SQL Editor, or with the Supabase CLI:

```
supabase db push
```

(the CLI reads `*.sql` files in this folder in filename order, hence the `NNN_` prefixes).

Files 001-005 and 008 are required for the app to function (Core wave). Files 006-007 create schema for Long Quests and Weekly Quest ahead of time (Full wave, Phases 9-10) — safe to run now, nothing references them yet.

After running these, enable email/password auth in **Authentication → Providers** on your Supabase project (enabled by default on new projects). No other dashboard configuration is required — RLS policies are created by these migrations.
