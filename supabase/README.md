# Stripe Connect onboarding (TEST mode only)

This folder versions Always Best Care **provider** Connect onboarding. It does **not** charge clients, create transfers, or change the franchise registration flow in `src/pages/Register.tsx` (`create-customer` / `create-payment-intent` / `create-subscription`). Hosted `charge-client` is unchanged.

Hosted project: `uwgfitnpesgdkiwtekcb`.
App URL: `https://easycare.live`.

**Do not deploy live Stripe keys. Do not publish production charges.**

## What this adds

| Path | Role |
| --- | --- |
| `functions/create-connected-account` | Auth'd provider → Stripe Express account (Standard fallback) → upsert `provider_profiles.stripe_account_id` by `user_id`. Idempotent if already set. Also persists Connect flags when the Stripe Account is retrieved. |
| `functions/create-account-link` | Stripe AccountLink. Settings always sends `origin` + absolute `/settings?connect=return\|refresh` URLs. Falls back to `PROVIDER_APP_URL` / `SITE_URL` / `APP_URL` / `https://easycare.live`. Already-complete accounts persist flags and return `alreadyComplete` (plus an update/login link when Stripe allows). |
| `functions/sync-connect-status` | Auth'd provider → `accounts.retrieve` → write the four flags. Settings calls this on load so the badge recovers when `account.updated` was missed. |
| `functions/stripe-connect-webhook` | Verifies `STRIPE_WEBHOOK_SECRET`. On `account.updated`, writes Connect flags. |
| `migrations/20260915214100_provider_connect_status.sql` | Adds nullable status columns. Does **not** re-add `stripe_account_id` (already live). Required for persist; Settings can still show Connected from the sync response before the columns exist. |

Existing hosted functions (`create-customer`, `create-payment-intent`, `create-subscription`, `create-setup-intent`, `charge-client`) stay as they are. Connect transfers must **not** be added to `create-payment-intent`.

## 1. SQL (status columns)

`provider_profiles.stripe_account_id` already exists on the live table. Run the status-column migration so webhook/sync can persist:

1. Open [Supabase SQL Editor](https://supabase.com/dashboard/project/uwgfitnpesgdkiwtekcb/sql).
2. Paste and run `migrations/20260915214100_provider_connect_status.sql`.

Columns added (all nullable): `charges_enabled`, `payouts_enabled`, `details_submitted`, `onboarding_complete`.

If the columns are missing, Settings still calls `sync-connect-status` and can show **Connected** from the Stripe retrieve. The next cold load from Postgres stays **Incomplete** until this SQL is applied.

## 2. Secrets (TEST keys only)

In [Edge Function secrets](https://supabase.com/dashboard/project/uwgfitnpesgdkiwtekcb/settings/functions):

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_... --project-ref uwgfitnpesgdkiwtekcb
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... --project-ref uwgfitnpesgdkiwtekcb
# Optional. Frontend always sends window.location.origin; functions also default to https://easycare.live.
supabase secrets set PROVIDER_APP_URL=https://easycare.live --project-ref uwgfitnpesgdkiwtekcb
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.

The functions **refuse** `sk_live_` keys and live-mode webhook events.

## 3. Deploy functions

From the repo root (requires the [Supabase CLI](https://supabase.com/docs/guides/cli)):

```bash
supabase functions deploy create-connected-account --project-ref uwgfitnpesgdkiwtekcb
supabase functions deploy create-account-link --project-ref uwgfitnpesgdkiwtekcb
supabase functions deploy sync-connect-status --project-ref uwgfitnpesgdkiwtekcb
supabase functions deploy stripe-connect-webhook --project-ref uwgfitnpesgdkiwtekcb --no-verify-jwt
```

`stripe-connect-webhook` must stay `verify_jwt = false` (see `config.toml`). Stripe signs the body; there is no user JWT.

## 4. Stripe TEST webhook

In the Stripe Dashboard (**Test mode**):

1. Developers → Webhooks → Add endpoint.
2. URL: `https://uwgfitnpesgdkiwtekcb.supabase.co/functions/v1/stripe-connect-webhook`
3. Listen to `account.updated`.
4. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

## 5. Provider UI

Signed-in providers use **Settings → Connect Stripe**.

1. Settings load reads `provider_profiles`. If `stripe_account_id` is set, it calls `sync-connect-status` (Stripe retrieve → four flags). Badge becomes **Connected** when `charges_enabled` and `payouts_enabled` are true — including `acct_1UG6SoCcLzuHhpCP`.
2. **Set up payouts** / **Continue Stripe setup** calls `create-connected-account`, then `create-account-link` with `origin: window.location.origin` and absolute return/refresh URLs.
3. Browser redirects to Stripe-hosted onboarding, then back to `/settings?connect=return`, which syncs again.
4. If the Stripe account is already fully onboarded, Continue refreshes flags and shows **Connected** instead of toasting a bare non-2xx.
5. Connected accounts hide Continue and show **Update Stripe details**.

## Out of scope (later PRs)

- Charge + transfer on client shift approve
- Client PaymentMethod / SetupIntent wiring
- Franchise price changes in `Register.tsx`
- Live mode / production publish
