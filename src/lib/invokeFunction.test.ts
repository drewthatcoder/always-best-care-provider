import { describe, expect, it } from "vitest";
import { isConnectComplete, readFunctionError } from "./invokeFunction";

describe("readFunctionError", () => {
  it("prefers the Edge Function JSON error body", () => {
    expect(
      readFunctionError(
        { error: "Stripe Account Links require absolute URLs. Pass origin from the browser or set PROVIDER_APP_URL." },
        new Error("Edge Function returned a non-2xx status code"),
        "fallback",
      ),
    ).toBe(
      "Stripe Account Links require absolute URLs. Pass origin from the browser or set PROVIDER_APP_URL.",
    );
  });

  it("does not surface the generic non-2xx toast text", () => {
    expect(
      readFunctionError(null, new Error("Edge Function returned a non-2xx status code"), "Could not open Stripe setup."),
    ).toBe("Could not open Stripe setup.");
  });

  it("uses a non-generic Error message when no JSON body is present", () => {
    expect(readFunctionError(null, new Error("Unauthorized"), "fallback")).toBe("Unauthorized");
  });
});

describe("isConnectComplete", () => {
  it("is true when charges and payouts are enabled", () => {
    expect(isConnectComplete({ charges_enabled: true, payouts_enabled: true })).toBe(true);
  });

  it("is true when onboarding_complete is set", () => {
    expect(isConnectComplete({ onboarding_complete: true })).toBe(true);
  });

  it("is false when flags are missing or incomplete", () => {
    expect(isConnectComplete(null)).toBe(false);
    expect(isConnectComplete({ charges_enabled: true, payouts_enabled: false })).toBe(false);
  });
});
