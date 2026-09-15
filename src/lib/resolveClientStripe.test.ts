import { describe, expect, it } from "vitest";
import { isBillableConnect, resolveClientPaymentRef } from "./resolveClientStripe";

describe("resolveClientPaymentRef", () => {
  it("prefers client_profiles when both tables have a customer id", () => {
    expect(
      resolveClientPaymentRef(
        { stripe_customer_id: "cus_client", payment_method_id: "pm_1" },
        { stripe_customer_id: "cus_profiles" },
      ),
    ).toEqual({
      stripeCustomerId: "cus_client",
      paymentMethodId: "pm_1",
      source: "client_profiles",
    });
  });

  it("falls back to profiles.stripe_customer_id", () => {
    expect(
      resolveClientPaymentRef({ stripe_customer_id: null, payment_method_id: null }, {
        stripe_customer_id: "cus_profiles",
      }),
    ).toEqual({
      stripeCustomerId: "cus_profiles",
      paymentMethodId: null,
      source: "profiles",
    });
  });

  it("is none when neither table has a customer", () => {
    expect(resolveClientPaymentRef(null, null)).toEqual({
      stripeCustomerId: null,
      paymentMethodId: null,
      source: "none",
    });
  });
});

describe("isBillableConnect", () => {
  it("requires a connected account id", () => {
    expect(isBillableConnect({ stripe_account_id: null, onboarding_complete: true })).toBe(false);
  });

  it("accepts onboarding_complete or both capability flags", () => {
    expect(isBillableConnect({ stripe_account_id: "acct_1", onboarding_complete: true })).toBe(true);
    expect(
      isBillableConnect({
        stripe_account_id: "acct_1",
        charges_enabled: true,
        payouts_enabled: true,
      }),
    ).toBe(true);
    expect(
      isBillableConnect({
        stripe_account_id: "acct_1",
        charges_enabled: true,
        payouts_enabled: false,
      }),
    ).toBe(false);
  });
});
