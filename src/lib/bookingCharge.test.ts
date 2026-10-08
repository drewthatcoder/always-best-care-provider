import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  CHARGE_MESSAGES,
  bookingChargeIdempotencyKey,
  bookingPriceCents,
  chargeAmountCents,
  chargeBooking,
  mapStripeError,
  paymentIntentMatchesBooking,
  previewBookingCharge,
  resolveFixtureCustomer,
  resolveStoredCustomer,
  serviceLabel,
  serviceTokens,
  stripeApiType,
  stripeErrorPaymentIntent,
  succeededChargeSearchQuery,
  type BookingChargeDeps,
  type BookingForCharge,
  type ChargeStore,
} from "../../supabase/functions/_shared/bookingCharge.ts";
import { createChargeStore } from "../../supabase/functions/_shared/bookingChargeStore.ts";
import { createSetupIntentForUser, ephemeralKeyApiVersion, getPaymentMethodForUser, setDefaultPaymentMethodForUser } from "../../supabase/functions/_shared/cardOnFile.ts";
import { createTestCustomerDirectory } from "../../supabase/functions/_shared/cardOnFileStore.ts";
import { QA_USER_IDS, qaUserIdSet } from "../../supabase/functions/_shared/qaAllowlist.ts";
import { STRIPE_API_VERSION } from "../../supabase/functions/_shared/stripeApiVersion.ts";
import {
  NO_CARD_MESSAGE,
  chargeConfirmationText,
  chargeConfirmBlocked,
  chargeFunctionName,
  interpretChargeResponse,
  isCompleteAndChargeFlag,
  messageForChargeCode,
  readInvokePayload,
} from "./bookingCharge";

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";

function booking(over: Partial<BookingForCharge> = {}): BookingForCharge {
  return {
    id: BOOKING_ID,
    status: "approved",
    service: "dressing",
    scheduled_date: "2026-12-02",
    client_user_id: "client-1",
    provider_user_id: "provider-1",
    price_cents: 5500,
    payment_status: "unpaid",
    payment_intent_id: null,
    charge_attempts: 0,
    ...over,
  };
}

function cardCustomer() {
  return {
    id: "cus_1",
    deleted: false,
    invoice_settings: {
      default_payment_method: {
        id: "pm_1",
        type: "card",
        card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2028 },
      },
    },
  };
}

describe("booking price formula", () => {
  it("matches mobile: 5500 for each of the first two services, 4500 after", () => {
    expect(bookingPriceCents("dressing")).toBe(5500);
    expect(bookingPriceCents("bathing, dressing")).toBe(11000);
    expect(bookingPriceCents("bathing, dressing, meal")).toBe(15500);
    expect(bookingPriceCents("a, b, c, d")).toBe(20000);
  });

  it("ignores empty comma tokens", () => {
    expect(serviceTokens(" bathing , , dressing ")).toEqual(["bathing", "dressing"]);
    expect(bookingPriceCents(" bathing , , dressing ")).toBe(11000);
    expect(bookingPriceCents("")).toBe(0);
    expect(bookingPriceCents(null)).toBe(0);
  });

  it("uses a stored snapshot and otherwise prices the service", () => {
    expect(chargeAmountCents(5500, "a, b, c")).toBe(5500);
    expect(chargeAmountCents(null, "dressing")).toBe(5500);
    expect(chargeAmountCents(0, "dressing")).toBe(5500);
  });

  it("labels services the way the confirmation sentence shows them", () => {
    expect(serviceLabel("dressing")).toBe("Dressing");
    expect(serviceLabel("bathing, dressing")).toBe("Bathing, Dressing");
  });
});

describe("idempotency key", () => {
  it("builds booking-charge:<id>:<attempt>", () => {
    expect(bookingChargeIdempotencyKey(BOOKING_ID, 0)).toBe(`booking-charge:${BOOKING_ID}:0`);
    expect(bookingChargeIdempotencyKey(BOOKING_ID, 2)).toBe(`booking-charge:${BOOKING_ID}:2`);
  });

  it("searches succeeded charges by booking id", () => {
    expect(succeededChargeSearchQuery(BOOKING_ID)).toBe(
      `metadata['booking_id']:'${BOOKING_ID}' AND status:'succeeded'`,
    );
  });
});

describe("customer resolution", () => {
  it("prefers client_profiles, then one distinct profiles customer", () => {
    expect(resolveStoredCustomer("cus_client", ["cus_other", "cus_other"])).toEqual({
      ok: true,
      customerId: "cus_client",
      source: "client_profiles",
    });
    expect(resolveStoredCustomer(null, ["cus_same", null, " cus_same "])).toEqual({
      ok: true,
      customerId: "cus_same",
      source: "profiles",
    });
  });

  it("fails when profiles disagree or nobody has a customer", () => {
    expect(resolveStoredCustomer(null, ["cus_a", "cus_b"])).toEqual({ ok: false, code: "multiple_customers" });
    expect(resolveStoredCustomer("", [null, "  "])).toEqual({ ok: false, code: "no_card" });
  });

  it("reads a single fixture customer in test mode", () => {
    expect(resolveFixtureCustomer("cus_test")).toEqual({
      ok: true,
      customerId: "cus_test",
      source: "fixtures",
    });
    expect(resolveFixtureCustomer(null)).toEqual({ ok: false, code: "no_card" });
  });
});

describe("stripe error mapping", () => {
  it("maps declines, authentication, and everything else", () => {
    expect(mapStripeError({ type: "card_error", code: "card_declined", message: "Your card was declined." })).toMatchObject({
      httpStatus: 402,
      code: "card_declined",
      error: "Your card was declined.",
    });
    expect(mapStripeError({ code: "authentication_required", message: "Authentication required" })).toMatchObject({
      httpStatus: 402,
      code: "authentication_required",
    });
    expect(mapStripeError({ message: "network" })).toMatchObject({ httpStatus: 500, code: "unknown" });
    expect(mapStripeError({
      type: "invalid_request_error",
      message: "The destination account does not have transfers enabled.",
    })).toMatchObject({ httpStatus: 409, code: "stripe_config_error" });
    expect(mapStripeError({ type: "idempotency_error", message: "Keys for idempotent requests can only be used with the same parameters." })).toMatchObject({
      httpStatus: 409,
      code: "stripe_config_error",
    });
    expect(stripeApiType({
      type: "StripeInvalidRequestError",
      rawType: "invalid_request_error",
      raw: { type: "card_error" },
    })).toBe("invalid_request_error");
    expect(mapStripeError({
      type: "StripeInvalidRequestError",
      rawType: "invalid_request_error",
      message: "No such destination",
    })).toMatchObject({ httpStatus: 409, code: "stripe_config_error", error: "No such destination" });
    expect(mapStripeError({
      type: "StripeInvalidRequestError",
      raw: { type: "invalid_request_error" },
      message: "No such destination",
    })).toMatchObject({ httpStatus: 409, code: "stripe_config_error" });
    expect(mapStripeError({
      type: "StripeCardError",
      rawType: "card_error",
      code: "card_declined",
      message: "Your card was declined.",
    })).toMatchObject({ httpStatus: 402, code: "card_declined" });
  });

  it("matches a listed payment intent only for this booking and a blocking status", () => {
    const bookingId = BOOKING_ID;
    expect(paymentIntentMatchesBooking({ id: "pi_1", status: "processing", metadata: { booking_id: bookingId } }, bookingId)).toBe(true);
    expect(paymentIntentMatchesBooking({ id: "pi_2", status: "requires_capture", metadata: { booking_id: bookingId } }, bookingId)).toBe(true);
    expect(paymentIntentMatchesBooking({ id: "pi_3", status: "canceled", metadata: { booking_id: bookingId } }, bookingId)).toBe(false);
    expect(paymentIntentMatchesBooking({ id: "pi_4", status: "succeeded", metadata: { booking_id: "other" } }, bookingId)).toBe(false);
  });
});

function deps(store: ChargeStore, stripe: BookingChargeDeps["stripe"], mode: "live" | "test" = "live"): BookingChargeDeps {
  return { stripe, store, mode };
}

function happyStripe(create = vi.fn(async (
  params: Record<string, unknown>,
  _options?: { idempotencyKey?: string },
) => ({
  id: "pi_new",
  status: "succeeded",
  amount: params.amount as number,
  livemode: false,
  transfer_data: params.transfer_data as { destination: string },
}))) {
  return {
    create,
    stripe: {
      customers: { retrieve: vi.fn(async () => cardCustomer()) },
      paymentMethods: { list: vi.fn(async () => ({ data: [] })) },
      paymentIntents: {
        search: vi.fn(async () => ({ data: [] })),
        list: vi.fn(async () => ({ data: [] })),
        create,
      },
      accounts: { retrieve: vi.fn(async () => ({ id: "acct_1", charges_enabled: true, payouts_enabled: true })) },
    } as unknown as BookingChargeDeps["stripe"],
  };
}

function storeFor(current: BookingForCharge, overrides: Partial<ChargeStore> = {}) {
  const claim = vi.fn(overrides.claim ?? (async () => ({
    ...current,
    payment_status: "processing",
    charge_attempts: current.charge_attempts ?? 0,
  })));
  const finalize = vi.fn(overrides.finalize ?? (async () => undefined));
  return {
    getBooking: vi.fn(async () => current),
    clientName: vi.fn(async () => "Ann Lee"),
    resolveCustomer: vi.fn(overrides.resolveCustomer ?? (async () => ({
      ok: true as const,
      customerId: "cus_1",
      source: "profiles" as const,
    }))),
    resolveDestination: vi.fn(overrides.resolveDestination ?? (async () => ({
      destination: "acct_1",
      ready: true,
      verifyOnStripe: false,
    }))),
    claim,
    finalize,
  };
}

describe("chargeBooking", () => {
  it("charges the server amount off session onto the provider account", async () => {
    const current = booking({ charge_attempts: 0 });
    const store = storeFor(current, {
      claim: vi.fn(async () => ({ ...current, payment_status: "processing", charge_attempts: 2 })),
    });
    const { stripe, create } = happyStripe();
    const result = await chargeBooking({ bookingId: current.id, providerUserId: "provider-1" }, deps(store, stripe));
    expect(result.status).toBe(200);
    expect(result.body.paymentIntentId).toBe("pi_new");
    expect(create).toHaveBeenCalledTimes(1);
    const [params, options] = create.mock.calls[0];
    expect(params.amount).toBe(5500);
    expect(params.confirm).toBe(true);
    expect(params.off_session).toBe(true);
    expect(params.transfer_data).toEqual({ destination: "acct_1" });
    expect(params).not.toHaveProperty("application_fee_amount");
    expect(params.metadata).toMatchObject({ booking_id: current.id, source: "provider_complete" });
    expect(options).toEqual({ idempotencyKey: `booking-charge:${current.id}:2` });
    expect(store.finalize).toHaveBeenCalledWith(expect.objectContaining({ success: true, paymentIntentId: "pi_new" }));
  });

  it("adopts an existing succeeded charge and does not create another", async () => {
    const current = booking();
    const store = storeFor(current);
    const create = vi.fn();
    const stripe = happyStripe().stripe;
    stripe.paymentIntents.search = vi.fn(async () => ({
      data: [{ id: "pi_old", status: "succeeded", amount: 5500, livemode: true, transfer_data: { destination: "acct_live" } }],
    }));
    stripe.paymentIntents.create = create;
    const result = await chargeBooking({ bookingId: current.id, providerUserId: "provider-1" }, deps(store, stripe));
    expect(create).not.toHaveBeenCalled();
    expect(result.status).toBe(200);
    expect(result.body.code).toBe("already_charged");
    expect(result.body.paymentIntentId).toBe("pi_old");
  });

  it("records a decline and leaves the booking uncharged", async () => {
    const current = booking();
    const store = storeFor(current);
    const stripe = happyStripe().stripe;
    stripe.paymentIntents.create = vi.fn(async () => {
      throw { type: "card_error", code: "card_declined", message: "Your card was declined." };
    });
    const result = await chargeBooking({ bookingId: current.id, providerUserId: "provider-1" }, deps(store, stripe));
    expect(result).toEqual({
      status: 402,
      body: { error: "Your card was declined.", code: "card_declined" },
    });
    expect(store.finalize).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: "Your card was declined.", paymentIntentId: null }));
  });

  it("stores the declined PaymentIntent id from the Stripe card error", async () => {
    const current = booking();
    const store = storeFor(current);
    const stripe = happyStripe().stripe;
    stripe.paymentIntents.create = vi.fn(async () => {
      throw {
        type: "StripeCardError",
        rawType: "card_error",
        code: "card_declined",
        decline_code: "generic_decline",
        message: "Your card was declined.",
        payment_intent: { id: "pi_declined", status: "requires_payment_method", livemode: false },
      };
    });
    const result = await chargeBooking({ bookingId: current.id, providerUserId: "provider-1" }, deps(store, stripe));
    expect(result.status).toBe(402);
    expect(store.finalize).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      paymentIntentId: "pi_declined",
      livemode: false,
    }));
  });

  it("reads the declined PaymentIntent from the error or its raw body, and ignores junk", () => {
    expect(stripeErrorPaymentIntent({ payment_intent: { id: "pi_a", livemode: true } })).toEqual({ id: "pi_a", livemode: true });
    expect(stripeErrorPaymentIntent({ raw: { payment_intent: { id: "pi_b" } } })).toEqual({ id: "pi_b", livemode: null });
    expect(stripeErrorPaymentIntent({ payment_intent: { id: "seti_x" } })).toBeNull();
    expect(stripeErrorPaymentIntent({ message: "no intent" })).toBeNull();
    expect(stripeErrorPaymentIntent(null)).toBeNull();
  });

  it("records a deterministic Stripe error as failed so the next attempt can use a new key", async () => {
    const current = booking();
    const store = storeFor(current);
    const stripe = happyStripe().stripe;
    stripe.paymentIntents.create = vi.fn(async () => {
      throw { type: "invalid_request_error", message: "The destination account is invalid." };
    });
    const result = await chargeBooking({ bookingId: current.id, providerUserId: "provider-1" }, deps(store, stripe));
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("stripe_config_error");
    expect(store.finalize).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it("adopts an existing charge when Stripe returns an idempotency error", async () => {
    const current = booking();
    const store = storeFor(current);
    const { stripe } = happyStripe();
    stripe.paymentIntents.create = vi.fn(async () => {
      throw {
        type: "StripeIdempotencyError",
        rawType: "idempotency_error",
        message: "Keys for idempotent requests can only be used with the same parameters they were first used with.",
      };
    });
    let lookups = 0;
    stripe.paymentIntents.list = vi.fn(async () => {
      lookups += 1;
      if (lookups === 1) return { data: [] };
      return {
        data: [{
          id: "pi_existing",
          status: "processing",
          amount: 5500,
          metadata: { booking_id: current.id },
          transfer_data: { destination: "acct_1" },
        }],
      };
    });
    const result = await chargeBooking({ bookingId: current.id, providerUserId: "provider-1" }, deps(store, stripe));
    expect(result.status).toBe(200);
    expect(result.body.code).toBe("already_charged");
    expect(result.body.paymentIntentId).toBe("pi_existing");
    expect(store.finalize).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      paymentIntentId: "pi_existing",
    }));
  });

  it("marks an idempotency error failed when no charge exists for the booking", async () => {
    const current = booking();
    const store = storeFor(current);
    const stripe = happyStripe().stripe;
    stripe.paymentIntents.create = vi.fn(async () => {
      throw { type: "StripeIdempotencyError", rawType: "idempotency_error", message: "Keys for idempotent requests can only be used with the same parameters." };
    });
    const result = await chargeBooking({ bookingId: current.id, providerUserId: "provider-1" }, deps(store, stripe));
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("stripe_config_error");
    expect(store.finalize).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it("leaves a transient Stripe error in processing", async () => {
    const current = booking();
    const store = storeFor(current);
    const stripe = happyStripe().stripe;
    stripe.paymentIntents.create = vi.fn(async () => {
      throw { type: "api_connection_error", message: "network" };
    });
    const result = await chargeBooking({ bookingId: current.id, providerUserId: "provider-1" }, deps(store, stripe));
    expect(result.status).toBe(500);
    expect(result.body.code).toBe("unknown");
    expect(store.finalize).not.toHaveBeenCalled();
  });

  it("adopts a succeeded charge found on the customer list when search is empty", async () => {
    const current = booking();
    const store = storeFor(current);
    const { stripe, create } = happyStripe();
    stripe.paymentIntents.list = vi.fn(async () => ({
      data: [{
        id: "pi_listed",
        status: "succeeded",
        amount: 5500,
        livemode: false,
        metadata: { booking_id: current.id },
        transfer_data: { destination: "acct_1" },
      }],
    }));
    const result = await chargeBooking({ bookingId: current.id, providerUserId: "provider-1" }, deps(store, stripe));
    expect(create).not.toHaveBeenCalled();
    expect(result.status).toBe(200);
    expect(result.body.code).toBe("already_charged");
    expect(result.body.paymentIntentId).toBe("pi_listed");
  });

  it("does not create another charge when a processing intent is already on the customer", async () => {
    const current = booking();
    const store = storeFor(current);
    const { stripe, create } = happyStripe();
    stripe.paymentIntents.list = vi.fn(async () => ({
      data: [{ id: "pi_open", status: "processing", metadata: { booking_id: current.id } }],
    }));
    const result = await chargeBooking({ bookingId: current.id, providerUserId: "provider-1" }, deps(store, stripe));
    expect(create).not.toHaveBeenCalled();
    expect(store.finalize).not.toHaveBeenCalled();
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("in_progress");
  });

  it("returns 500 and does not claim success when finalize updates no rows", async () => {
    const current = booking();
    const store = storeFor(current, {
      finalize: async () => {
        throw new Error("finalize_booking_charge updated 0 rows");
      },
    });
    const { stripe } = happyStripe();
    const result = await chargeBooking({ bookingId: current.id, providerUserId: "provider-1" }, deps(store, stripe));
    expect(result.status).toBe(500);
    expect(result.body.code).toBe("unknown");
    expect(result.body.paymentIntentId).toBeUndefined();
  });

  it("does not charge when the card, customer, or payout account is missing", async () => {
    const current = booking();
    const noCard = storeFor(current, {
      resolveCustomer: vi.fn(async () => ({ ok: false as const, code: "no_card" as const })),
    });
    const stripe = happyStripe().stripe;
    const missing = await chargeBooking({ bookingId: current.id, providerUserId: "provider-1" }, deps(noCard, stripe));
    expect(missing.status).toBe(422);
    expect(missing.body.code).toBe("no_card");
    expect(noCard.claim).not.toHaveBeenCalled();

    const many = storeFor(current, {
      resolveCustomer: vi.fn(async () => ({ ok: false as const, code: "multiple_customers" as const })),
    });
    expect((await chargeBooking({ bookingId: current.id, providerUserId: "provider-1" }, deps(many, stripe))).body.code).toBe("multiple_customers");

    const unpaid = storeFor(current, {
      resolveDestination: vi.fn(async () => ({ destination: null, ready: false, verifyOnStripe: false })),
    });
    const notPayable = await chargeBooking({ bookingId: current.id, providerUserId: "provider-1" }, deps(unpaid, stripe));
    expect(notPayable.status).toBe(412);
    expect(notPayable.body.code).toBe("provider_not_payable");
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("rejects the wrong provider and a booking that is not approved", async () => {
    const current = booking();
    const store = storeFor(current);
    const stripe = happyStripe().stripe;
    expect((await chargeBooking({ bookingId: current.id, providerUserId: "other" }, deps(store, stripe))).status).toBe(403);
    const pending = storeFor(booking({ status: "pending_client" }));
    expect((await chargeBooking({ bookingId: current.id, providerUserId: "provider-1" }, deps(pending, stripe))).body.code).toBe("not_approved");
  });

  it("previews the server amount and card without charging", async () => {
    const current = booking();
    const store = storeFor(current);
    const { stripe, create } = happyStripe();
    const result = await previewBookingCharge({ bookingId: current.id, providerUserId: "provider-1" }, deps(store, stripe));
    expect(create).not.toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      amountCents: 5500,
      serviceLabel: "Dressing",
      scheduledDate: "2026-12-02",
      card: { brand: "visa", last4: "4242" },
      connectReady: true,
      code: null,
    });
  });
});

describe("charge store", () => {
  it("does not read profiles or provider_profiles in test mode", async () => {
    const calls: string[] = [];
    const admin = {
      from(table: string) {
        calls.push(table);
        if (table === "profiles" || table === "provider_profiles") {
          throw new Error(`test mode touched ${table}`);
        }
        const chain = {
          eq() { return chain; },
          maybeSingle: async () => ({
            data: table === "stripe_test_fixtures" ? { stripe_customer_id: "cus_qa", stripe_account_id: "acct_qa" } : null,
            error: null,
          }),
          then(resolve: (value: { data: unknown; error: null }) => unknown) {
            return Promise.resolve({ data: [], error: null }).then(resolve);
          },
        };
        return { select: () => chain, update: () => ({ eq: async () => ({ error: null }) }), insert: async () => ({ error: null }) };
      },
      rpc: async () => ({ data: null, error: null }),
    };
    const store = createChargeStore(admin as never, { mode: "test" });
    expect(await store.clientName("client")).toBe("Client");
    expect(await store.resolveCustomer("client")).toEqual({ ok: true, customerId: "cus_qa", source: "fixtures" });
    expect(await store.resolveDestination("provider")).toEqual({
      destination: "acct_qa",
      ready: false,
      verifyOnStripe: true,
    });
    expect(calls.every((table) => table === "stripe_test_fixtures")).toBe(true);
  });
});

describe("card on file", () => {
  it("returns the setup intent contract and stores the customer", async () => {
    const saved: string[] = [];
    const stripe = {
      customers: {
        retrieve: vi.fn(),
        create: vi.fn(async () => ({ id: "cus_new" })),
        update: vi.fn(),
      },
      setupIntents: {
        create: vi.fn(async () => ({ id: "seti_1", client_secret: "seti_secret" })),
        retrieve: vi.fn(),
      },
      ephemeralKeys: {
        create: vi.fn(async () => ({ secret: "ek_secret" })),
      },
      paymentMethods: { list: vi.fn() },
    };
    const result = await createSetupIntentForUser({
      stripe: stripe as never,
      directory: {
        listCustomerIds: async () => [],
        canStoreCustomer: async () => true,
        saveCustomerId: async (_userId, customerId) => { saved.push(customerId); },
      },
      publishableKey: "pk_test_123",
      stripeVersion: "2024-06-20",
      user: { id: "user-1", email: "qa@example.com", name: "QA Client" },
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      setupIntentClientSecret: "seti_secret",
      ephemeralKey: "ek_secret",
      customerId: "cus_new",
      publishableKey: "pk_test_123",
    });
    expect(stripe.setupIntents.create).toHaveBeenCalledWith(expect.objectContaining({ usage: "off_session" }));
    expect(stripe.ephemeralKeys.create).toHaveBeenCalledWith(
      { customer: "cus_new" },
      { apiVersion: "2024-06-20" },
    );
    expect(saved).toEqual(["cus_new"]);
  });

  it("falls back to the pinned Stripe API version when stripe-version is absent", async () => {
    const stripe = {
      customers: { retrieve: vi.fn(), create: vi.fn(async () => ({ id: "cus_new" })), update: vi.fn() },
      setupIntents: { create: vi.fn(async () => ({ id: "seti_1", client_secret: "seti_secret" })), retrieve: vi.fn() },
      ephemeralKeys: { create: vi.fn(async () => ({ secret: "ek_secret" })) },
      paymentMethods: { list: vi.fn() },
    };
    const result = await createSetupIntentForUser({
      stripe: stripe as never,
      directory: {
        listCustomerIds: async () => [],
        canStoreCustomer: async () => true,
        saveCustomerId: async () => undefined,
      },
      publishableKey: "pk_test_123",
      stripeVersion: null,
      user: { id: "user-1", email: "qa@example.com", name: "QA Client" },
    });
    expect(ephemeralKeyApiVersion(null)).toBe(STRIPE_API_VERSION);
    expect(result.status).toBe(200);
    expect(stripe.ephemeralKeys.create).toHaveBeenCalledWith(
      { customer: "cus_new" },
      { apiVersion: STRIPE_API_VERSION },
    );
  });

  it("does not require stripe-version to read or set a card, and rejects another customer's setup intent", async () => {
    const missing = await getPaymentMethodForUser({
      stripe: { customers: { retrieve: vi.fn() }, paymentMethods: { list: vi.fn() } } as never,
      directory: { listCustomerIds: async () => [], canStoreCustomer: async () => true, saveCustomerId: async () => undefined },
      userId: "user-1",
    });
    expect(missing.status).toBe(200);
    expect(missing.body).toBeNull();

    const stripe = {
      customers: { update: vi.fn(), retrieve: vi.fn(), create: vi.fn() },
      setupIntents: {
        retrieve: vi.fn(async () => ({ id: "seti_1", status: "succeeded", customer: "cus_other", payment_method: "pm_1" })),
      },
      paymentMethods: { list: vi.fn() },
      ephemeralKeys: { create: vi.fn() },
    };
    const rejected = await setDefaultPaymentMethodForUser({
      stripe: stripe as never,
      directory: {
        listCustomerIds: async () => ["cus_mine"],
        canStoreCustomer: async () => true,
        saveCustomerId: async () => undefined,
      },
      userId: "user-1",
      setupIntentId: "seti_1",
    });
    expect(rejected.status).toBe(403);
    expect(stripe.customers.update).not.toHaveBeenCalled();
  });

  it("returns null when the caller has no test customer", async () => {
    const result = await getPaymentMethodForUser({
      stripe: { customers: { retrieve: vi.fn() }, paymentMethods: { list: vi.fn() } } as never,
      directory: createTestCustomerDirectory({
        from() {
          const chain = {
            eq() { return chain; },
            maybeSingle: async () => ({ data: null, error: null }),
            then(resolve: (value: { data: unknown; error: null }) => unknown) {
              return Promise.resolve({ data: [], error: null }).then(resolve);
            },
          };
          return { select: () => chain, update: () => ({ eq: async () => ({ error: null }) }), insert: async () => ({ error: null }) };
        },
      } as never),
      userId: "user-1",
    });
    expect(result).toEqual({ status: 200, body: null });
  });
});

describe("frontend charge copy", () => {
  it("uses the charge function name from the env, defaulting to charge-client", () => {
    expect(chargeFunctionName(undefined)).toBe("charge-client");
    expect(chargeFunctionName("")).toBe("charge-client");
    expect(chargeFunctionName(" charge-client-test ")).toBe("charge-client-test");
  });

  it("hides the button unless the flag is the string true", () => {
    expect(isCompleteAndChargeFlag("true")).toBe(true);
    expect(isCompleteAndChargeFlag("false")).toBe(false);
    expect(isCompleteAndChargeFlag(undefined)).toBe(false);
  });

  it("builds the confirmation sentence from server values", () => {
    expect(chargeConfirmationText({
      amountCents: 5500,
      card: { brand: "visa", last4: "4242" },
      serviceLabel: "Dressing",
      scheduledDate: "2026-12-02",
    })).toBe("Charge $55.00 to Visa •••4242 for Dressing on Dec 2?");
  });

  it("disables confirm while a charge is already in progress", () => {
    expect(chargeConfirmBlocked("in_progress")).toBe(true);
    expect(chargeConfirmBlocked(null)).toBe(false);
  });

  it("uses the required no-card copy", () => {
    expect(NO_CARD_MESSAGE).toBe(CHARGE_MESSAGES.no_card);
    expect(messageForChargeCode("no_card", "other")).toBe(NO_CARD_MESSAGE);
    expect(messageForChargeCode("provider_not_payable")).toBe("Finish payout setup in Settings first.");
    expect(messageForChargeCode("card_declined", "Your card was declined.")).toBe("Your card was declined.");
    expect(messageForChargeCode("unknown")).toBe("Payment status is unknown. Refreshing…");
  });

  it("treats a 200 complete as success and a coded error as a failure", () => {
    expect(interpretChargeResponse("complete", 200, { paymentIntentId: "pi_1", code: "already_charged" })).toMatchObject({
      ok: true,
      kind: "completed",
      code: "already_charged",
    });
    expect(interpretChargeResponse("complete", 422, { error: "nope", code: "no_card" })).toMatchObject({
      ok: false,
      code: "no_card",
      error: NO_CARD_MESSAGE,
    });
  });

  it("reads a function error response body", async () => {
    const payload = await readInvokePayload(null, { context: new Response(JSON.stringify({ error: "Not signed in", code: "unauthorized" }), { status: 401 }) });
    expect(payload).toEqual({ status: 401, body: { error: "Not signed in", code: "unauthorized" } });
  });
});

describe("qa allowlist and migration", () => {
  it("hardcodes the two QA user ids and ignores the environment", () => {
    expect([...qaUserIdSet()]).toEqual([...QA_USER_IDS]);
    expect(qaUserIdSet().has("5a5486f5-1058-4091-aa03-b09c916b8da0")).toBe(true);
    expect(qaUserIdSet().has("6b0f27b4-e015-4c3a-972d-8191c94043ba")).toBe(true);
    const source = readFileSync("supabase/functions/_shared/qaAllowlist.ts", "utf8");
    expect(source).not.toContain("Deno.env");
    expect(source).not.toContain("parseQaUserIds");
  });

  it("keeps the previous notify branches and adds the completed charge branch", () => {
    const migration = readFileSync("supabase/migrations/20261008120000_booking_complete_and_charge.sql", "utf8");
    const previous = readFileSync("supabase/migrations/20260930210000_booking_status_notifications.sql", "utf8");
    const marker = "    elsif old.status = 'pending_client' and new.status = 'upcoming' then";
    const previousFn = previous.slice(
      previous.indexOf("create or replace function public.notify_on_booking_change()"),
      previous.indexOf("drop trigger if exists bookings_notify_on_status"),
    );
    const [before, after] = previousFn.split(marker);
    expect(migration).toContain(before);
    expect(migration).toContain(after.trimEnd());
    expect(migration).toContain("elsif old.status = 'approved' and new.status = 'completed' then");
    expect(migration).toContain("Visit completed, ");
    expect(migration).toContain("claim_booking_for_charge");
    expect(migration).toContain("finalize_booking_charge");
    expect(migration).toContain("status is locked while a charge is processing");
    expect(migration).toContain("finalize_booking_charge updated 0 rows");
    expect(migration).toContain("stripe_test_fixtures");
    expect(migration).toContain("payment_intent_id is not null");
    const rollback = readFileSync("supabase/migrations/rollback/20261008120000_booking_complete_and_charge.sql", "utf8");
    expect(rollback).toContain("drop column if exists price_cents");
    expect(rollback).not.toContain("elsif old.status = 'approved' and new.status = 'completed' then");
  });

  it("leaves the legacy charge-client contract in place", () => {
    const source = readFileSync("supabase/functions/charge-client/index.ts", "utf8");
    expect(source).toContain('error: "customerId is required"');
    expect(source).toContain("No payment method on file for this customer");
    expect(source).toContain("charged the platform account");
    expect(source).toContain('action === "preview" || action === "complete_and_charge"');
    const legacy = source.slice(source.indexOf("async function serveLegacyChargeClient"), source.indexOf("/**\n * Legacy mobile"));
    expect(legacy).not.toContain("requireUser");
    expect(legacy).not.toContain("complete_and_charge");
  });
});
