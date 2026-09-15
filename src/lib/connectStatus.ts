export type ConnectProfile = {
  stripe_account_id: string | null;
  charges_enabled?: boolean | null;
  payouts_enabled?: boolean | null;
  details_submitted?: boolean | null;
  onboarding_complete?: boolean | null;
};

export type ConnectStatus = "not_started" | "incomplete" | "restricted" | "connected";

export function deriveConnectStatus(profile: ConnectProfile | null | undefined): ConnectStatus {
  if (!profile?.stripe_account_id) return "not_started";

  if (
    profile.onboarding_complete === true ||
    (profile.charges_enabled === true && profile.payouts_enabled === true)
  ) {
    return "connected";
  }

  if (
    profile.details_submitted === true &&
    (profile.charges_enabled === false || profile.payouts_enabled === false)
  ) {
    return "restricted";
  }

  return "incomplete";
}

export const CONNECT_STATUS_LABEL: Record<ConnectStatus, string> = {
  not_started: "Not started",
  incomplete: "Incomplete",
  restricted: "Restricted",
  connected: "Connected",
};

export const CONNECT_STATUS_ACTION: Record<ConnectStatus, string> = {
  not_started: "Set up payouts",
  incomplete: "Continue Stripe setup",
  restricted: "Fix Stripe restrictions",
  connected: "Update Stripe details",
};
