# Supabase migrations

Run these in order, once, against your Supabase project — either paste each file into the Supabase Dashboard SQL Editor, or with the Supabase CLI:

```
supabase db push
```

(the CLI reads `*.sql` files in this folder in filename order, hence the `NNN_` prefixes).

Files 001-005 and 008 are required for the app to function (Core wave). Files 006-007 create schema for Long Quests and Weekly Quest ahead of time (Full wave, Phases 9-10) — safe to run now, nothing references them yet.

After running these, enable email/password auth in **Authentication → Providers** on your Supabase project (enabled by default on new projects). No other dashboard configuration is required — RLS policies are created by these migrations.

## Edge Functions (Full wave, Phase 3+)

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
