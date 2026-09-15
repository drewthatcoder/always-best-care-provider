# Provider-initiated Connect charge (TEST, server-side)

**Status:** design + non-charging stub. No live-mode. **No mobile edits.**  
**Goal:** a provider charges a client’s **already-saved** card; funds go to the provider’s Stripe Connect account.  
**Decision needed:** Drew / Software Lead approve before enabling `paymentIntents.create`.

Mobile is already connected. Card-save source of truth is the local Expo app `mobile/testapp` (not in this repo; not modified). This repo owns Edge Functions + shared Supabase schema only.

---

## 1. Confirmed: where client Stripe IDs live

Probed hosted project `uwgfitnpesgdkiwtekcb` (column exists = REST `select` 200; missing = Postgres 42703). RLS hides row values from anon, so **row contents were not inspected**.

| Table | `stripe_customer_id` | `payment_method_id` | Who it is |
| --- | --- | --- | --- |
| **`public.client_profiles`** | **yes** | **yes** | Care client. Only table with **both** ids. Columns: `id`, `user_id`, `stripe_customer_id`, `payment_method_id`, `created_at`. |
| **`public.profiles`** | **yes** (live DB; **missing from generated `types.ts` until this PR**) | **no** | Shared user profile (client or provider). |
| `public.provider_profiles` | yes | no | **Franchise** subscriber + Connect: `stripe_account_id`, `subscription_status`, Connect flags. **Do not charge a client with this `cus_`.** |
| `public.provider_applications` | **no** | no | Register still inserts `stripe_customer_id` with `as any` — column does not exist. |
| `public.bookings` | no | no | No amount / PI columns. |

**Canonical read for a client charge**

1. `client_profiles` where `user_id = :clientUserId` → `stripe_customer_id` + `payment_method_id`.
2. If `stripe_customer_id` is null, fall back to `profiles.stripe_customer_id` for the same `user_id` (mobile/`testapp` may write here; this repo cannot see that app).
3. If `payment_method_id` is null, use the Stripe Customer’s default PaymentMethod (`invoice_settings.default_payment_method` or first attached card). Hosted `charge-client` already loads a Customer by `customerId`; that pattern only works if a default PM is attached on the Customer.

**Writers in web repos (this repo + `always-best-care-client`)**

| Writer | Writes client `cus_` / `pm_`? |
| --- | --- |
| Client/provider web `PaymentEditForm` | No. Placeholder toast; raw card field. |
| Provider `/signup` | No. `cardNumber` stays in React state; not sent to Stripe or DB. |
| `Register.tsx` | Writes a **franchise** Customer via hosted `create-customer`, then tries `provider_applications.stripe_customer_id` (column missing). Does **not** write `client_profiles`. |
| Hosted `create-setup-intent` | Returns `{ clientSecret }`. Not called by either web repo. Persist target unknown (no source in git). |
| Hosted `charge-client` | Reads **`customerId`** from the body (`GET /v1/customers/{id}`). Does not look up `client_profiles`. No Connect `transfer_data`. |
| Expo `mobile/testapp` | **Not in this environment.** Owner: this is how cards are saved. Assume it already writes `client_profiles` and/or `profiles.stripe_customer_id` (+ attaches PM on the Customer). |

**Do not invent new client-id columns** until a TEST charge fails lookup. Prefer reading the two tables above.

---

## 2. What exists vs what must not be reused

**Keep / already shipped**

- Connect onboarding: `create-connected-account`, `create-account-link`, `stripe-connect-webhook`.
- Settings → Payouts / Set up payouts.
- `provider_profiles.stripe_account_id` + status flags (`charges_enabled`, `payouts_enabled`, `details_submitted`, `onboarding_complete` — live).

**Leave franchise Register alone**

`create-customer` / `create-payment-intent` / `create-subscription` + `src/pages/Register.tsx` charge the **platform** ($299 + license sub). Never add `transfer_data` there.

**Hosted `charge-client` (today)**

- Exists, not versioned in git, callable with the anon key.
- Contract: `{ customerId }` (not `clientUserId`).
- Platform Customer retrieve only — **not** a destination charge.
- The stub in this PR versions a **replacement** with the same function name. **Do not deploy** until approved; deploy overwrites the hosted orphan.

**Out of scope (do not do)**

- Any mobile / Expo / Capacitor / `testapp` code.
- Client web Payment Element / `/signup` card-save.
- Charging on shift Approve.
- Live keys / live webhook events.

---

## 3. TEST architecture (server-side only)

**Charge type: destination charges.**

```
client_profiles (or profiles fallback)
  stripe_customer_id + payment_method_id
        │
        │  POST charge-client  { clientUserId, amountCents, bookingId? }
        │  Authorization: provider JWT
        ▼
Platform PaymentIntent (TEST)
  confirm: true
  off_session: true
  customer / payment_method from DB (+ Stripe default PM fallback)
  transfer_data.destination = provider_profiles.stripe_account_id
        │
        ▼
Provider Express connected account
```

| Model | Verdict |
| --- | --- |
| **Destination charges** | **Use.** One provider known at charge time. Client Customer stays on the platform (works with a card saved by mobile). Express onboarding already requests `card_payments` + `transfers`. Optional `application_fee_amount` later. |
| Separate charges and transfers | Only if Drew needs “charge now, pay provider later” or multi-franchise split. More balance/refund risk. Not TEST MVP. |
| Direct charges | Would clone PMs onto each connected account. Conflicts with one mobile-saved platform card. No. |

**Gates before `paymentIntents.create` (next PR, not the stub)**

- `STRIPE_SECRET_KEY` is `sk_test_…` (existing `getStripe()` already refuses `sk_live_`).
- Caller is an authenticated provider with `provider_profiles.stripe_account_id`.
- Connect billable: `onboarding_complete` or (`charges_enabled && payouts_enabled`). Express preferred; Standard fallback without `transfers` is non-billable.
- Client has a resolvable `cus_` and a `pm_` (column or Customer default).
- `amountCents` is a positive int; TEST cap (e.g. 50_000).
- If `bookingId` is sent, that booking’s `client_user_id` / `provider_user_id` must match.

**Webhook (follow-up, not this stub):** `payment_intent.succeeded` / `payment_failed` / `charge.refunded` on a **new** TEST endpoint. Do not mix franchise subscription events. Existing `account.updated` webhook stays as-is.

**Ledger (follow-up):** `provider_charges` (`client_user_id`, `provider_user_id`, optional `booking_id`, `amount_cents`, `status`, `stripe_payment_intent_id`, transfer/charge ids). No such table today. Stub does not write it.

---

## 4. Stub in this PR

`supabase/functions/charge-client/index.ts`

- Auth: provider JWT (`verify_jwt = true`).
- TEST Stripe client only (shared helper).
- Resolves client ids (section 1) and provider `acct_`.
- Builds the **intended** PaymentIntent params including `transfer_data.destination`.
- **Does not** call `paymentIntents.create` or `transfers.create`.
- Returns `501` + `{ stub: true, readyToCharge, blockers[], intendedPaymentIntent }` so a TEST invoke can prove lookups without moving money.

After approval: set the stub flag off (or delete the early return) and insert the ledger row around `paymentIntents.create`.

---

## 5. Gaps / risks

| Item | Notes |
| --- | --- |
| Mobile `testapp` not in repo | Cannot confirm which table it writes. Stub reads `client_profiles` then `profiles`. |
| Dual `cus_` locations | `client_profiles` and `profiles` can diverge. Charge should prefer `client_profiles` and log when fallback is used. |
| Hosted `charge-client` takes `customerId` | Mobile/provider callers must switch to `clientUserId` when the new function is deployed. |
| Hosted functions create Stripe objects on `{}` | `create-customer` / `create-payment-intent` / `create-setup-intent` are anon-callable. New charge path requires JWT and server-side id lookup. |
| `submit-client-booking` 404 | Intake only; unrelated to charge. |
| No amount on `bookings` | Caller must send `amountCents`. |
| Standard Connect fallback | May lack `transfers`. Gate on flags. |
| Franchise `cus_` on `provider_profiles` | Never use as the client customer. |

---

## 6. Approval checklist

- [ ] Destination charges (`transfer_data.destination`) for TEST
- [ ] Read client card from `client_profiles` (+ `profiles.stripe_customer_id` fallback)
- [ ] Franchise Register functions frozen
- [ ] No mobile / `testapp` changes
- [ ] Enable real `paymentIntents.create` only after a stub invoke shows `readyToCharge: true`
- [ ] TEST keys only
