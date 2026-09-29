import { buildResendPayload, type ResendPayload, type SendEmailInput } from "../_shared/email.ts";
import {
  PRICING_SERVICES,
  type NormalizedServicePricing,
  type PricingService,
} from "./validate.ts";

export const PRICING_SUPPORT_EMAIL = "techsupport@cityoftreestech.com";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatUsdFromCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const withCommas = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${withCommas}.${String(remainder).padStart(2, "0")}`;
}

export function servicePricingEmailSubject(providerName: string): string {
  const name = providerName.replace(/[\r\n]+/g, " ").trim();
  return `Service pricing from ${name}`;
}

function cell(text: string, options: { header?: boolean; align?: "left" | "right" } = {}): string {
  const header = options.header ?? false;
  const align = options.align ?? (header ? "left" : "right");
  const tag = header ? "th" : "td";
  const weight = header ? "font-weight:600;" : "";
  const background = header ? "background:#f3f4f6;" : "background:#ffffff;";
  return `<${tag} style="border:1px solid #e5e7eb;padding:8px;text-align:${align};${weight}${background}font-size:12px;white-space:nowrap;">${text}</${tag}>`;
}

export function servicePricingEmailHtml(
  submission: NormalizedServicePricing & { submissionId: string },
): string {
  const name = escapeHtml(submission.providerName);
  const email = escapeHtml(submission.providerEmail);
  const phone = submission.providerPhone ? escapeHtml(submission.providerPhone) : "Not provided";
  const notes = submission.notes
    ? escapeHtml(submission.notes).replace(/\n/g, "<br>")
    : "None";
  const submissionId = escapeHtml(submission.submissionId);

  const header = [
    cell("Zip", { header: true }),
    ...PRICING_SERVICES.map((service) => cell(escapeHtml(service), { header: true })),
  ].join("");

  const rows = submission.zips
    .map((block) => {
      const prices = PRICING_SERVICES.map((service: PricingService) =>
        cell(formatUsdFromCents(block.prices[service])),
      ).join("");
      return `<tr>${cell(escapeHtml(block.zip), { align: "left" })}${prices}</tr>`;
    })
    .join("");

  return `
    <div style="font-family:sans-serif;max-width:960px;margin:0 auto;padding:32px;color:#111827;">
      <h2 style="margin:0 0 8px;">Provider service pricing</h2>
      <p style="margin:0 0 24px;color:#4b5563;">A provider submitted prices from the service pricing form.</p>
      <p style="margin:0 0 4px;"><strong>Name:</strong> ${name}</p>
      <p style="margin:0 0 4px;"><strong>Email:</strong> ${email}</p>
      <p style="margin:0 0 4px;"><strong>Phone:</strong> ${phone}</p>
      <p style="margin:0 0 20px;"><strong>Submission:</strong> ${submissionId}</p>
      <table style="border-collapse:collapse;width:100%;margin:0 0 24px;">
        <thead><tr>${header}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <h3 style="margin:0 0 8px;">Notes</h3>
      <p style="margin:0;white-space:normal;">${notes}</p>
    </div>
  `;
}

export function servicePricingEmailMessage(
  submission: NormalizedServicePricing & { submissionId: string },
): SendEmailInput {
  return {
    to: PRICING_SUPPORT_EMAIL,
    subject: servicePricingEmailSubject(submission.providerName),
    html: servicePricingEmailHtml(submission),
    replyTo: submission.providerEmail,
  };
}

export function servicePricingResendPayload(
  submission: NormalizedServicePricing & { submissionId: string },
): ResendPayload {
  return buildResendPayload(servicePricingEmailMessage(submission));
}
