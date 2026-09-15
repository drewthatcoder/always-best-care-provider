# Provider-initiated Connect charge (TEST, server-side)

**Status:** real TEST `charge-client` source in this branch. **Do not deploy** until Software Lead says merge/deploy. **No mobile edits.**  
**Goal:** charge the client’s saved card via Stripe; send funds to the provider’s Connect account when a destination can be resolved.

Mobile is already connected. Card-save source of truth is local Expo `mobile/testapp` (not in this repo). This repo owns the Edge Function + shared schema only.

---

## 1. Mobile contract (BookingScreen — do not change)

Live Expo `mobile/testapp` BookingScreen (owner-stated; not in this checkout):

| Item | Contract |
| --- | --- |
| Method / URL | `POST …/functions/v1/charge-client` |
| Auth | `Authorization: Bearer <Supabase anon JWT>` — **not** a provider user JWT |
| Body | `{ customerId, amount, description }` |
| `customerId` | `profiles.stripe_customer_id` for the signed-in **client** (on approve) |
| `amount` | integer **cents** |
| Failure | JSON `{ error: string }` — mobile treats this as fatal |
| Success | any JSON **without** `error`. Must **not** block shift approve |
| CORS | Allow POST/OPTIONS + `authorization`, `apikey`, `content-type` |

This function is therefore `verify_jwt = false` and **does not** call `requireUser()`. That matches today’s hosted/anon invoke. Provider JWT is optional later; do not require it or mobile approve breaks.

Optional fields (ignored by current mobile; safe extras): `connectedAccountId`, `providerUserId`, `bookingId`.

---

## 2. Where client Stripe IDs live

Hosted project `uwgfitnpesgdkiwtekcb` (column exists = REST `select` 200).

| Table | `stripe_customer_id` | `payment_method_id` | Who |
| --- | --- | --- | --- |
| **`client_profiles`** | yes | **yes** | Care client. Only table with both ids. |
| **`profiles`** | yes | no | Shared profile. **Mobile reads this `cus_`.** |
| `provider_profiles` | yes | no | **Franchise** subscriber + `stripe_account_id`. Never charge a client with this `cus_`. |
| `provider_applications` | **no** | no | Register still writes `stripe_customer_id` (`as any`). |
| `bookings` | no | no | Has `provider_user_id` for destination join. No amount / PI columns. |

**Payment method on charge**

1. If `client_profiles.stripe_customer_id = body.customerId` and `payment_method_id` is set → use it.
2. Else Stripe Customer `invoice_settings.default_payment_method`.
3. Else first attached card PaymentMethod.
4. Else `{ error: "No payment method on file for this customer" }`.

Web repos do **not** write client `cus_` / `pm_`. Expo `testapp` is the save path.

---

## 3. Destination resolution (gap)

Mobile today does **not** send a provider account id. Charge still succeeds on the **platform** and returns `warning` (not `error`).

**Order**

1. `connectedAccountId` if it is `acct_…`
2. `providerUserId` → `provider_profiles.stripe_account_id`
3. `bookingId` → `bookings.provider_user_id` → `provider_profiles.stripe_account_id`
4. Else platform charge + `warning`

If Stripe rejects `transfer_data.destination` (e.g. Standard account without `transfers`), **retry on the platform** and set `warning`. Do not fail the request — approve must not block.

**Gap:** until mobile (or a later optional field) sends `bookingId` / `providerUserId` / `connectedAccountId`, TEST money lands on the **platform** even when the provider has finished Connect onboarding. Closing the gap without mobile edits requires either:

- a later mobile optional field (out of scope here), or
- inferring provider from `description` / another server-side signal (not reliable today).

---

## 4. PaymentIntent (TEST)

```
stripe.paymentIntents.create({
  amount,                    // body.amount (cents)
  currency: "usd",
  customer: customerId,
  payment_method: pm_…,
  confirm: true,
  off_session: true,
  description,
  transfer_data: destination ? { destination } : undefined,
  metadata: { mode: "test", … },
})
```

- `getStripe()` refuses `sk_live_`.
- Live-mode PaymentIntents are rejected if they ever appear.
- Franchise `create-payment-intent` / `create-subscription` / `Register.tsx` stay frozen.

**Charge type:** destination charges when `acct_` is known; otherwise platform charge + warning. Not SCT. Not direct charges.

---

## 5. This branch

| Path | Role |
| --- | --- |
| `supabase/functions/charge-client` | Real TEST PI create. Anon CORS. `{ error }` on failure. |
| `supabase/functions/_shared/clientPayment.ts` | Lookup helpers (keep in sync with `src/lib/resolveClientStripe.ts`) |
| `src/integrations/supabase/types.ts` | `client_profiles` + `profiles.stripe_customer_id` |

**Do not** `supabase functions deploy` from this agent. Software Lead deploys after review (overwrites hosted orphan `charge-client`).

Success JSON (no `error`):

```json
{
  "paymentIntentId": "pi_…",
  "status": "succeeded",
  "destination": "acct_…" ,
  "destinationSource": "bookingId",
  "livemode": false
}
```

Unresolved destination adds `"warning": "Charged the platform account; …"` and `"destination": null`.

---

## 6. Leave alone

- Mobile / Expo `testapp` / Capacitor
- Franchise Register + `create-customer` / `create-payment-intent` / `create-subscription`
- Live keys / live webhooks
- Client web Payment Element

---

## 7. Follow-ups (not this PR)

- Optional mobile `bookingId` so destination can resolve without a new screen
- `provider_charges` ledger + billing webhook
- Tighten auth later **without** breaking the anon BookingScreen fetch
