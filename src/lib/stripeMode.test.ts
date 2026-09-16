import { describe, expect, it } from "vitest";
import {
  assertStripeSecretKey,
  eventMatchesStripeMode,
  isLiveStripeSecret,
  livemodeFromStripeObject,
} from "../../supabase/functions/_shared/stripeMode.ts";

describe("isLiveStripeSecret", () => {
  it("is true only for sk_live_ prefixes", () => {
    expect(isLiveStripeSecret("sk_live_example")).toBe(true);
    expect(isLiveStripeSecret("sk_test_example")).toBe(false);
    expect(isLiveStripeSecret(undefined)).toBe(false);
  });
});

describe("assertStripeSecretKey", () => {
  it("accepts test and live secret prefixes", () => {
    expect(assertStripeSecretKey("sk_test_example")).toBe("sk_test_example");
    expect(assertStripeSecretKey("sk_live_example")).toBe("sk_live_example");
  });

  it("rejects missing or non-secret values", () => {
    expect(() => assertStripeSecretKey(undefined)).toThrow(/STRIPE_SECRET_KEY is not set/);
    expect(() => assertStripeSecretKey("pk_live_example")).toThrow(/sk_test_\.\.\. or sk_live_/);
  });
});

describe("eventMatchesStripeMode", () => {
  it("accepts live events only when the platform key is live", () => {
    expect(eventMatchesStripeMode(true, "sk_live_example")).toBe(true);
    expect(eventMatchesStripeMode(true, "sk_test_example")).toBe(false);
    expect(eventMatchesStripeMode(false, "sk_test_example")).toBe(true);
    expect(eventMatchesStripeMode(false, "sk_live_example")).toBe(false);
  });
});

describe("livemodeFromStripeObject", () => {
  it("returns Stripe's livemode and falls back to the platform flag", () => {
    expect(livemodeFromStripeObject({ livemode: true }, false)).toBe(true);
    expect(livemodeFromStripeObject({ livemode: false }, true)).toBe(false);
    expect(livemodeFromStripeObject({}, true)).toBe(true);
    expect(livemodeFromStripeObject(null, false)).toBe(false);
  });
});
