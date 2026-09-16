const GENERIC_FUNCTION_ERROR = /non-2xx status code/i;

function readErrorField(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim()) return record.error;
  if (
    typeof record.message === "string" &&
    record.message.trim() &&
    !GENERIC_FUNCTION_ERROR.test(record.message)
  ) {
    return record.message;
  }
  return null;
}

/**
 * Prefer the Edge Function JSON `{ error }` body over Supabase's generic
 * "Edge Function returned a non-2xx status code" toast.
 */
export function readFunctionError(data: unknown, error: unknown, fallback: string): string {
  const fromData = readErrorField(data);
  if (fromData) return fromData;

  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: unknown }).context;
    const fromContext = readErrorField(context);
    if (fromContext) return fromContext;
  }

  if (error instanceof Error && error.message && !GENERIC_FUNCTION_ERROR.test(error.message)) {
    return error.message;
  }

  return fallback;
}

export function isConnectComplete(flags: {
  charges_enabled?: boolean | null;
  payouts_enabled?: boolean | null;
  onboarding_complete?: boolean | null;
} | null | undefined): boolean {
  if (!flags) return false;
  return (
    flags.onboarding_complete === true ||
    (flags.charges_enabled === true && flags.payouts_enabled === true)
  );
}
