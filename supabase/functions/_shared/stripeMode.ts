/**
 * Stripe platform mode follows the secret key prefix (sk_live_ vs sk_test_).
 * Do not hardcode TEST or invent a live secret in source.
 */

export function isLiveStripeSecret(key: string | undefined | null): boolean {
  return typeof key === "string" && key.startsWith("sk_live_");
}

export function assertStripeSecretKey(key: string | undefined | null): string {
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!key.startsWith("sk_test_") && !key.startsWith("sk_live_")) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe secret (sk_test_... or sk_live_...).");
  }
  return key;
}

export function eventMatchesStripeMode(
  eventLivemode: boolean,
  secretKey: string | undefined | null,
): boolean {
  return eventLivemode === isLiveStripeSecret(secretKey);
}

export function livemodeFromStripeObject(
  object: { livemode?: boolean | null } | null | undefined,
  fallbackLive = false,
): boolean {
  if (typeof object?.livemode === "boolean") return object.livemode;
  return fallbackLive;
}
