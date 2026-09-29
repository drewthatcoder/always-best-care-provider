/** Shared Resend identity. Do not invent a new from-domain without checking hosted secrets. */
export const EMAIL_FROM = "CareConnect <onboarding@resend.dev>";
export const AGREEMENT_RETURN_EMAIL = "dbarbee@abc-seniors.com";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  /** Provider address. Sent to Resend as reply_to. */
  replyTo?: string;
};

export type ResendPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  reply_to?: string;
};

export type SendEmailResult = { ok: true } | { ok: false; error: string };

export function buildResendPayload(input: SendEmailInput): ResendPayload {
  const to = (Array.isArray(input.to) ? input.to : [input.to]).map((value) => value.trim()).filter(Boolean);
  const payload: ResendPayload = {
    from: EMAIL_FROM,
    to,
    subject: input.subject,
    html: input.html,
  };
  const replyTo = input.replyTo?.replace(/[\r\n]/g, "").trim();
  if (replyTo) payload.reply_to = replyTo;
  return payload;
}

function resendApiKey(): string | undefined {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env: { get(name: string): string | undefined } };
  };
  return runtime.Deno?.env.get("RESEND_API_KEY");
}

/** Send one HTML email through Resend. replyTo is optional and maps to reply_to. */
export async function sendResendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = resendApiKey();
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not configured" };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildResendPayload(input)),
    });
    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, error: errorText || `Resend status ${response.status}` };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email send failed";
    return { ok: false, error: message };
  }
}
