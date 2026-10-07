/** QA users allowed to call the test-mode charge and card functions. */
export const DEFAULT_QA_USER_IDS = [
  "5a5486f5-1058-4091-aa03-b09c916b8da0",
  "6b0f27b4-e015-4c3a-972d-8191c94043ba",
] as const;

/**
 * `undefined` (env unset) uses the default QA ids.
 * A set value, including an empty string, is parsed as a comma-separated list.
 */
export function parseQaUserIds(raw: string | undefined): string[] {
  if (raw === undefined) return [...DEFAULT_QA_USER_IDS];
  return raw.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
}

export function qaUserIdSet(raw: string | undefined): Set<string> {
  return new Set(parseQaUserIds(raw));
}
