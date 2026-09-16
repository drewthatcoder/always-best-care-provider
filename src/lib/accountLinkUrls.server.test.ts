import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROVIDER_APP_URL,
  resolveAccountLinkUrls,
} from "../../supabase/functions/_shared/accountLinkUrls.ts";

describe("resolveAccountLinkUrls", () => {
  it("uses absolute return and refresh URLs when both are provided", () => {
    expect(
      resolveAccountLinkUrls({
        returnUrl: "https://easycare.live/settings?connect=return",
        refreshUrl: "https://easycare.live/settings?connect=refresh",
      }),
    ).toEqual({
      returnUrl: "https://easycare.live/settings?connect=return",
      refreshUrl: "https://easycare.live/settings?connect=refresh",
    });
  });

  it("builds /settings URLs from browser origin", () => {
    expect(resolveAccountLinkUrls({ origin: "https://easycare.live" })).toEqual({
      returnUrl: "https://easycare.live/settings?connect=return",
      refreshUrl: "https://easycare.live/settings?connect=refresh",
    });
  });

  it("prefers PROVIDER_APP_URL over origin", () => {
    expect(
      resolveAccountLinkUrls({ origin: "https://preview.example" }, { PROVIDER_APP_URL: "https://easycare.live" }),
    ).toEqual({
      returnUrl: "https://easycare.live/settings?connect=return",
      refreshUrl: "https://easycare.live/settings?connect=refresh",
    });
  });

  it("falls back to easycare.live when nothing absolute is passed", () => {
    expect(resolveAccountLinkUrls({})).toEqual({
      returnUrl: `${DEFAULT_PROVIDER_APP_URL}/settings?connect=return`,
      refreshUrl: `${DEFAULT_PROVIDER_APP_URL}/settings?connect=refresh`,
    });
  });
});
