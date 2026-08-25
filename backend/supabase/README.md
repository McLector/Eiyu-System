# Supabase migrations

Run **every** `.sql` file in this folder, in filename order — that is what the
`NNN_` prefixes are for. All of them are required: the app as it ships touches
each one, so skipping any leaves a feature broken at runtime.

Paste each file into the **SQL Editor** on your Supabase dashboard and run it,
lowest number first.

> `supabase db push` does *not* pick these up. The CLI reads migrations from
> `supabase/migrations/` at the repo root, which this project doesn't use — its
> schema lives here instead, applied by hand.

## Checking what is already applied

Re-running a file is the wrong way to find out whether it ran: `create or
replace` files (012, 013) always succeed and tell you nothing, and a file with
plain DDL aborts on its first statement without reporting on the rest.

Run this in the SQL Editor instead - every column should read `true`:

```sql
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'habits'
      and column_name = 'quest_type') = 1                        as "011 quest_type column",
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'habits'
      and column_name = 'description') = 1                       as "011 description column",
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'habits'
      and column_name = 'easy_version') = 'YES'                  as "011 easy_version nullable",
  (select count(*) from pg_constraint
    where conname = 'habits_easy_version_present') = 1           as "011 easy-version constraint",
  (select count(*) from pg_indexes
    where schemaname = 'public'
      and indexname = 'habits_one_time_created_idx') = 1         as "011 one-time index",
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'complete_habit') = 1
                                                                 as "012 complete_habit()",
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'undo_habit_completion') = 1
                                                                 as "013 undo_habit_completion()",
  (select pg_get_functiondef(p.oid) ilike '%returning xp_awarded into%'
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'undo_habit_completion')
                                                                 as "013 has the race fix";
```

That last column is the one worth reading closely. `undo_habit_completion`
existing only proves *some* version of 013 ran; it checks for the
`delete ... returning` form specifically, which is what stops two overlapping
undo calls from both reading `xp_awarded` before either delete commits and
double-decrementing the stat. If it reads `false`, re-run `013`.

If re-running 012 or 013 fails with *"cannot change name of input parameter"*,
an older version defined different parameter names - `create or replace` cannot
rename them. Drop it first, then re-run the file:

```sql
drop function if exists public.undo_habit_completion(uuid, date);
```

After running these, enable email/password auth in **Authentication → Providers** on your Supabase project (enabled by default on new projects). No other dashboard configuration is required — RLS policies are created by these migrations.

## Edge Functions

`functions/ai-proxy` is the only place the Gemini API key is read (R-63) — the
client never sees it, and every response it returns is a suggestion the user can
edit or ignore, never auto-saved (R-64). Uses Google Gemini (`gemini-3.6-flash`),
which has a free tier — no billing setup required.

Get a free key at https://aistudio.google.com/apikey, then deploy and configure
the function once:

```
supabase functions deploy ai-proxy
supabase secrets set GEMINI_API_KEY=...
```

Run both commands yourself — never paste the API key into chat or a `.env` file.
`supabase secrets set` stores it as an encrypted project secret that only the
deployed function can read at runtime.
