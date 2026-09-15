import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

/**
 * TEST-mode Stripe client. Refuses live secret keys so this portal cannot
 * accidentally create production Connect accounts or charges.
 */
export function getStripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (key.startsWith("sk_live_")) {
    throw new Error(
      "Live Stripe keys are not allowed. Always Best Care Connect onboarding is TEST mode only.",
    );
  }
  if (!key.startsWith("sk_test_")) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe TEST secret (sk_test_...).");
  }

  return new Stripe(key, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function getWebhookCryptoProvider() {
  return Stripe.createSubtleCryptoProvider();
}
