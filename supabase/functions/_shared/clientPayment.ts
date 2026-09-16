/**
 * Where a care-client's Stripe ids live.
 *
 *   1. client_profiles.stripe_customer_id + payment_method_id  (canonical)
 *   2. profiles.stripe_customer_id                             (fallback; no PM column)
 *
 * Never use provider_profiles.stripe_customer_id — that is the franchise subscriber.
 */

export type ClientPaymentRef = {
  stripeCustomerId: string | null;
  paymentMethodId: string | null;
  source: "client_profiles" | "profiles" | "none";
};

export type ClientProfilesRow = {
  stripe_customer_id?: string | null;
  payment_method_id?: string | null;
} | null;

export type ProfilesRow = {
  stripe_customer_id?: string | null;
} | null;

export function resolveClientPaymentRef(
  clientProfile: ClientProfilesRow,
  sharedProfile: ProfilesRow,
): ClientPaymentRef {
  const fromClient = clientProfile?.stripe_customer_id?.trim() || null;
  const pm = clientProfile?.payment_method_id?.trim() || null;
  if (fromClient) {
    return { stripeCustomerId: fromClient, paymentMethodId: pm, source: "client_profiles" };
  }

  const fromProfiles = sharedProfile?.stripe_customer_id?.trim() || null;
  if (fromProfiles) {
    return { stripeCustomerId: fromProfiles, paymentMethodId: pm, source: "profiles" };
  }

  return { stripeCustomerId: null, paymentMethodId: pm, source: "none" };
}

export type DestinationHint = {
  connectedAccountId?: string | null;
  providerUserId?: string | null;
  bookingId?: string | null;
};

export type DestinationSource = "connectedAccountId" | "providerUserId" | "bookingId" | "none";

/** Resolution order without mobile changes. First present hint wins. */
export function destinationLookupPlan(hint: DestinationHint): DestinationSource {
  const connected = hint.connectedAccountId?.trim() || "";
  if (connected.startsWith("acct_")) return "connectedAccountId";
  if (hint.providerUserId?.trim()) return "providerUserId";
  if (hint.bookingId?.trim()) return "bookingId";
  return "none";
}

export const DESTINATION_UNRESOLVED_WARNING =
  "Charged the platform account; provider Connect destination was not resolved. Pass connectedAccountId, providerUserId, or bookingId, or assign bookings.provider_user_id.";

export function isBillableConnect(profile: {
  stripe_account_id?: string | null;
  onboarding_complete?: boolean | null;
  charges_enabled?: boolean | null;
  payouts_enabled?: boolean | null;
} | null): boolean {
  if (!profile?.stripe_account_id) return false;
  if (profile.onboarding_complete === true) return true;
  return profile.charges_enabled === true && profile.payouts_enabled === true;
}
