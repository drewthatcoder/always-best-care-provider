import { describe, expect, it } from "vitest";
import {
  AGREEMENT_RETURN_EMAIL,
  APPROVAL_SUBJECT,
  EMAIL_FROM,
  PRICING_FORM_URL,
  REJECTION_SUBJECT,
  SETTINGS_URL,
  SUPPORT_EMAIL,
  approvalHtml,
  isProviderStatus,
  pricingFormUrl,
  providerStatusHtml,
  providerStatusSubject,
  rejectionHtml,
} from "../../supabase/functions/notify-provider-status/email.ts";

describe("notify-provider-status email", () => {
  it("accepts only approved and rejected statuses", () => {
    expect(isProviderStatus("approved")).toBe(true);
    expect(isProviderStatus("rejected")).toBe(true);
    expect(isProviderStatus("pending")).toBe(false);
  });

  it("keeps the hosted approval and rejection subjects", () => {
    expect(providerStatusSubject("approved")).toBe(APPROVAL_SUBJECT);
    expect(providerStatusSubject("rejected")).toBe(REJECTION_SUBJECT);
    expect(APPROVAL_SUBJECT).toBe("🎉 Your Provider Application Has Been Approved");
    expect(REJECTION_SUBJECT).toBe("Your Provider Application Status Update");
  });

  it("keeps the hosted Resend from address", () => {
    expect(EMAIL_FROM).toBe("CareConnect <onboarding@resend.dev>");
  });

  it("includes Set up payouts steps and the Settings CTA on approval", () => {
    const html = providerStatusHtml("approved", "Jordan");
    expect(html).toContain("Hi Jordan");
    expect(html).toContain("Your Application Has Been Approved");
    expect(html).toContain("https://easycare.live");
    expect(html).toContain("log in as a provider");
    expect(html).toContain("Open Settings");
    expect(html).toContain("Set up payouts");
    expect(html).toContain("Complete Stripe");
    expect(html).toContain("business details + bank");
    expect(html).toContain("Connected");
    expect(html).toContain(`href="${SETTINGS_URL}"`);
    expect(html).toContain("do not need a separate Stripe platform account");
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).toContain("If you have not already returned a signed Agency Subscriber Agreement");
    expect(html).toContain(`mailto:${AGREEMENT_RETURN_EMAIL}`);
    expect(html).toContain(AGREEMENT_RETURN_EMAIL);
    expect(html).not.toContain("lovable.app");

    const payoutsLink = html.indexOf(`href="${SETTINGS_URL}"`);
    const pricesHeading = html.indexOf("Set your service prices");
    const agreement = html.indexOf("Agency Subscriber Agreement");
    expect(html).toContain("Enter your price for each of the 8 services for every zip code you serve.");
    expect(html).toContain(`href="${PRICING_FORM_URL}?name=Jordan"`);
    expect(pricesHeading).toBeGreaterThan(payoutsLink);
    expect(agreement).toBeGreaterThan(pricesHeading);
  });

  it("prefills the pricing form link with the provider name and email", () => {
    const url = pricingFormUrl({ name: "Jordan Lee", email: "jordan@example.com" });
    expect(url).toBe(`${PRICING_FORM_URL}?name=Jordan+Lee&email=jordan%40example.com`);

    const html = approvalHtml("Jordan", { lastName: "Lee", email: "a&b@example.com" });
    expect(html).toContain(
      `href="${PRICING_FORM_URL}?name=Jordan+Lee&amp;email=a%26b%40example.com"`,
    );
    expect(html).toContain("Set your service prices");
  });

  it("leaves the hosted rejection copy unchanged", () => {
    expect(providerStatusHtml("rejected", "Jordan")).toBe(rejectionHtml("Jordan"));
    expect(rejectionHtml("Jordan")).toContain("Hi Jordan");
    expect(rejectionHtml("Jordan")).toContain("we are unable to approve it at this time");
    expect(rejectionHtml("Jordan")).toContain("Thank you for your interest.");
    expect(rejectionHtml("Jordan")).not.toContain("Set up payouts");
    expect(rejectionHtml("Jordan")).not.toContain(SETTINGS_URL);
    expect(rejectionHtml("Jordan")).not.toContain("Stripe");
    expect(rejectionHtml("Jordan")).not.toContain(AGREEMENT_RETURN_EMAIL);
    expect(rejectionHtml("Jordan")).not.toContain("Agency Subscriber Agreement");
    expect(providerStatusHtml("rejected", "Jordan", { email: "jordan@example.com", lastName: "Lee" })).toBe(
      rejectionHtml("Jordan"),
    );
    expect(rejectionHtml("Jordan")).not.toContain("Set your service prices");
    expect(rejectionHtml("Jordan")).not.toContain("pricing-form");
  });
});
