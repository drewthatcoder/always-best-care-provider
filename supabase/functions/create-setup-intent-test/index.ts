import { handleCreateSetupIntent } from "../_shared/cardOnFileHandler.ts";
import { createTestCustomerDirectory, type ProfileAdmin } from "../_shared/cardOnFileStore.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { edgeFailure } from "../_shared/edgeHttp.ts";
import { qaUserIdSet } from "../_shared/qaAllowlist.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { getTestStripe, getTestStripePublishableKey } from "../_shared/stripe.ts";

/** QA-only SetupIntent. Writes the test customer id to stripe_test_fixtures, never profiles. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    return await handleCreateSetupIntent(req, {
      stripe: getTestStripe(),
      publishableKey: getTestStripePublishableKey(),
      directory: createTestCustomerDirectory(getServiceClient() as unknown as ProfileAdmin),
      allowUserIds: qaUserIdSet(),
    });
  } catch (error) {
    return edgeFailure("create-setup-intent-test", error);
  }
});
