import { describe, expect, it } from "vitest";
import { stripeAccountLinkBody } from "./accountLinkUrls";

describe("stripeAccountLinkBody", () => {
  it("sends origin plus absolute return and refresh URLs", () => {
    expect(stripeAccountLinkBody("https://easycare.live")).toEqual({
      origin: "https://easycare.live",
      returnUrl: "https://easycare.live/settings?connect=return",
      refreshUrl: "https://easycare.live/settings?connect=refresh",
    });
  });

  it("strips a trailing slash from origin", () => {
    expect(stripeAccountLinkBody("https://easycare.live/").origin).toBe("https://easycare.live");
    expect(stripeAccountLinkBody("https://easycare.live/").returnUrl).toBe(
      "https://easycare.live/settings?connect=return",
    );
  });
});
