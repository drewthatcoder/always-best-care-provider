import { handleSetDefaultPaymentMethod } from "../_shared/cardOnFileHandler.ts";
import { createTestCustomerDirectory, type ProfileAdmin } from "../_shared/cardOnFileStore.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { edgeFailure } from "../_shared/edgeHttp.ts";
import { qaUserIdSet } from "../_shared/qaAllowlist.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { getTestStripe } from "../_shared/stripe.ts";

/** QA-only. Reads the customer from stripe_test_fixtures, never profiles. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    return await handleSetDefaultPaymentMethod(req, {
      stripe: getTestStripe(),
      directory: createTestCustomerDirectory(getServiceClient() as unknown as ProfileAdmin),
      allowUserIds: qaUserIdSet(),
    });
  } catch (error) {
    return edgeFailure("set-default-payment-method-test", error);
  }
});
