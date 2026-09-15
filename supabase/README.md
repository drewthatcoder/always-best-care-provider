# Stripe Connect onboarding (TEST mode only)

This folder versions Always Best Care **provider** Connect onboarding. It does **not** charge clients, create transfers, or change the franchise registration flow in `src/pages/Register.tsx` (`create-customer` / `create-payment-intent` / `create-subscription`).

Hosted project: `uwgfitnpesgdkiwtekcb`.

**Do not deploy live Stripe keys. Do not publish production charges.**

## What this adds

| Path | Role |
| --- | --- |
| `functions/create-connected-account` | Auth'd provider → Stripe Express account (Standard fallback) → upsert `provider_profiles.stripe_account_id` by `user_id`. Idempotent if already set. |
| `functions/create-account-link` | Stripe AccountLink. Return/refresh URLs go to `/settings`. |
| `functions/stripe-connect-webhook` | Verifies `STRIPE_WEBHOOK_SECRET`. On `account.updated`, writes Connect flags. |
| `migrations/20260915214100_provider_connect_status.sql` | **Optional, not auto-applied.** Adds nullable status columns. Does **not** re-add `stripe_account_id` (already live). |

Existing hosted functions (`create-customer`, `create-payment-intent`, `create-subscription`, `create-setup-intent`, `charge-client`) stay as they are. Connect transfers must **not** be added to `create-payment-intent`.

## 1. Optional SQL (status columns)

`provider_profiles.stripe_account_id` already exists on the live table. Only run the status-column migration if you want webhook writes:

1. Open [Supabase SQL Editor](https://supabase.com/dashboard/project/uwgfitnpesgdkiwtekcb/sql).
2. Paste and run `migrations/20260915214100_provider_connect_status.sql`.

Columns added (all nullable): `charges_enabled`, `payouts_enabled`, `details_submitted`, `onboarding_complete`.

The Settings UI still works if these columns are missing: it falls back to the live columns and shows **Incomplete** until a webhook can persist flags.

## 2. Secrets (TEST keys only)

In [Edge Function secrets](https://supabase.com/dashboard/project/uwgfitnpesgdkiwtekcb/settings/functions):

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_... --project-ref uwgfitnpesgdkiwtekcb
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... --project-ref uwgfitnpesgdkiwtekcb
# Optional. Frontend also sends window.location.origin.
supabase secrets set PROVIDER_APP_URL=https://your-provider-app.example --project-ref uwgfitnpesgdkiwtekcb
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform.

The functions **refuse** `sk_live_` keys and live-mode webhook events.

## 3. Deploy functions

From the repo root (requires the [Supabase CLI](https://supabase.com/docs/guides/cli)):

```bash
supabase functions deploy create-connected-account --project-ref uwgfitnpesgdkiwtekcb
supabase functions deploy create-account-link --project-ref uwgfitnpesgdkiwtekcb
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

Signed-in providers use **Settings → Connect Stripe → Set up payouts**.

1. Frontend calls `supabase.functions.invoke('create-connected-account')`.
2. Then `create-account-link` with `origin` / `/settings?connect=return|refresh`.
3. Browser redirects to Stripe-hosted onboarding, then back to Settings.
4. Status badge: **Connected** / **Incomplete** / **Restricted** (from status columns when present).

## Out of scope (later PRs)

Charge + transfer is **not** implemented here. See [`docs/stripe-provider-billing-design.md`](../docs/stripe-provider-billing-design.md) (design only; no impl).

- Charge + transfer on client shift approve (product confirmed: billing is **not** limited to shift approve)
- Client PaymentMethod / SetupIntent wiring
- Franchise price changes in `Register.tsx`
- Live mode / production publish
