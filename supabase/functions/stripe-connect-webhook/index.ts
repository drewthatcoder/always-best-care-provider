import { flagsFromAccount, persistConnectFlags } from "../_shared/connectFlags.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { getStripe, getStripeSecretKey, getWebhookCryptoProvider } from "../_shared/stripe.ts";
import { eventMatchesStripeMode } from "../_shared/stripeMode.ts";
import { getServiceClient } from "../_shared/supabase.ts";

/**
 * Stripe Connect webhook. verify_jwt is disabled in config.toml — Stripe
 * signs the request instead.
 *
 * Accepts account.updated when event.livemode matches the platform secret
 * (sk_live_ → live events, sk_test_ → test events). Does not charge,
 * transfer, or touch create-payment-intent / charge-client.
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

    if (!eventMatchesStripeMode(event.livemode, getStripeSecretKey())) {
      const expected = event.livemode ? "a live secret (sk_live_...)" : "a test secret (sk_test_...)";
      console.error(
        `Rejected Stripe event livemode=${event.livemode}; STRIPE_SECRET_KEY does not match`,
      );
      return jsonResponse(
        { error: `Event livemode does not match the platform Stripe key. Use ${expected}.` },
        400,
      );
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
        livemode: event.livemode,
      });
    }

    return jsonResponse({ received: true, ignored: event.type, livemode: event.livemode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("stripe-connect-webhook", message);
    return jsonResponse({ error: message }, 400);
  }
});
