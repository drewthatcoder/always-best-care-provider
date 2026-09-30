import { AGREEMENT_RETURN_EMAIL, EMAIL_FROM } from "../_shared/email.ts";

export { AGREEMENT_RETURN_EMAIL, EMAIL_FROM };

export const APPROVAL_SUBJECT = "🎉 Your Provider Application Has Been Approved";
export const REJECTION_SUBJECT = "Your Provider Application Status Update";
export const PROVIDER_APP_URL = "https://easycare.live";
export const SETTINGS_URL = "https://easycare.live/settings";
export const PRICING_FORM_URL = "https://easycare.live/pricing-form";
export const SUPPORT_EMAIL = "techsupport@cityoftreestech.com";

export type ProviderStatus = "approved" | "rejected";

export function isProviderStatus(value: unknown): value is ProviderStatus {
  return value === "approved" || value === "rejected";
}

export function providerStatusSubject(status: ProviderStatus): string {
  return status === "approved" ? APPROVAL_SUBJECT : REJECTION_SUBJECT;
}

export type ApprovalRecipient = {
  email?: string | null;
  lastName?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Pricing form link, with optional name and email for the public form to prefill. */
export function pricingFormUrl(options?: { name?: string | null; email?: string | null }): string {
  const params = new URLSearchParams();
  const name = options?.name?.replace(/[\r\n]+/g, " ").trim();
  const email = options?.email?.replace(/[\r\n]+/g, "").trim();
  if (name) params.set("name", name);
  if (email) params.set("email", email);
  const query = params.toString();
  return query ? `${PRICING_FORM_URL}?${query}` : PRICING_FORM_URL;
}

function approvalPricingUrl(firstName: string, recipient?: ApprovalRecipient): string {
  const lastName = recipient?.lastName?.trim();
  const name = [firstName.trim(), lastName].filter(Boolean).join(" ");
  return pricingFormUrl({ name, email: recipient?.email });
}

export function rejectionHtml(firstName: string): string {
  return `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #dc2626;">Application Status Update</h2>
          <p>Hi ${firstName},</p>
          <p>After reviewing your provider application, we are unable to approve it at this time.</p>
          <p>If you have any questions or believe this was an error, please contact our support team.</p>
          <p style="margin-top: 32px; color: #6b7280; font-size: 14px;">Thank you for your interest.</p>
        </div>
      `;
}

export function approvalHtml(firstName: string, recipient?: ApprovalRecipient): string {
  const pricingUrl = escapeHtml(approvalPricingUrl(firstName, recipient));
  return `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #16a34a;">🎉 Your Application Has Been Approved!</h2>
          <p>Hi ${firstName},</p>
          <p>Great news! Your provider application has been <strong>approved</strong>. You can now log in to your provider dashboard and start accepting jobs.</p>
          <h3 style="color: #111827; margin-top: 28px;">Set up payouts</h3>
          <p>Connect your bank through Stripe so Always Best Care can send payouts. You do not need a separate Stripe platform account — this links payouts to Always Best Care.</p>
          <ol style="padding-left: 20px; line-height: 1.6;">
            <li>Go to <a href="${PROVIDER_APP_URL}">${PROVIDER_APP_URL}</a> and log in as a provider</li>
            <li>Open Settings</li>
            <li>Tap <strong>Set up payouts</strong></li>
            <li>Complete Stripe’s form (business details + bank)</li>
            <li>Return to Settings — status should show <strong>Connected</strong></li>
          </ol>
          <p style="margin-top: 24px;">
            <a href="${SETTINGS_URL}"
               style="background: #16a34a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
              Set up payouts
            </a>
          </p>
          <h3 style="color: #111827; margin-top: 28px;">Set your service prices</h3>
          <p>Enter your price for each of the 8 services for every zip code you serve.</p>
          <p style="margin-top: 24px;">
            <a href="${pricingUrl}"
               style="background: #16a34a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
              Set your service prices
            </a>
          </p>
          <p>If you have not already returned a signed Agency Subscriber Agreement, please sign it and email it to
            <a href="mailto:${AGREEMENT_RETURN_EMAIL}">${AGREEMENT_RETURN_EMAIL}</a>.
          </p>
          <p style="margin-top: 24px; color: #6b7280; font-size: 14px;">
            Questions? Contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.
          </p>
          <p style="margin-top: 32px; color: #6b7280; font-size: 14px;">Welcome to the team!</p>
        </div>
      `;
}

export function providerStatusHtml(
  status: ProviderStatus,
  firstName: string,
  recipient?: ApprovalRecipient,
): string {
  return status === "approved" ? approvalHtml(firstName, recipient) : rejectionHtml(firstName);
}
