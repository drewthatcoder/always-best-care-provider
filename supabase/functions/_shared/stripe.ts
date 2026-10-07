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

/**
 * Publishable key paired with STRIPE_SECRET_KEY. Refuses a live/test mismatch.
 * Additive: getStripe() is unchanged.
 */
export function getStripePublishableKey(): string {
  const key = Deno.env.get("STRIPE_PUBLISHABLE_KEY");
  if (!key || (!key.startsWith("pk_test_") && !key.startsWith("pk_live_"))) {
    throw new Error("STRIPE_PUBLISHABLE_KEY must be a Stripe publishable key (pk_test_... or pk_live_...).");
  }
  const secretLive = getStripeSecretKey().startsWith("sk_live_");
  if (secretLive !== key.startsWith("pk_live_")) {
    throw new Error("STRIPE_PUBLISHABLE_KEY mode does not match STRIPE_SECRET_KEY.");
  }
  return key;
}

/** Test-mode secret. Refuses anything that does not start with sk_test_. */
export function getTestStripeSecretKey(): string {
  const key = Deno.env.get("STRIPE_TEST_SECRET_KEY");
  if (!key || !key.startsWith("sk_test_")) {
    throw new Error("STRIPE_TEST_SECRET_KEY must start with sk_test_.");
  }
  return key;
}

/** Test-mode publishable key. Refuses anything that does not start with pk_test_. */
export function getTestStripePublishableKey(): string {
  const key = Deno.env.get("STRIPE_TEST_PUBLISHABLE_KEY");
  if (!key || !key.startsWith("pk_test_")) {
    throw new Error("STRIPE_TEST_PUBLISHABLE_KEY must start with pk_test_.");
  }
  return key;
}

/**
 * Stripe client for QA only. Refuses unless STRIPE_TEST_SECRET_KEY starts with
 * sk_test_ and STRIPE_TEST_PUBLISHABLE_KEY starts with pk_test_.
 */
export function getTestStripe(): Stripe {
  const secret = getTestStripeSecretKey();
  getTestStripePublishableKey();
  return new Stripe(secret, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
}
