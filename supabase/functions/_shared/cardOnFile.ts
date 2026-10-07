/**
 * Card-on-file SetupIntent flow shared by the live and test edge functions.
 * Customer ids are stored by the injected directory (profiles, or stripe_test_fixtures in test mode).
 */

import { cardDetailsFromPaymentMethod, loadDefaultCard, type CardDetails, type CardStripe } from "./paymentMethod.ts";
import { CHARGE_MESSAGES, normalizeCustomerId } from "./bookingCharge.ts";

export interface CustomerDirectory {
  listCustomerIds(userId: string): Promise<string[]>;
  canStoreCustomer(userId: string): Promise<boolean>;
  saveCustomerId(userId: string, customerId: string): Promise<void>;
}

export interface SetupStripe extends CardStripe {
  customers: CardStripe["customers"] & {
    create(params: {
      email?: string;
      name?: string;
      metadata?: Record<string, string>;
    }): Promise<{ id: string }>;
    update(
      id: string,
      params: { invoice_settings: { default_payment_method: string } },
    ): Promise<unknown>;
  };
  setupIntents: {
    create(params: {
      customer: string;
      usage: "off_session";
      payment_method_types: string[];
      metadata?: Record<string, string>;
    }): Promise<{ id: string; client_secret: string | null }>;
    retrieve(
      id: string,
      params?: { expand?: string[] },
    ): Promise<{
      id: string;
      status: string;
      customer: string | { id?: string | null } | null;
      payment_method: string | { id?: string; type?: string; card?: CardDetailsSource } | null;
    }>;
  };
  ephemeralKeys: {
    create(
      params: { customer: string },
      options: { apiVersion: string },
    ): Promise<{ secret?: string | null }>;
  };
}

interface CardDetailsSource {
  brand?: string | null;
  last4?: string | null;
  exp_month?: number | null;
  exp_year?: number | null;
}

export interface CardHttpResult {
  status: number;
  body: Record<string, unknown> | null;
}

export function readStripeVersion(req: Request): string | null {
  const value = req.headers.get("stripe-version")?.trim();
  return value ? value : null;
}

function fail(status: number, code: string, error: string): CardHttpResult {
  return { status, body: { error, code } };
}

function cardBody(card: CardDetails): Record<string, unknown> {
  return {
    brand: card.brand,
    last4: card.last4,
    expMonth: card.expMonth,
    expYear: card.expYear,
  };
}

function isMissingCustomer(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "resource_missing");
}

async function customerStillExists(stripe: SetupStripe, customerId: string): Promise<boolean> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return Boolean(customer && !customer.deleted);
  } catch (error) {
    if (isMissingCustomer(error)) return false;
    throw error;
  }
}

export async function resolveOrCreateCustomer(
  stripe: SetupStripe,
  directory: CustomerDirectory,
  user: { id: string; email?: string | null; name?: string | null },
): Promise<{ customerId: string } | CardHttpResult> {
  const ids = await directory.listCustomerIds(user.id);
  const distinct = [...new Set(ids.map((id) => normalizeCustomerId(id)).filter((id): id is string => Boolean(id)))];
  if (distinct.length > 1) return fail(409, "multiple_customers", CHARGE_MESSAGES.multiple_customers);

  let customerId = distinct[0] ?? null;
  if (customerId && !(await customerStillExists(stripe, customerId))) customerId = null;

  if (!customerId) {
    const canStore = await directory.canStoreCustomer(user.id);
    if (!canStore) return fail(409, "no_profile", "No profile is on file for this account.");
    const created = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      metadata: {
        user_id: user.id,
        portal: "always-best-care-provider",
        source: "card_on_file",
      },
    });
    customerId = created.id;
  }

  await directory.saveCustomerId(user.id, customerId);
  return { customerId };
}

export async function createSetupIntentForUser(input: {
  stripe: SetupStripe;
  directory: CustomerDirectory;
  publishableKey: string;
  stripeVersion: string | null;
  user: { id: string; email?: string | null; name?: string | null };
}): Promise<CardHttpResult> {
  if (!input.stripeVersion) {
    return fail(400, "stripe_version_required", "stripe-version header is required");
  }
  const resolved = await resolveOrCreateCustomer(input.stripe, input.directory, input.user);
  if ("status" in resolved) return resolved;

  const setupIntent = await input.stripe.setupIntents.create({
    customer: resolved.customerId,
    usage: "off_session",
    payment_method_types: ["card"],
    metadata: { user_id: input.user.id, source: "card_on_file" },
  });
  const ephemeralKey = await input.stripe.ephemeralKeys.create(
    { customer: resolved.customerId },
    { apiVersion: input.stripeVersion },
  );
  if (!setupIntent.client_secret || !ephemeralKey.secret) {
    return fail(500, "unknown", "Could not start card setup.");
  }
  return {
    status: 200,
    body: {
      setupIntentClientSecret: setupIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customerId: resolved.customerId,
      publishableKey: input.publishableKey,
    },
  };
}

function customerIdOf(customer: string | { id?: string | null } | null): string | null {
  if (typeof customer === "string") return customer;
  if (customer && typeof customer.id === "string") return customer.id;
  return null;
}

export async function setDefaultPaymentMethodForUser(input: {
  stripe: SetupStripe;
  directory: CustomerDirectory;
  userId: string;
  setupIntentId: string;
  stripeVersion: string | null;
}): Promise<CardHttpResult> {
  if (!input.stripeVersion) {
    return fail(400, "stripe_version_required", "stripe-version header is required");
  }
  const setupIntentId = input.setupIntentId.trim();
  if (!setupIntentId.startsWith("seti_")) {
    return fail(400, "setup_intent_required", "setupIntentId is required");
  }

  const ids = (await input.directory.listCustomerIds(input.userId))
    .map((id) => normalizeCustomerId(id))
    .filter((id): id is string => Boolean(id));
  const distinct = [...new Set(ids)];
  if (distinct.length > 1) return fail(409, "multiple_customers", CHARGE_MESSAGES.multiple_customers);
  if (distinct.length === 0) return fail(422, "no_card", CHARGE_MESSAGES.no_card);
  const customerId = distinct[0];

  const setupIntent = await input.stripe.setupIntents.retrieve(setupIntentId, {
    expand: ["payment_method"],
  });
  if (customerIdOf(setupIntent.customer) !== customerId) {
    return fail(403, "forbidden", "That card setup does not belong to this customer.");
  }
  if (setupIntent.status !== "succeeded") {
    return fail(409, "setup_incomplete", "The card setup has not succeeded yet.");
  }

  const paymentMethod = setupIntent.payment_method;
  const paymentMethodId = typeof paymentMethod === "string"
    ? paymentMethod
    : paymentMethod?.id ?? null;
  if (!paymentMethodId || !paymentMethodId.startsWith("pm_")) {
    return fail(422, "no_card", CHARGE_MESSAGES.no_card);
  }

  await input.stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  const inline = paymentMethod && typeof paymentMethod === "object"
    ? cardDetailsFromPaymentMethod(paymentMethod)
    : null;
  const card = inline ?? (await loadDefaultCard(input.stripe, customerId))?.card ?? null;
  if (!card) return fail(422, "no_card", CHARGE_MESSAGES.no_card);
  return { status: 200, body: cardBody(card) };
}

export async function getPaymentMethodForUser(input: {
  stripe: SetupStripe;
  directory: CustomerDirectory;
  userId: string;
  stripeVersion: string | null;
}): Promise<CardHttpResult> {
  if (!input.stripeVersion) {
    return fail(400, "stripe_version_required", "stripe-version header is required");
  }
  const distinct = [
    ...new Set(
      (await input.directory.listCustomerIds(input.userId))
        .map((id) => normalizeCustomerId(id))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (distinct.length > 1) return fail(409, "multiple_customers", CHARGE_MESSAGES.multiple_customers);
  if (distinct.length === 0) return { status: 200, body: null };
  const loaded = await loadDefaultCard(input.stripe, distinct[0]);
  if (!loaded?.card) return { status: 200, body: null };
  return { status: 200, body: cardBody(loaded.card) };
}
