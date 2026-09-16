import { flagsFromAccount, persistConnectFlags } from "../_shared/connectFlags.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { getStripe, getWebhookCryptoProvider } from "../_shared/stripe.ts";
import { getServiceClient } from "../_shared/supabase.ts";

/**
 * Stripe Connect webhook (TEST mode).
 * verify_jwt is disabled in config.toml — Stripe signs the request instead.
 *
 * On account.updated, persist Connect capability flags onto provider_profiles
 * keyed by stripe_account_id. Does not charge, transfer, or touch
 * create-payment-intent.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const signature = req.headers.get("Stripe-Signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !webhookSecret) {
    return jsonResponse({ error: "Missing Stripe-Signature or STRIPE_WEBHOOK_SECRET" }, 400);
  }

  const payload = await req.text();

  try {
    const stripe = getStripe();
    const event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
      undefined,
      getWebhookCryptoProvider(),
    );

    if (event.livemode) {
      console.error("Rejected live-mode Stripe event; this webhook is TEST only");
      return jsonResponse({ error: "Live-mode events are not accepted" }, 400);
    }

    if (event.type === "account.updated") {
      const account = event.data.object;
      const flags = flagsFromAccount(account);
      const admin = getServiceClient();
      const persist = await persistConnectFlags(admin, account.id, flags);

      if (persist.error) {
        return jsonResponse({ error: persist.error }, 500);
      }

      return jsonResponse({
        received: true,
        persisted: persist.persisted,
        onboardingComplete: flags.onboarding_complete,
        warning: persist.warning,
      });
    }

    return jsonResponse({ received: true, ignored: event.type });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("stripe-connect-webhook", message);
    return jsonResponse({ error: message }, 400);
  }
});
