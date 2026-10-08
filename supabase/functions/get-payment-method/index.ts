import { handleGetPaymentMethod } from "../_shared/cardOnFileHandler.ts";
import { createLiveCustomerDirectory, type ProfileAdmin } from "../_shared/cardOnFileStore.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { edgeFailure } from "../_shared/edgeHttp.ts";
import { getStripe } from "../_shared/stripe.ts";
import { getServiceClient } from "../_shared/supabase.ts";

/** Client JWT. Returns { brand, last4, expMonth, expYear } or null. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    return await handleGetPaymentMethod(req, {
      stripe: () => getStripe(),
      directory: () => createLiveCustomerDirectory(getServiceClient() as unknown as ProfileAdmin),
      allowUserIds: null,
    });
  } catch (error) {
    return edgeFailure("get-payment-method", error);
  }
});
