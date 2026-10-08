/**
 * QA users allowed to call the test-mode charge and card functions.
 * Hardcoded. An env var must not widen which production bookings a test
 * PaymentIntent can mark completed.
 */
export const QA_USER_IDS = [
  "5a5486f5-1058-4091-aa03-b09c916b8da0",
  "6b0f27b4-e015-4c3a-972d-8191c94043ba",
] as const;

export function qaUserIdSet(): ReadonlySet<string> {
  return new Set(QA_USER_IDS);
}
