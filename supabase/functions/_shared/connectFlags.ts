import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type ConnectFlags = {
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  onboarding_complete: boolean;
};

export function flagsFromAccount(account: {
  charges_enabled?: boolean | null;
  payouts_enabled?: boolean | null;
  details_submitted?: boolean | null;
}): ConnectFlags {
  const charges_enabled = Boolean(account.charges_enabled);
  const payouts_enabled = Boolean(account.payouts_enabled);
  const details_submitted = Boolean(account.details_submitted);
  return {
    charges_enabled,
    payouts_enabled,
    details_submitted,
    onboarding_complete: details_submitted && charges_enabled && payouts_enabled,
  };
}

export async function persistConnectFlags(
  admin: SupabaseClient,
  stripeAccountId: string,
  flags: ConnectFlags,
): Promise<{ persisted: boolean; warning?: string; error?: string }> {
  const { error, count } = await admin
    .from("provider_profiles")
    .update(flags)
    .eq("stripe_account_id", stripeAccountId)
    .select("id", { count: "exact", head: true });

  if (error) {
    const missingColumn = /column .* does not exist/i.test(error.message);
    console.error("persistConnectFlags failed", error.message);
    if (missingColumn) {
      return {
        persisted: false,
        warning:
          "provider_profiles status columns are missing. Run supabase/migrations/20260915214100_provider_connect_status.sql in the SQL Editor.",
      };
    }
    return { persisted: false, error: error.message };
  }

  return { persisted: (count ?? 0) > 0 };
}
