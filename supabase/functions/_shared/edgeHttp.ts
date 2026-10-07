import { jsonResponse } from "./cors.ts";

/** Log the real message. Never echo a secret key. Config errors stay specific. */
export function edgeFailure(scope: string, error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(scope, message);
  if (
    message.startsWith("STRIPE_") ||
    message.startsWith("APPLICATION_FEE_BPS") ||
    message.includes("must start with sk_test_") ||
    message.includes("must start with pk_test_") ||
    message.includes("mode does not match")
  ) {
    return jsonResponse({ error: message, code: "not_configured" }, 500);
  }
  return jsonResponse({ error: "Something went wrong", code: "unknown" }, 500);
}