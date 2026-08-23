# Supabase migrations

Run **every** `.sql` file in this folder, in filename order — that is what the
`NNN_` prefixes are for. All of them are required: the app as it ships touches
each one, so skipping any leaves a feature broken at runtime.

Paste each file into the **SQL Editor** on your Supabase dashboard and run it,
lowest number first.

> `supabase db push` does *not* pick these up. The CLI reads migrations from
> `supabase/migrations/` at the repo root, which this project doesn't use — its
> schema lives here instead, applied by hand.

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
