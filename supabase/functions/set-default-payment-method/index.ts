import { handleSetDefaultPaymentMethod } from "../_shared/cardOnFileHandler.ts";
import { createLiveCustomerDirectory } from "../_shared/cardOnFileStore.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { edgeFailure } from "../_shared/edgeHttp.ts";
import { getStripe } from "../_shared/stripe.ts";
import { getServiceClient } from "../_shared/supabase.ts";

/** Client JWT. Body { setupIntentId }. Sets invoice_settings.default_payment_method. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    return await handleSetDefaultPaymentMethod(req, {
      stripe: getStripe(),
      directory: createLiveCustomerDirectory(getServiceClient()),
      allowUserIds: null,
    });
  } catch (error) {
    return edgeFailure("set-default-payment-method", error);
  }
});
