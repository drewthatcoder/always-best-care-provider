import { handleCreateSetupIntent } from "../_shared/cardOnFileHandler.ts";
import { createLiveCustomerDirectory, type ProfileAdmin } from "../_shared/cardOnFileStore.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { edgeFailure } from "../_shared/edgeHttp.ts";
import { getStripe, getStripePublishableKey } from "../_shared/stripe.ts";
import { getServiceClient } from "../_shared/supabase.ts";

/** Client JWT. Gets or creates the Stripe customer and an off_session SetupIntent. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    return await handleCreateSetupIntent(req, {
      stripe: getStripe(),
      publishableKey: getStripePublishableKey(),
      directory: createLiveCustomerDirectory(getServiceClient() as unknown as ProfileAdmin),
      allowUserIds: null,
    });
  } catch (error) {
    return edgeFailure("create-setup-intent", error);
  }
});
