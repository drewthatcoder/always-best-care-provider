/**
 * Supabase reads for provider charges.
 * Live mode uses client_profiles / profiles / provider_profiles.
 * Test mode uses stripe_test_fixtures only for Stripe ids, never profiles or provider_profiles.
 */

import { isBillableConnect } from "./clientPayment.ts";
import {
  isAccountId,
  mapBookingRow,
  resolveFixtureCustomer,
  resolveStoredCustomer,
  type BookingForCharge,
  type ChargeStore,
  type CustomerResolution,
  type DestinationResolution,
  type FinalizeChargeArgs,
} from "./bookingCharge.ts";

export interface ChargeAdmin {
  from(table: string): {
    select(columns: string): QueryChain;
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): Promise<{ error: { message: string } | null }>;
    };
    insert(values: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
  };
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

interface QueryChain extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  eq(column: string, value: unknown): QueryChain;
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
}

function unwrapRow(data: unknown): Record<string, unknown> | null {
  if (!data) return null;
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  return typeof data === "object" ? (data as Record<string, unknown>) : null;
}

async function rowsOf(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];
  return data.filter((row) => row && typeof row === "object") as Record<string, unknown>[];
}

function displayName(rows: Record<string, unknown>[]): string {
  for (const row of rows) {
    const first = typeof row.first_name === "string" ? row.first_name.trim() : "";
    const last = typeof row.last_name === "string" ? row.last_name.trim() : "";
    const name = [first, last].filter(Boolean).join(" ");
    if (name) return name;
  }
  return "Client";
}

export function createChargeStore(admin: ChargeAdmin, options: { mode: "live" | "test" }): ChargeStore {
  const mode = options.mode;

  return {
    async getBooking(bookingId: string): Promise<BookingForCharge | null> {
      const { data, error } = await admin.from("bookings").select("*").eq("id", bookingId).maybeSingle();
      if (error) throw new Error(error.message);
      return mapBookingRow(unwrapRow(data));
    },

    async clientName(clientUserId: string): Promise<string> {
      if (mode === "test") return "Client";
      const rows = await rowsOf(
        admin.from("profiles").select("first_name, last_name").eq("user_id", clientUserId),
      );
      return displayName(rows);
    },

    async resolveCustomer(clientUserId: string): Promise<CustomerResolution> {
      if (mode === "test") {
        const { data, error } = await admin
          .from("stripe_test_fixtures")
          .select("stripe_customer_id")
          .eq("user_id", clientUserId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        const row = unwrapRow(data);
        return resolveFixtureCustomer(row?.stripe_customer_id);
      }

      const clientProfile = await admin
        .from("client_profiles")
        .select("stripe_customer_id")
        .eq("user_id", clientUserId)
        .maybeSingle();
      if (clientProfile.error) throw new Error(clientProfile.error.message);

      const profiles = await rowsOf(
        admin.from("profiles").select("stripe_customer_id").eq("user_id", clientUserId),
      );
      return resolveStoredCustomer(
        unwrapRow(clientProfile.data)?.stripe_customer_id,
        profiles.map((row) => row.stripe_customer_id),
      );
    },

    async resolveDestination(providerUserId: string): Promise<DestinationResolution> {
      if (mode === "test") {
        const { data, error } = await admin
          .from("stripe_test_fixtures")
          .select("stripe_account_id")
          .eq("user_id", providerUserId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        const accountId = unwrapRow(data)?.stripe_account_id;
        if (!isAccountId(accountId)) {
          return { destination: null, ready: false, verifyOnStripe: false };
        }
        return { destination: accountId, ready: false, verifyOnStripe: true };
      }

      const { data, error } = await admin
        .from("provider_profiles")
        .select("stripe_account_id, onboarding_complete, charges_enabled, payouts_enabled")
        .eq("user_id", providerUserId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = unwrapRow(data);
      const accountId = typeof row?.stripe_account_id === "string" ? row.stripe_account_id : null;
      const ready = isBillableConnect({
        stripe_account_id: accountId,
        onboarding_complete: row?.onboarding_complete === true,
        charges_enabled: row?.charges_enabled === true,
        payouts_enabled: row?.payouts_enabled === true,
      }) && isAccountId(accountId);
      return {
        destination: ready ? accountId : null,
        ready,
        verifyOnStripe: false,
      };
    },

    async claim(bookingId: string, providerUserId: string): Promise<BookingForCharge | null> {
      const { data, error } = await admin.rpc("claim_booking_for_charge", {
        p_booking_id: bookingId,
        p_provider_id: providerUserId,
      });
      if (error) throw new Error(error.message);
      return mapBookingRow(unwrapRow(data));
    },

    async finalize(args: FinalizeChargeArgs): Promise<void> {
      const { data, error } = await admin.rpc("finalize_booking_charge", {
        p_booking_id: args.bookingId,
        p_success: args.success,
        p_payment_intent_id: args.paymentIntentId,
        p_amount_cents: args.amountCents,
        p_livemode: args.livemode,
        p_destination: args.destination,
        p_error: args.error,
      });
      if (error) throw new Error(error.message);
      if (!unwrapRow(data)) {
        throw new Error(`finalize_booking_charge updated 0 rows for booking ${args.bookingId}`);
      }
    },
  };
}
