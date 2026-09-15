import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { getStripe } from "../_shared/stripe.ts";
import { isBillableConnect, resolveClientPaymentRef } from "../_shared/clientPayment.ts";
import { getServiceClient, requireUser } from "../_shared/supabase.ts";

/**
 * STUB — TEST mode only. Does **not** create a PaymentIntent or Transfer.
 *
 * Intended (next PR, after approval):
 *   paymentIntents.create({
 *     confirm: true,
 *     off_session: true,
 *     customer, payment_method,
 *     transfer_data: { destination: provider.stripe_account_id },
 *   })
 *
 * Body: { clientUserId: string, amountCents: number, bookingId?: string }
 *
 * Deploying this function overwrites the hosted orphan `charge-client`
 * (platform Customer lookup, no Connect). Do not deploy until approved.
 */

type Body = {
  clientUserId?: string;
  amountCents?: number;
  bookingId?: string;
};

const TEST_AMOUNT_CAP_CENTS = 50_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    // Touch the TEST Stripe client so a live key fails closed even in stub mode.
    getStripe();

    const { user, error: authError } = await requireUser(req);
    if (!user) return jsonResponse({ error: authError }, 401);

    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }

    const clientUserId = typeof body.clientUserId === "string" ? body.clientUserId.trim() : "";
    const amountCents = Number(body.amountCents);
    const bookingId = typeof body.bookingId === "string" ? body.bookingId.trim() : "";

    const blockers: string[] = [];
    if (!clientUserId) blockers.push("clientUserId is required");
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      blockers.push("amountCents must be a positive integer");
    } else if (amountCents > TEST_AMOUNT_CAP_CENTS) {
      blockers.push(`amountCents exceeds TEST cap (${TEST_AMOUNT_CAP_CENTS})`);
    }

    const admin = getServiceClient();

    const { data: provider, error: providerError } = await admin
      .from("provider_profiles")
      .select(
        "user_id, stripe_account_id, stripe_customer_id, charges_enabled, payouts_enabled, onboarding_complete",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (providerError) return jsonResponse({ error: providerError.message }, 500);
    if (!isBillableConnect(provider)) {
      blockers.push("provider Connect account is missing or not billable");
    }

    let paymentRef = resolveClientPaymentRef(null, null);
    if (clientUserId) {
      const [{ data: clientProfile, error: cpError }, { data: sharedProfile, error: pError }] =
        await Promise.all([
          admin
            .from("client_profiles")
            .select("user_id, stripe_customer_id, payment_method_id")
            .eq("user_id", clientUserId)
            .maybeSingle(),
          admin
            .from("profiles")
            .select("user_id, stripe_customer_id")
            .eq("user_id", clientUserId)
            .maybeSingle(),
        ]);
      if (cpError) return jsonResponse({ error: cpError.message }, 500);
      if (pError) return jsonResponse({ error: pError.message }, 500);
      paymentRef = resolveClientPaymentRef(clientProfile, sharedProfile);
    }

    if (!paymentRef.stripeCustomerId) {
      blockers.push("client has no stripe_customer_id on client_profiles or profiles");
    }
    if (!paymentRef.paymentMethodId) {
      blockers.push(
        "client_profiles.payment_method_id is empty (stub will not retrieve Customer default PM)",
      );
    }

    if (bookingId) {
      const { data: booking, error: bookingError } = await admin
        .from("bookings")
        .select("id, client_user_id, provider_user_id")
        .eq("id", bookingId)
        .maybeSingle();
      if (bookingError) return jsonResponse({ error: bookingError.message }, 500);
      if (!booking) blockers.push("bookingId not found");
      else {
        if (clientUserId && booking.client_user_id !== clientUserId) {
          blockers.push("booking.client_user_id does not match clientUserId");
        }
        if (booking.provider_user_id && booking.provider_user_id !== user.id) {
          blockers.push("booking is not assigned to this provider");
        }
      }
    }

    const intendedPaymentIntent = {
      amount: Number.isInteger(amountCents) && amountCents > 0 ? amountCents : null,
      currency: "usd",
      customer: paymentRef.stripeCustomerId,
      payment_method: paymentRef.paymentMethodId,
      confirm: true,
      off_session: true,
      transfer_data: provider?.stripe_account_id
        ? { destination: provider.stripe_account_id }
        : null,
      metadata: {
        mode: "test",
        portal: "always-best-care-provider",
        provider_user_id: user.id,
        client_user_id: clientUserId || null,
        booking_id: bookingId || null,
        customer_source: paymentRef.source,
      },
    };

    return jsonResponse(
      {
        stub: true,
        implemented: false,
        livemode: false,
        readyToCharge: blockers.length === 0,
        blockers,
        clientPayment: paymentRef,
        providerAccountId: provider?.stripe_account_id ?? null,
        // Franchise customer on the same row — never use for this charge.
        providerFranchiseCustomerId: provider?.stripe_customer_id ?? null,
        intendedPaymentIntent,
        note:
          "Stub only. No PaymentIntent was created. Approve docs/stripe-provider-billing-design.md before enabling paymentIntents.create.",
      },
      501,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("charge-client stub", message);
    return jsonResponse({ error: message }, 500);
  }
});
