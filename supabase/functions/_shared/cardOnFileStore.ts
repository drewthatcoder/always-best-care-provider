/**
 * Where a client's Stripe customer id is stored.
 * Live: profiles.stripe_customer_id on every row for that user.
 * Test: stripe_test_fixtures only. Never profiles or provider_profiles.
 */

import { type CustomerDirectory } from "./cardOnFile.ts";
import { normalizeCustomerId } from "./bookingCharge.ts";

export interface ProfileAdmin {
  from(table: string): {
    select(columns: string): QueryChain;
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): Promise<{ error: { message: string } | null }>;
    };
    insert(values: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
  };
}

interface QueryChain extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  eq(column: string, value: unknown): QueryChain;
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
}

async function listRows(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];
  return data.filter((row) => row && typeof row === "object") as Record<string, unknown>[];
}

export function createLiveCustomerDirectory(admin: ProfileAdmin): CustomerDirectory {
  return {
    async listCustomerIds(userId: string): Promise<string[]> {
      const rows = await listRows(
        admin.from("profiles").select("stripe_customer_id").eq("user_id", userId),
      );
      return rows
        .map((row) => normalizeCustomerId(row.stripe_customer_id))
        .filter((id): id is string => Boolean(id));
    },
    async canStoreCustomer(userId: string): Promise<boolean> {
      const rows = await listRows(admin.from("profiles").select("user_id").eq("user_id", userId));
      return rows.length > 0;
    },
    async saveCustomerId(userId: string, customerId: string): Promise<void> {
      const { error } = await admin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    },
  };
}

export function createTestCustomerDirectory(admin: ProfileAdmin): CustomerDirectory {
  return {
    async listCustomerIds(userId: string): Promise<string[]> {
      const { data, error } = await admin
        .from("stripe_test_fixtures")
        .select("stripe_customer_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
      const id = normalizeCustomerId(row?.stripe_customer_id);
      return id ? [id] : [];
    },
    async canStoreCustomer(): Promise<boolean> {
      return true;
    },
    async saveCustomerId(userId: string, customerId: string): Promise<void> {
      const existing = await admin
        .from("stripe_test_fixtures")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data) {
        const { error } = await admin
          .from("stripe_test_fixtures")
          .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
          .eq("user_id", userId);
        if (error) throw new Error(error.message);
        return;
      }
      const { error } = await admin.from("stripe_test_fixtures").insert({
        user_id: userId,
        stripe_customer_id: customerId,
      });
      if (error) throw new Error(error.message);
    },
  };
}
