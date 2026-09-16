import { AGREEMENT_RETURN_EMAIL, EMAIL_FROM } from "../_shared/email.ts";
import {
  AGREEMENT_CONTENT_TYPE,
  AGREEMENT_FILENAME,
} from "./agreementAttachment.ts";

export { AGREEMENT_CONTENT_TYPE, AGREEMENT_FILENAME, AGREEMENT_RETURN_EMAIL, EMAIL_FROM };

export const AGREEMENT_SUBJECT = "Please sign and return the Agency Subscriber Agreement";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function greetingName(firstName: unknown): string {
  if (typeof firstName === "string" && firstName.trim()) return firstName.trim();
  return "there";
}

export function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const email = value.trim();
  return email.includes("@") && email.length >= 3 && !email.includes(" ");
}

export function agreementEmailSubject(): string {
  return AGREEMENT_SUBJECT;
}

export function agreementEmailHtml(firstName: string): string {
  const name = escapeHtml(greetingName(firstName));
  const returnTo = escapeHtml(AGREEMENT_RETURN_EMAIL);
  return `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #111827;">Agency Subscriber Agreement</h2>
          <p>Hi ${name},</p>
          <p>Thank you for creating your Always Best Care provider account.</p>
          <p>Please download the attached Agency Subscriber Agreement, sign it, and email the signed copy to
            <a href="mailto:${returnTo}">${returnTo}</a>.
          </p>
          <p style="margin-top: 32px; color: #6b7280; font-size: 14px;">Always Best Care</p>
        </div>
      `;
}

export function buildAgreementResendBody(options: {
  to: string;
  firstName: string;
  attachmentBase64: string;
}): {
  from: string;
  to: string[];
  subject: string;
  html: string;
  attachments: Array<{ filename: string; content: string; content_type: string }>;
} {
  return {
    from: EMAIL_FROM,
    to: [options.to.trim()],
    subject: agreementEmailSubject(),
    html: agreementEmailHtml(options.firstName),
    attachments: [
      {
        filename: AGREEMENT_FILENAME,
        content: options.attachmentBase64,
        content_type: AGREEMENT_CONTENT_TYPE,
      },
    ],
  };
}
