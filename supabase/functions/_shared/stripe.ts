import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { assertStripeSecretKey, isLiveStripeSecret } from "./stripeMode.ts";

/**
 * Stripe client for the platform account. Mode is the secret key
 * (sk_live_ → live payouts, sk_test_ → TEST). Does not invent a live key.
 */
export function getStripeSecretKey(): string {
  return assertStripeSecretKey(Deno.env.get("STRIPE_SECRET_KEY"));
}

export function isPlatformLive(): boolean {
  return isLiveStripeSecret(getStripeSecretKey());
}

export function getStripe(): Stripe {
  return new Stripe(getStripeSecretKey(), {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function getWebhookCryptoProvider() {
  return Stripe.createSubtleCryptoProvider();
}
