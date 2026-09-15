import { describe, expect, it } from "vitest";
import { deriveConnectStatus } from "./connectStatus";

describe("deriveConnectStatus", () => {
  it("is not_started when there is no profile or account", () => {
    expect(deriveConnectStatus(null)).toBe("not_started");
    expect(deriveConnectStatus({ stripe_account_id: null })).toBe("not_started");
  });

  it("is incomplete when an account exists but status is unknown or unfinished", () => {
    expect(deriveConnectStatus({ stripe_account_id: "acct_test" })).toBe("incomplete");
    expect(
      deriveConnectStatus({
        stripe_account_id: "acct_test",
        details_submitted: false,
        charges_enabled: false,
        payouts_enabled: false,
      }),
    ).toBe("incomplete");
  });

  it("is restricted when details were submitted but charges or payouts are off", () => {
    expect(
      deriveConnectStatus({
        stripe_account_id: "acct_test",
        details_submitted: true,
        charges_enabled: false,
        payouts_enabled: true,
      }),
    ).toBe("restricted");
    expect(
      deriveConnectStatus({
        stripe_account_id: "acct_test",
        details_submitted: true,
        charges_enabled: true,
        payouts_enabled: false,
      }),
    ).toBe("restricted");
  });

  it("is connected when onboarding is complete or both capabilities are enabled", () => {
    expect(
      deriveConnectStatus({
        stripe_account_id: "acct_test",
        onboarding_complete: true,
      }),
    ).toBe("connected");
    expect(
      deriveConnectStatus({
        stripe_account_id: "acct_test",
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        onboarding_complete: false,
      }),
    ).toBe("connected");
  });
});
