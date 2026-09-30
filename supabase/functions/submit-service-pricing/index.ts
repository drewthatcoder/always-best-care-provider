import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { sendResendEmail } from "../_shared/email.ts";
import { getServiceClient, getUserClient } from "../_shared/supabase.ts";
import { servicePricingEmailMessage } from "./email.ts";
import { PRICING_SERVICES, validateServicePricing } from "./validate.ts";

/**
 * Public provider service pricing form (/pricing-form).
 * verify_jwt is false so the email link works signed-out. A user JWT, when
 * present, is resolved to user_id; the anon key and invalid tokens stay null.
 *
 * Inserts with the service role, then emails tech support. If the email fails
 * after the insert, the rows stay saved and the response is still success
 * with email_sent: false.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body", messages: ["Invalid JSON body"] }, 400);
    }

    const validated = validateServicePricing(body);
    if (!validated.ok) {
      return jsonResponse({ error: validated.messages.join(" "), messages: validated.messages }, 400);
    }

    const userId = await resolveOptionalUserId(req);
    const submission = validated.value;
    const submissionId = crypto.randomUUID();
    const rows = submission.zips.flatMap((block) =>
      PRICING_SERVICES.map((service) => ({
        submission_id: submissionId,
        provider_name: submission.providerName,
        provider_email: submission.providerEmail,
        provider_phone: submission.providerPhone,
        user_id: userId,
        zip: block.zip,
        service,
        price_cents: block.prices[service],
        notes: submission.notes,
      })),
    );

    const serviceClient = getServiceClient();
    const { error: insertError } = await serviceClient.from("provider_service_pricing").insert(rows);
    if (insertError) {
      console.error("submit-service-pricing: insert failed", insertError);
      return jsonResponse({ error: "Could not save pricing" }, 500);
    }

    const emailResult = await sendResendEmail(
      servicePricingEmailMessage({ ...submission, submissionId }),
    );
    if (!emailResult.ok) {
      console.error("submit-service-pricing: saved submission but email failed", {
        submissionId,
        error: emailResult.error,
      });
      return jsonResponse({ success: true, submission_id: submissionId, email_sent: false });
    }

    return jsonResponse({ success: true, submission_id: submissionId, email_sent: true });
  } catch (err) {
    console.error("submit-service-pricing:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

async function resolveOptionalUserId(req: Request): Promise<string | null> {
  const header = req.headers.get("Authorization");
  if (!header || !/^Bearer\s+\S+/i.test(header)) return null;
  try {
    const token = header.replace(/^Bearer\s+/i, "").trim();
    const client = getUserClient(header);
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch (err) {
    console.error("submit-service-pricing: could not resolve user", err);
    return null;
  }
}
