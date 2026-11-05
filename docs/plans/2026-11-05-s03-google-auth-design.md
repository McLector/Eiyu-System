# S03 design: Google sign-in on web and mobile (2026-11-05)

Status: design for review, written before implementation. Roadmap row S03 and lines 65-75 give the scope. Handoff 028 records the S02 state this builds on. Nothing here has been run; every mechanism below is marked "to prove" until a test on the local stack shows it.

## Owner decisions (fixed inputs)

1. Google links to the existing account with the same email only when Google reports the email verified AND that account holds the S02 mailbox proof. Either login then works.
2. Same email, existing account without mailbox proof: no link and no new account. The user is told to sign in with the password, verify the email, then use Google.
3. A Google `email_verified` claim, checked on the server and bound to the current email, counts as mailbox proof for debriefs. An email change drops it, like the existing proof.
4. Mobile uses the browser flow: `signInWithOAuth` with PKCE through `expo-web-browser` and each variant's scheme. No new native module, so OTA is possible.
5. Real Google login is tested on the local stack first. One hosted smoke check only with the owner's yes. iOS and Sign in with Apple are out of scope (Google Play, Philippines first). Fable is never used.

## Why Supabase's default is not enough

Read from supabase/auth v2.196.0, the version the local stack runs (`internal/models/linking.go`, `internal/api/external.go`):

- `DetermineAccountLinking` links a new Google identity to the one existing user with a matching email whenever Google's email is `Verified`, **or `Mailer.Autoconfirm` is on**. Local `enable_confirmations = false` means autoconfirm is on, so locally even an unverified Google email counts as verified.
- It never reads the existing user's `email_confirmed_at`. A password account created with confirmations off is "confirmed" without anyone proving the mailbox, so it would be linked. That is the pre-account takeover the decision-1 rule forbids: someone registers a victim's address with a password, the victim later signs in with Google, and both parties now hold the merged account.
- No config switch turns automatic linking off. The only related setting is `GOTRUE_EXPERIMENTAL_PROVIDER_LINKING_DOMAINS`, which is marked experimental and would also isolate Google from legitimate linking, so it is not used.
- If no link happens and no user matches, a new account is created. A refusal therefore has to be an explicit rejection, not a side effect.
- `before_user_created` runs at the top of the OAuth callback for every login that is not manual linking or an invite. That includes a would-be link to an existing user and a returning Google user. An error from it aborts the callback before any linking or token issue. (The hook body itself, `triggerBeforeUserCreatedExternal`, was not read; whether it skips existing users is **to prove**.)
- **Superseded by the T1 findings below:** the hook is skipped for a link to an existing user, so it cannot gate linking.

## Mechanism

### A. Gate: a `before_user_created` hook (Postgres function)

> **Disproved in T1 (see Findings below):** this hook never runs for a link to an existing account, so it cannot carry the linking rule. The text is kept as written for the record.

A pg-functions hook, `pg-functions://postgres/public/s03_before_user_created`, enabled in `supabase/config.toml` (and later on hosted with the owner's yes). Logic, for a payload whose provider is `google`:

1. Read the Google `email` and `email_verified` from the payload's provider data, not from anything the client sent.
2. If `email_verified` is not true: reject (no link, no create).
3. If a user already exists with that email (case-insensitive, trimmed) and `private.mailbox_verified(that user)` is false: reject with the message "Sign in with your password and verify your email first, then use Google."
4. Otherwise allow. Brand-new Google users have no existing user, so they pass step 3.

Non-Google providers and email/password signups pass through unchanged. The function reads `auth.users` and `private.mailbox_state` only; it writes nothing.

**To prove first (red tests):** the hook fires for the link case on v2.196.0; the payload exposes the provider and `email_verified`; a rejection surfaces to the client as a callback error the app can recognise. If the hook does not fire for existing users, fall back to **B2** below.

### B. Fallbacks, in order

- **B1, post-check:** if the hook cannot see the claim but fires, read `auth.identities.identity_data` in the hook after a lookup. Same rule.
- **B2, manual linking only:** disable Google sign-up as a way in for existing emails by routing the link through a signed-in session (`linkIdentity`, needs manual linking enabled). Worse UX, no hook dependency. Choose only if A fails.

### C. Proof: a trigger on `auth.identities`

New migration (next free number after 062; read the directory, do not assume). A `security definer` trigger on insert or update of `auth.identities`: when `provider = 'google'`, `identity_data->>'email_verified'` is true, and `lower(trim(identity_data->>'email'))` equals `lower(trim(auth.users.email))` for that user, set in `private.mailbox_state`: `verified_version = version`, `verified_at = now()`. This is entirely server-side. No client input, no new RPC, and it reuses the table 048 defines. GoTrue rewrites `identity_data` on each login, so a returning Google user keeps the proof fresh. An email change already bumps `version` and clears the proof (`private.track_mailbox_version`), so decision 3's "dropped on change" holds without extra code.

Edge to test: the user's email changes after Google was linked. The identity email no longer matches `auth.users.email`, so the trigger must not re-grant the proof.

### D. Linked accounts

A proved password account that links Google gets one user, one profile, unchanged quests and history, password still working (GoTrue adds an identity; it does not touch the password for a confirmed user). The Google proof then also covers that account. No unlinking UI in S03.

## Client design

### Web

- A "Continue with Google" button on sign-in and sign-up calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: <origin>/auth/callback, scopes: 'openid email profile' } })`. Use the least scopes needed; check the current Supabase Google doc before fixing the list (queryParams `prompt=select_account` is a candidate so a shared browser does not silently reuse an account).
- A callback route exchanges the PKCE code and then loads the session. It must handle: `error` and `error_description` parameters, a missing or replayed code, and the hook rejection (map it to the S03 message above, not the raw text).
- Cancel (user closes Google's consent) lands on sign-in with a neutral "Google sign-in was cancelled" line and no retry loop.

### Mobile

- `signInWithOAuth` with `skipBrowserRedirect: true`, open the returned URL with `WebBrowser.openAuthSessionAsync(url, redirectTo)`, then exchange the code from the returned URL. Check the SDK 54 pages for `expo-web-browser` and AuthSession before coding (`AGENTS.md` requires it).
- `redirectTo` is built with `Linking.createURL('auth/callback')`, so it follows the variant scheme (`eiyusystem`, `-dev`, preview). Each scheme's URL goes on the Supabase redirect allowlist; add them to local `additional_redirect_urls` only (hosted needs the owner's yes).
- The existing `+native-intent` already routes recovery links and holds fragments in memory. Add the callback path there rather than a second mechanism, and never persist the code or tokens.
- `openAuthSessionAsync` results `cancel` and `dismiss` map to the same neutral cancel state as web. A stale `Linking` URL arriving later must be ignored when no flow is pending.

### Messages

One shared mapping in `packages/shared` from callback errors to user text: cancelled, rejected-unproved ("sign in with your password and verify first"), unverified Google email ("Google says this email is not verified"), and a generic failure. Both clients use it; tests live next to it.

## Privacy and terms deltas

Google becomes a recipient of sign-in data (the identity request goes browser to Google, and Google sees that the user signs in to Eiyu). Update the data-flow inventory and the Privacy Policy text in `packages/shared/src/logic/legal-content.ts`: which claims Eiyu stores (email, name, avatar URL, Google subject ID), purpose, and that Google's own terms apply. S14 does the final audit; S03 only adds the Google entry and keeps the legal-content test that allows only the operator contact address.

## Configuration (names only, no values)

- Local `supabase/config.toml`: `[auth.external.google]` with `enabled = true`, `client_id = "env(...)"`, `secret = "env(...)"`; the hook block; Google redirect URIs for the local stack. Secrets live in an ignored env file.
- The disposable stack is on 54321/54322 per the config's own caveat; the personal stack is 55321/55322. The implementation session names which one it uses.
- Hosted: Google provider settings, the redirect allowlist and the hook need the owner's yes. The hosted `enable_confirmations` setting must be read before any claim about hosted behaviour (it decides whether autoconfirm counts unverified provider emails there). Record the value in the handoff, not the project ID.

## Test strategy (tests first)

Negative cases come first:

1. Unproved password account plus verified Google with the same email: rejected, still exactly one user, no new row in `auth.users` or `auth.identities`.
2. Google `email_verified = false` (with autoconfirm on, as locally): rejected.
3. Proved password account plus verified Google: one user, same id, quests and profile intact, password still signs in, two identities.
4. New Google-only user: created, proof granted by the trigger, debrief gate (`current_mailbox_verified()`) true.
5. Email change after linking: proof cleared, not re-granted by the old identity.
6. Case and whitespace differences in the email match.
7. Hook ignores non-Google providers and email/password signups.
8. Client: cancel, dismiss, error parameter, replayed or missing code, stale URL with no pending flow, rejection-to-message mapping.

Levels: SQL tests in `backend/supabase/tests` style (read the runner and the 048 test for conventions); a real GoTrue integration test against the local stack for the hook and linking behaviour, because mocks cannot show what the hook receives; shared, web and mobile unit tests; then real Google login on web, the emulator and the Oppo.

## Out of scope / risks

- Unlinking, Apple login, hosted rollout, store listing changes.
- Autoconfirm hides the "unverified Google email" case locally. The hook, not GoTrue, must carry that rule, which is why test 2 matters.
- Google test-user limits while the consent screen is in Testing mode; a real user outside the list will see Google's block page. Note it for release.
- If A fails on v2.196.0 the spec changes to B2 and the UX loses the single-tap link. Decide then, with the evidence.

## Findings (T1, 2026-11-06)

Spike run against the disposable local stack (GoTrue v2.196.0) with real Google logins from a test user on a consent screen in Testing mode. Scratch objects only (a logging hook function and a logging trigger on `auth.identities`); all dropped afterwards, counts back to baseline. The script is `scripts/s03-google-linking-local.test.mjs`. Nothing hosted was touched.

### Source facts (read from the v2.196.0 tag)

- `triggerBeforeUserCreatedExternal` returns early unless the account decision is `CreateAccount`. The hook is skipped for `LinkAccount`, `AccountExists` and `MultipleAccounts`.
- Linking happens when the provider email is verified, or `Mailer.Autoconfirm` is on. No setting turns automatic linking off.
- Google's issuer is hardcoded outside test code, so a fake Google is not an option; real logins are needed.
- A hook rejects by returning `{"error":{"http_code":403,"message":"..."}}`; the client then sees `error=access_denied` with the message. `RAISE` gives a 500 and loses the text. An empty message counts as success.
- In the hook payload `user.id` is a throwaway id, and `email_verified` is under `user.user_metadata`. An unverified Google email that matches an existing user still takes the create path, with the email blanked, so an "unverified email" rule is still needed.

### R1: new Google user (hook fires, S02 refuses the account)

- The hook fired once. Payload: `user.app_metadata.provider = "google"`, `user.user_metadata.email_verified = true`, `user.user_metadata.sub`, `user.email`, `user.identities = []`, `metadata.name = "before-user-created"`.
- The account was not created. `private.capture_initial_processing_consent` (`backend/supabase/050_processing_access.sql`, EP003) needs `raw_user_meta_data.birth_date` and `processing_consent.age_screening` granted for the current notice version. A Google-created user has neither. The browser received `error=server_error&error_code=unexpected_failure&error_description=Database error saving new user`.
- **A Google-only sign-up cannot work today.** The birth date and consent have to be collected before or after the Google step. The design does not cover this yet; it is an owner decision.

### R2: existing password account, then Google with the same verified email

- The hook made **0 calls** for the login. Creating the password user through the admin API also made 0 hook calls.
- The identities trigger fired once: `INSERT`, provider `google`, `email_verified = true`, attached to the **existing** user. Still one user; the browser received a session.
- The login linked with no further check. The script did not read `private.mailbox_state`, so this run shows the link happens, not what the S02 proof state was. It is the path the owner's decision 2 must block.
- The first run passed all assertions. A rerun stopped at a faulty script guard before its checks; the stored state matched (no hook rows, one Google `INSERT` with `verified = true`, one user with `email` and `google` identities).

### R2b: returning login for the linked account

- 0 hook calls and no identity `INSERT`.
- One identity `UPDATE` with `email_verified = true`. A returning login rewrites the identity row, so a trigger-based proof (mechanism C) would run on every Google login and keep the proof fresh.
- Deleting the user removed its profile and both identities (counts back to the pre-test values).
- An earlier attempt reported a stale landing page and proved nothing; the script now requires a `/callback` in the auth log.

### R3: the identities trigger raises

- No link was made: no Google identity kept, still one user.
- The browser received `error=server_error&error_code=unexpected_failure&error_description=Error+creating+identity`. The auth log showed the trigger's exception as the cause. The refusal text is lost, so the client cannot tell this from any other failure.
- The trigger's own log insert is rolled back with the transaction, so the evidence comes from the auth log, not from a log table.

### Consequences for the design

- **Mechanism A cannot gate linking.** It stays useful for rejecting an unverified Google email on the create path only. This supersedes the "Why" bullet on the hook and section A above.
- **A `BEFORE INSERT` trigger on `auth.identities` can stop a link** (R3), and sees the existing `user_id`. It was not tested here against `private.mailbox_state`. Its error is a generic 500 to the client.
- **Open: hosted.** Whether the hosted project allows triggers on `auth.identities` is unverified. Mechanism C and any trigger-based gate depend on it. A read-only check needs the owner's yes.
- **Open for re-plan:** the linking gate, and how Google sign-up collects birth date and consent given EP003.
- B2 (manual linking) does not close the takeover by itself, because GoTrue still links on a verified email.

## Re-plan (2026-11-06)

Settles the two open questions from T1. Sections A and B above and the "Why" bullet about the hook are superseded by this section. Nothing hosted was changed.

### Decisions

1. **Linking gate: a `BEFORE INSERT` trigger on `auth.identities`** (owner's choice). It is scoped to `provider = 'google'` and refuses only when the user already has a non-Google identity and `private.mailbox_verified(user)` is false. A brand-new Google user has no other identity, so it is not refused; a plain proof check would block every Google sign-up, so this is a red test. A proved account passes. An `UPDATE` (a returning login) is never blocked.
2. **Proof grant (mechanism C) is `AFTER INSERT OR UPDATE`**, so by timing it can never grant proof before the gate looks. Do not rely on trigger name order.
3. **The hook stays, narrowed:** `s03_before_user_created` rejects an unverified Google email on the create path with a readable 403 message. It plays no part in linking.
4. **EP003: finish sign-up right after Google** (owner delegated the choice). A Google-created account may start with no age consent; the app then shows a required "finish sign-up" screen (birthday notice, consent, birth date) before anything else.
   - `signInWithOAuth` cannot carry metadata (only `redirectTo`, `scopes`, `queryParams`, `skipBrowserRedirect`; `auth-js` `types.d.ts:601-616`), so birthday and consent cannot ride along on the Google step. On web the redirect reloads the page, so asking first would mean keeping a birth date in browser storage across it.
   - "Existing accounts only" would drop the new Google-only user case. "Anonymous account first" needs hosted anonymous sign-ins, manual linking, CAPTCHA and its own spike.
   - Policy trade-off, stated in the privacy text: for Google sign-ups only, S02's "consent before account" becomes "consent before any birthday processing". Until the user finishes, the account holds email, name, avatar URL and Google ID.
5. **EP003 exception keys on `raw_app_meta_data->>'provider' = 'google'`**, which only GoTrue sets. `raw_user_meta_data` is client-controlled and is never used for the exception. Every other path, including a password sign-up that claims Google in user metadata, still raises EP003.
6. **One client message for the lost trigger text** (R3 loses the refusal text, and `Error creating identity` can have other causes): "Google couldn't connect to this email. If you already have an Eiyu account, sign in with your password and verify your email first, then use Google." Hook 403 texts map to their own messages.
7. **Finish screen scope:** `needsGoogleSignupFinish(user, processing status)` is true only for Google-created accounts without age consent, so legacy password accounts are not pushed into it. Both apps already treat `birthDate: null` as an unknown audience with age-gated features off (`web/src/store/__tests__/account-audience.test.tsx:50`, `mobile/contexts/__tests__/account-audience.test.tsx:49`), and the consent and birthday RPCs from 050 already exist after sign-up.

### Hosted read-only checks (2026-11-06, SELECT only, project ID omitted)

| Check | Result |
|---|---|
| Owner of `auth.identities` | `supabase_auth_admin` |
| `has_table_privilege('postgres', 'auth.identities', 'TRIGGER')` | `true` (also `true` for `auth.users`) |
| Non-internal triggers on `auth.users` and `auth.identities` | one: `on_auth_user_created`, AFTER, enabled, on `auth.users` |
| `private.capture_initial_processing_consent` (migration 050) | **not present** |
| `private.mailbox_verified` (migration 048) | **not present** |

- The privilege check is a signal, not proof. Creating a trigger on `auth.identities` hosted is a hosted change and needs its own yes; the first real attempt may still be refused because the table belongs to `supabase_auth_admin`.
- **Hosted does not have S02's mailbox proof or EP003 yet** (048 and 050 are missing there), consistent with "engineering done, release pending". The S03 migration depends on 048, and the EP003 change depends on 050, so S03 cannot reach hosted before S02's SQL does. This does not block local work.
- The hosted `enable_confirmations` ("Confirm email") value cannot be read from SQL. The owner reads it in the dashboard; it must be recorded before any claim about hosted behaviour.

### Risks and open items

- If hosted turns out to refuse a trigger on `auth.identities`, Google must not be enabled there: GoTrue would auto-link unproved accounts. Stop and re-plan; local work can continue.
- Abandoned Google accounts hold a profile and no consent. Check whether in-app account deletion can be offered on the finish screen; otherwise sign-out is available and the privacy text covers it.
- The unverified-Google-email path cannot be produced with a real Google account, so it is covered at SQL level only; the handoff must say so.
- Before the web and mobile client tasks, read the Expo SDK 54 pages for `expo-web-browser` and AuthSession (`AGENTS.md`).
