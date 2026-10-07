import { handleProviderChargeRequest } from "../_shared/bookingChargeHandler.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { edgeFailure } from "../_shared/edgeHttp.ts";
import { qaUserIdSet } from "../_shared/qaAllowlist.ts";
import { getTestStripe, getTestStripePublishableKey } from "../_shared/stripe.ts";

/**
 * Test-mode provider charge. Same shared module as charge-client's new actions.
 * Refuses unless the Stripe test keys are sk_test_ / pk_test_, and unless the
 * caller and both booking parties are on the QA allowlist.
 * Stripe ids come from stripe_test_fixtures, never profiles or provider_profiles.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    getTestStripePublishableKey();
    const stripe = getTestStripe();
    const raw = await req.text();
    let body: { action?: string; bookingId?: unknown } = {};
    try {
      body = raw ? JSON.parse(raw) as { action?: string; bookingId?: unknown } : {};
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    const action = typeof body.action === "string" ? body.action.trim() : "";
    if (action !== "preview" && action !== "complete_and_charge") {
      return jsonResponse({ error: "action must be preview or complete_and_charge", code: "unknown_action" }, 400);
    }
    return await handleProviderChargeRequest(req, body, {
      stripe,
      mode: "test",
      allowUserIds: qaUserIdSet(Deno.env.get("QA_USER_IDS")),
    });
  } catch (error) {
    return edgeFailure("charge-client-test", error);
  }
});
