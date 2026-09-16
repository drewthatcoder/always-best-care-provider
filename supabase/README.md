# Stripe Connect onboarding (mode follows the Stripe secret)

This folder versions Always Best Care **provider** Connect onboarding. Mode is the platform secret (`sk_live_…` → live payouts, `sk_test_…` → TEST). Drew approved live Stripe Connect with real payouts on [easycare.live](https://easycare.live) (platform account: BioChem Couple LLC).

Hosted project: `uwgfitnpesgdkiwtekcb`.
App URL: `https://easycare.live`.

This does **not** change the franchise registration flow in `src/pages/Register.tsx` (`create-customer` / `create-payment-intent` / `create-subscription`). Hosted `charge-client` is not versioned here — keep its mobile contract (`customerId`, `amount`, `description`; optional destination). Connect transfers must **not** be added to `create-payment-intent`.

**Do not commit real secret values. Do not invent an `sk_live_` value in source.**

## What this adds

| Path | Role |
| --- | --- |
| `functions/create-connected-account` | Auth'd provider → Stripe Express account (Standard fallback) → upsert `provider_profiles.stripe_account_id` by `user_id`. Idempotent if already set. Returns Stripe’s `livemode`. |
| `functions/create-account-link` | Stripe AccountLink. Settings always sends `origin` + absolute `/settings?connect=return\|refresh` URLs. Falls back to `PROVIDER_APP_URL` / `SITE_URL` / `APP_URL` / `https://easycare.live`. Returns Stripe’s `livemode`. |
| `functions/sync-connect-status` | Auth'd provider → `accounts.retrieve` → write the four flags. Settings calls this on load (also when there is no account yet, so the LIVE/TEST badge can follow the platform key). |
| `functions/stripe-connect-webhook` | Verifies `STRIPE_WEBHOOK_SECRET`. Accepts `account.updated` when `event.livemode` matches the secret key (`sk_live_` ↔ live events). |
| `migrations/20260915214100_provider_connect_status.sql` | Adds nullable status columns. Does **not** re-add `stripe_account_id` (already live). |

## LIVE cutover checklist (easycare.live)

Deploy the new function code **before** switching secrets. Current hosted functions refuse `sk_live_` and reject live webhook events. Secrets apply immediately; old code will break if the live key is set first.

1. **Merge this PR** and ship the frontend so Settings shows **LIVE** (not TEST) when `livemode` is true. Connected / Incomplete / Restricted badge logic is unchanged.
2. **Deploy Connect functions** (still on the existing test secret is fine):

```bash
supabase functions deploy create-connected-account --project-ref uwgfitnpesgdkiwtekcb
supabase functions deploy create-account-link --project-ref uwgfitnpesgdkiwtekcb
supabase functions deploy sync-connect-status --project-ref uwgfitnpesgdkiwtekcb
supabase functions deploy stripe-connect-webhook --project-ref uwgfitnpesgdkiwtekcb --no-verify-jwt
```

`stripe-connect-webhook` must stay `verify_jwt = false` (see `config.toml`). Stripe signs the body; there is no user JWT.

3. **Set live secrets** in [Edge Function secrets](https://supabase.com/dashboard/project/uwgfitnpesgdkiwtekcb/settings/functions). Use the **live** secret from the BioChem Couple LLC Stripe account — paste the real values only in the dashboard / CLI, never in git:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_... --project-ref uwgfitnpesgdkiwtekcb
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... --project-ref uwgfitnpesgdkiwtekcb
# Optional. Frontend always sends window.location.origin; functions also default to https://easycare.live.
supabase secrets set PROVIDER_APP_URL=https://easycare.live --project-ref uwgfitnpesgdkiwtekcb
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.

4. **Create a LIVE webhook** in the Stripe Dashboard (**Live mode**, not Test):
   1. Developers → Webhooks → Add endpoint.
   2. URL: `https://uwgfitnpesgdkiwtekcb.supabase.co/functions/v1/stripe-connect-webhook`
   3. Listen to `account.updated`.
   4. Copy the **live** signing secret into `STRIPE_WEBHOOK_SECRET` (step 3).
5. **Redeploy** the four functions after secrets are set (same commands as step 2; webhook still `--no-verify-jwt`).
6. **TEST connected accounts do not transfer.** `acct_…` IDs created with `sk_test_` are not valid in live. Providers must **re-onboard in live**. `create-connected-account` already creates a new account when the stored id cannot be retrieved.
7. **charge-client (Drew / ops)** — keep destination routing intact:
   - Mobile contract stays `{ customerId, amount, description }` (`amount` = cents). Optional `connectedAccountId` / `providerUserId` / `bookingId` must keep resolving `transfer_data.destination` when present.
   - Hosted `charge-client` shares `STRIPE_SECRET_KEY`. After the live secret is set, provider-initiated charges are **live**.
   - If the hosted function still refuses `sk_live_` (TEST-only `getStripe()`), redeploy it with the shared helper from this PR so charges keep working. Do not change the mobile success/error shape.
   - Switch the hosted frontend `VITE_STRIPE_PUBLISHABLE_KEY` to the matching `pk_live_…` if Stripe.js collects cards. Do not commit that value.
8. Confirm return/refresh URLs remain `https://easycare.live/settings?connect=return` and `https://easycare.live/settings?connect=refresh`.

## SQL (status columns)

`provider_profiles.stripe_account_id` already exists on the live table. Run the status-column migration so webhook/sync can persist:

1. Open [Supabase SQL Editor](https://supabase.com/dashboard/project/uwgfitnpesgdkiwtekcb/sql).
2. Paste and run `migrations/20260915214100_provider_connect_status.sql`.

Columns added (all nullable): `charges_enabled`, `payouts_enabled`, `details_submitted`, `onboarding_complete`.

If the columns are missing, Settings still calls `sync-connect-status` and can show **Connected** from the Stripe retrieve. The next cold load from Postgres stays **Incomplete** until this SQL is applied.

## Provider UI

Signed-in providers use **Settings → Connect Stripe**.

1. Settings load reads `provider_profiles` and always calls `sync-connect-status`. The mode badge is **LIVE** when Stripe/platform `livemode` is true, **TEST mode** only for test keys.
2. Badge **Connected** / **Incomplete** / **Restricted** is unchanged: Connected when `charges_enabled` and `payouts_enabled` are true (or `onboarding_complete`).
3. **Set up payouts** / **Continue Stripe setup** calls `create-connected-account`, then `create-account-link` with `origin: window.location.origin` and absolute return/refresh URLs.
4. Browser redirects to Stripe-hosted onboarding, then back to `/settings?connect=return`, which syncs again.
5. Connected accounts hide Continue and show **Update Stripe details**.

## Out of scope

- Changing `charge-client`’s mobile body or destination lookup (ops keeps that intact)
- Client PaymentMethod / SetupIntent wiring
- Franchise price changes in `Register.tsx`
