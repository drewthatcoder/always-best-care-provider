import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import {
  DESTINATION_UNRESOLVED_WARNING,
  destinationLookupPlan,
} from "../_shared/clientPayment.ts";
import { getStripe } from "../_shared/stripe.ts";
import { getServiceClient } from "../_shared/supabase.ts";

/**
 * TEST-mode charge-client — mobile BookingScreen contract (do not change mobile).
 *
 * POST { customerId, amount, description }
 *   amount = cents
 * Auth: Supabase anon JWT (verify_jwt = false). Do not require a provider user JWT.
 * Failure: { error: string }  — mobile treats this as fatal and may still approve.
 * Success: no `error` key. Optional `warning` if charged on the platform (no destination).
 *
 * Destination (optional, does not fail the charge):
 *   connectedAccountId | providerUserId | bookingId → provider_profiles.stripe_account_id
 *
 * Do not deploy until Software Lead says so (overwrites hosted function).
 */

type Body = {
  customerId?: string;
  amount?: number | string;
  description?: string;
  connectedAccountId?: string;
  providerUserId?: string;
  bookingId?: string;
};

const TEST_AMOUNT_CAP_CENTS = 1_000_000;

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function paymentMethodIdFromStripe(value: unknown): string | null {
  if (typeof value === "string" && value.startsWith("pm_")) return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.startsWith("pm_")) return id;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const stripe = getStripe();

    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const customerId = asTrimmed(body.customerId);
    const description = asTrimmed(body.description);
    const connectedAccountId = asTrimmed(body.connectedAccountId);
    const providerUserId = asTrimmed(body.providerUserId);
    const bookingId = asTrimmed(body.bookingId);
    const amount = Number(body.amount);

    if (!customerId.startsWith("cus_")) {
      return jsonResponse({ error: "customerId is required" }, 400);
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      return jsonResponse({ error: "amount must be a positive integer (cents)" }, 400);
    }
    if (amount > TEST_AMOUNT_CAP_CENTS) {
      return jsonResponse({ error: "amount exceeds TEST cap" }, 400);
    }

    const admin = getServiceClient();

    const { data: clientProfile, error: cpError } = await admin
      .from("client_profiles")
      .select("user_id, stripe_customer_id, payment_method_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (cpError) return jsonResponse({ error: cpError.message }, 500);

    let paymentMethodId =
      clientProfile?.stripe_customer_id === customerId
        ? asTrimmed(clientProfile.payment_method_id) || null
        : null;

    if (!paymentMethodId) {
      const customer = await stripe.customers.retrieve(customerId, {
        expand: ["invoice_settings.default_payment_method"],
      });
      if (customer.deleted) {
        return jsonResponse({ error: "Stripe customer has been deleted" }, 400);
      }
      paymentMethodId = paymentMethodIdFromStripe(
        customer.invoice_settings?.default_payment_method,
      );
    }

    if (!paymentMethodId) {
      const listed = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
        limit: 1,
      });
      paymentMethodId = listed.data[0]?.id ?? null;
    }

    if (!paymentMethodId) {
      return jsonResponse({ error: "No payment method on file for this customer" }, 400);
    }

    const plan = destinationLookupPlan({ connectedAccountId, providerUserId, bookingId });
    let destination: string | null = null;
    let destinationSource = plan;
    let destinationWarning: string | null = null;

    if (plan === "connectedAccountId") {
      destination = connectedAccountId;
    } else if (plan === "providerUserId") {
      const { data: provider, error } = await admin
        .from("provider_profiles")
        .select("stripe_account_id")
        .eq("user_id", providerUserId)
        .maybeSingle();
      if (error) return jsonResponse({ error: error.message }, 500);
      destination = asTrimmed(provider?.stripe_account_id) || null;
      if (!destination) {
        destinationSource = "none";
        destinationWarning = DESTINATION_UNRESOLVED_WARNING;
      }
    } else if (plan === "bookingId") {
      const { data: booking, error: bookingError } = await admin
        .from("bookings")
        .select("id, provider_user_id")
        .eq("id", bookingId)
        .maybeSingle();
      if (bookingError) return jsonResponse({ error: bookingError.message }, 500);
      const bookingProviderId = asTrimmed(booking?.provider_user_id);
      if (bookingProviderId) {
        const { data: provider, error } = await admin
          .from("provider_profiles")
          .select("stripe_account_id")
          .eq("user_id", bookingProviderId)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, 500);
        destination = asTrimmed(provider?.stripe_account_id) || null;
      }
      if (!destination) {
        destinationSource = "none";
        destinationWarning = DESTINATION_UNRESOLVED_WARNING;
      }
    } else {
      destinationWarning = DESTINATION_UNRESOLVED_WARNING;
    }

    const metadata: Record<string, string> = {
      mode: "test",
      portal: "always-best-care-provider",
      customer_id: customerId,
    };
    if (description) metadata.description = description.slice(0, 450);
    if (bookingId) metadata.booking_id = bookingId;
    if (providerUserId) metadata.provider_user_id = providerUserId;
    if (clientProfile?.user_id) metadata.client_user_id = clientProfile.user_id;

    const baseParams = {
      amount,
      currency: "usd" as const,
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      description: description || undefined,
      metadata,
    };

    let warning = destinationWarning;
    let paymentIntent;

    try {
      paymentIntent = await stripe.paymentIntents.create({
        ...baseParams,
        ...(destination ? { transfer_data: { destination } } : {}),
      });
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Payment failed";
      if (destination) {
        console.warn("charge-client destination rejected; retrying on platform", message);
        warning = `Destination ${destination} was rejected (${message}); charged the platform account.`;
        destination = null;
        destinationSource = "none";
        paymentIntent = await stripe.paymentIntents.create(baseParams);
      } else {
        return jsonResponse({ error: message }, 400);
      }
    }

    if (paymentIntent.livemode) {
      return jsonResponse({ error: "Live-mode PaymentIntents are not allowed" }, 400);
    }

    const bodyOut: Record<string, unknown> = {
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      destination,
      destinationSource,
      livemode: false,
    };
    if (warning) bodyOut.warning = warning;

    return jsonResponse(bodyOut);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("charge-client", message);
    return jsonResponse({ error: message }, 400);
  }
});
