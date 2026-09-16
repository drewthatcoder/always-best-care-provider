import { describe, expect, it } from "vitest";
import {
  AGREEMENT_RETURN_EMAIL,
  APPROVAL_SUBJECT,
  EMAIL_FROM,
  REJECTION_SUBJECT,
  SETTINGS_URL,
  SUPPORT_EMAIL,
  isProviderStatus,
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
  });
});
