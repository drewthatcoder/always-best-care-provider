/**
 * Where a care-client's Stripe ids live (hosted DB, TEST).
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
