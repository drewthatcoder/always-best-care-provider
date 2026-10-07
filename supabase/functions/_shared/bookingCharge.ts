/**
 * Provider "Mark complete & charge".
 * Amount, customer, and destination are resolved on the server.
 * Stripe and Supabase are injected so unit tests can mock them.
 *
 * The scheduled-date gate (`too_early`) is intentionally not enforced yet.
 */

import { isBillableConnect } from "./clientPayment.ts";
import { loadDefaultCard, type CardDetails, type CardStripe } from "./paymentMethod.ts";

export const FIRST_SERVICES_AT_CENTS = 5500;
export const EXTRA_SERVICE_CENTS = 4500;
export const CHARGE_SOURCE = "provider_complete";

export const CHARGE_MESSAGES = {
  no_card:
    "This client has no card on file. Ask them to add one in the Always Best Care app or call the agency.",
  provider_not_payable: "Finish payout setup in Settings first.",
  multiple_customers:
    "This client has more than one Stripe customer on file. Ask an admin to resolve it before charging.",
  not_approved: "This shift is not approved, so it can't be charged.",
  in_progress: "A charge is already in progress. Wait a moment and refresh.",
  invalid_amount: "This visit has no valid price.",
  unauthorized: "Not signed in",
  forbidden: "Not the assigned provider",
  not_found: "Booking not found",
  unknown: "Payment status is unknown. Refresh and try again.",
  stripe_config_error: "Stripe rejected this charge. Refresh and try again.",
  already_charged: "This visit was already charged.",
  too_early: "This visit can't be charged before the scheduled date.",
  not_allowed: "Not allowed",
} as const;

const BOOKING_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BookingForCharge {
  id: string;
  status: string;
  service: string;
  scheduled_date: string;
  client_user_id: string;
  provider_user_id: string | null;
  price_cents: number | null;
  payment_status: string;
  payment_intent_id: string | null;
  charge_attempts: number | null;
  charge_amount_cents?: number | null;
  charge_destination?: string | null;
  charge_livemode?: boolean | null;
}

export type CustomerResolution =
  | { ok: true; customerId: string; source: "client_profiles" | "profiles" | "fixtures" }
  | { ok: false; code: "no_card" | "multiple_customers" };

/** Boolean discriminants do not narrow while strictNullChecks is off. */
export function isUnresolvedCustomer(
  customer: CustomerResolution,
): customer is Extract<CustomerResolution, { ok: false }> {
  return customer.ok === false;
}

export interface DestinationResolution {
  destination: string | null;
  /** Live Connect flags already passed isBillableConnect. */
  ready: boolean;
  /** Test mode: confirm charges_enabled and payouts_enabled on the Stripe test account. */
  verifyOnStripe: boolean;
}

export interface FinalizeChargeArgs {
  bookingId: string;
  success: boolean;
  paymentIntentId: string | null;
  amountCents: number | null;
  livemode: boolean | null;
  destination: string | null;
  error: string | null;
}

export interface ChargeStore {
  getBooking(bookingId: string): Promise<BookingForCharge | null>;
  clientName(clientUserId: string): Promise<string>;
  resolveCustomer(clientUserId: string): Promise<CustomerResolution>;
  resolveDestination(providerUserId: string): Promise<DestinationResolution>;
  claim(bookingId: string, providerUserId: string): Promise<BookingForCharge | null>;
  finalize(args: FinalizeChargeArgs): Promise<void>;
}

export interface PaymentIntentLike {
  id: string;
  status: string;
  amount?: number;
  livemode?: boolean;
  transfer_data?: { destination?: unknown } | null;
  metadata?: { booking_id?: string | null } | null;
}

/** Statuses that mean a charge for this booking already exists and must not be created again. */
export const BLOCKING_PAYMENT_INTENT_STATUSES = ["succeeded", "processing", "requires_capture"] as const;

export interface ChargeStripe extends CardStripe {
  paymentIntents: {
    search(params: { query: string; limit?: number }): Promise<{ data: PaymentIntentLike[] }>;
    list(params: { customer: string; limit?: number }): Promise<{ data: PaymentIntentLike[] }>;
    create(
      params: Record<string, unknown>,
      options?: { idempotencyKey?: string },
    ): Promise<PaymentIntentLike>;
  };
  accounts: {
    retrieve(id: string): Promise<{
      id?: string;
      charges_enabled?: boolean | null;
      payouts_enabled?: boolean | null;
      details_submitted?: boolean | null;
    }>;
  };
}

export interface BookingChargeDeps {
  stripe: ChargeStripe;
  store: ChargeStore;
  mode: "live" | "test";
}

export interface ChargeHttpResult {
  status: number;
  body: Record<string, unknown>;
}

export function serviceTokens(service: string | null | undefined): string[] {
  return (service ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Same formula as mobile: 5500¢ for each of the first two services, 4500¢ after. Empty tokens do not count. */
export function bookingPriceCents(service: string | null | undefined): number {
  const count = serviceTokens(service).length;
  if (count <= 0) return 0;
  if (count <= 2) return count * FIRST_SERVICES_AT_CENTS;
  return 2 * FIRST_SERVICES_AT_CENTS + (count - 2) * EXTRA_SERVICE_CENTS;
}

export function serviceLabel(service: string | null | undefined): string {
  const tokens = serviceTokens(service);
  if (tokens.length === 0) return "Care";
  return tokens
    .map((token) => (token.charAt(0).toUpperCase() + token.slice(1)))
    .join(", ");
}

/** Stored snapshot wins. Otherwise price the service string. */
export function chargeAmountCents(
  priceCents: number | null | undefined,
  service: string | null | undefined,
): number {
  if (typeof priceCents === "number" && Number.isInteger(priceCents) && priceCents > 0) {
    return priceCents;
  }
  return bookingPriceCents(service);
}

export function bookingChargeIdempotencyKey(bookingId: string, chargeAttempts: number): string {
  const attempt = Number.isInteger(chargeAttempts) && chargeAttempts >= 0 ? chargeAttempts : 0;
  return `booking-charge:${bookingId}:${attempt}`;
}

export function normalizeCustomerId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.startsWith("cus_") ? trimmed : null;
}

/**
 * client_profiles wins. Otherwise every distinct non-null profiles.stripe_customer_id.
 * Two or more distinct profile customers is multiple_customers. None is no_card.
 */
export function resolveStoredCustomer(
  clientProfileCustomerId: unknown,
  profileCustomerIds: unknown[],
): CustomerResolution {
  const fromClient = normalizeCustomerId(clientProfileCustomerId);
  if (fromClient) return { ok: true, customerId: fromClient, source: "client_profiles" };

  const distinct = new Set<string>();
  for (const value of profileCustomerIds) {
    const id = normalizeCustomerId(value);
    if (id) distinct.add(id);
  }
  if (distinct.size > 1) return { ok: false, code: "multiple_customers" };
  if (distinct.size === 1) {
    return { ok: true, customerId: [...distinct][0], source: "profiles" };
  }
  return { ok: false, code: "no_card" };
}

export function resolveFixtureCustomer(customerId: unknown): CustomerResolution {
  const id = normalizeCustomerId(customerId);
  if (!id) return { ok: false, code: "no_card" };
  return { ok: true, customerId: id, source: "fixtures" };
}

export function isAccountId(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("acct_");
}

async function findExistingCharge(
  stripe: ChargeStripe,
  bookingId: string,
  customerId: string,
): Promise<PaymentIntentLike | null> {
  const searched = await stripe.paymentIntents.search({
    query: succeededChargeSearchQuery(bookingId),
    limit: 1,
  });
  const fromSearch = searched.data?.find((pi) => pi.status === "succeeded");
  if (fromSearch) return fromSearch;

  const listed = await stripe.paymentIntents.list({ customer: customerId, limit: 100 });
  const matches = (listed.data ?? []).filter((pi) => paymentIntentMatchesBooking(pi, bookingId));
  return matches.find((pi) => pi.status === "succeeded")
    ?? matches.find((pi) => pi.status === "processing" || pi.status === "requires_capture")
    ?? null;
}

export function succeededChargeSearchQuery(bookingId: string): string {
  if (!BOOKING_UUID.test(bookingId)) {
    throw new Error("invalid booking id");
  }
  return `metadata['booking_id']:'${bookingId}' AND status:'succeeded'`;
}

export function isBookingUuid(value: string): boolean {
  return BOOKING_UUID.test(value);
}

export function paymentIntentMatchesBooking(pi: PaymentIntentLike, bookingId: string): boolean {
  return pi.metadata?.booking_id === bookingId
    && (BLOCKING_PAYMENT_INTENT_STATUSES as readonly string[]).includes(pi.status);
}

export function paymentIntentDestination(pi: { transfer_data?: { destination?: unknown } | null }): string | null {
  const destination = pi.transfer_data?.destination;
  if (typeof destination === "string" && destination.startsWith("acct_")) return destination;
  if (destination && typeof destination === "object" && "id" in destination) {
    const id = (destination as { id?: unknown }).id;
    if (typeof id === "string" && id.startsWith("acct_")) return id;
  }
  return null;
}

const STRIPE_CLASS_API_TYPES: Record<string, string> = {
  StripeCardError: "card_error",
  StripeInvalidRequestError: "invalid_request_error",
  StripeIdempotencyError: "idempotency_error",
  StripeAuthenticationError: "authentication_error",
  StripePermissionError: "permission_error",
  StripeRateLimitError: "rate_limit_error",
  StripeConnectionError: "api_connection_error",
  StripeAPIError: "api_error",
};

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The Stripe Node/Deno client sets `type` to the class name
 * (StripeInvalidRequestError). The API type is `rawType`, then `raw.type`.
 */
export function stripeApiType(error: unknown): string {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const raw = record.raw && typeof record.raw === "object" ? (record.raw as Record<string, unknown>) : {};
  const chosen = stringField(record.rawType) || stringField(raw.type) || stringField(record.type);
  return STRIPE_CLASS_API_TYPES[chosen] ?? chosen;
}

/**
 * A card error from `paymentIntents.create` still creates a PaymentIntent
 * (status requires_payment_method). Stripe returns it as `payment_intent` on the error
 * (`error.payment_intent`, or `error.raw.payment_intent` on the raw API body).
 */
export function stripeErrorPaymentIntent(error: unknown): { id: string; livemode: boolean | null } | null {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const raw = record.raw && typeof record.raw === "object" ? (record.raw as Record<string, unknown>) : {};
  for (const candidate of [record.payment_intent, raw.payment_intent]) {
    if (!candidate || typeof candidate !== "object") continue;
    const pi = candidate as { id?: unknown; livemode?: unknown };
    if (typeof pi.id === "string" && pi.id.startsWith("pi_")) {
      return { id: pi.id, livemode: typeof pi.livemode === "boolean" ? pi.livemode : null };
    }
  }
  return null;
}

export function mapStripeError(error: unknown): { httpStatus: number; code: string; error: string } {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const code = typeof record.code === "string" ? record.code : "";
  const decline = typeof record.decline_code === "string" ? record.decline_code : "";
  const type = stripeApiType(error);
  const message = typeof record.message === "string" && record.message.trim()
    ? record.message.trim()
    : "Payment failed";

  if (code === "authentication_required" || decline === "authentication_required") {
    return { httpStatus: 402, code: "authentication_required", error: message };
  }
  if (code === "card_declined" || type === "card_error" || decline) {
    return { httpStatus: 402, code: "card_declined", error: message };
  }
  // Invalid destination, idempotency-key reuse, and other invalid_request errors
  // will fail the same way on every retry. Record them so the next attempt gets a new key.
  if (isDeterministicStripeConfigError(type, code, message)) {
    return { httpStatus: 409, code: "stripe_config_error", error: message || CHARGE_MESSAGES.stripe_config_error };
  }
  return { httpStatus: 500, code: "unknown", error: CHARGE_MESSAGES.unknown };
}

function isDeterministicStripeConfigError(type: string, code: string, message: string): boolean {
  if (type === "idempotency_error" || type === "invalid_request_error") return true;
  if (
    code === "account_invalid"
    || code === "insufficient_capabilities_for_transfer"
  ) return true;
  const lower = message.toLowerCase();
  return lower.includes("idempotency") || lower.includes("destination account");
}

export function outcomeFromPaymentIntentStatus(
  status: string,
): "succeeded" | "authentication_required" | "card_declined" | "unknown" {
  if (status === "succeeded") return "succeeded";
  if (status === "requires_action" || status === "requires_source_action") return "authentication_required";
  if (status === "requires_payment_method" || status === "canceled") return "card_declined";
  return "unknown";
}

export function failure(status: number, code: string, error: string): ChargeHttpResult {
  return { status, body: { error, code } };
}

export function mapBookingRow(row: Record<string, unknown> | null | undefined): BookingForCharge | null {
  if (!row || typeof row.id !== "string") return null;
  return {
    id: row.id,
    status: typeof row.status === "string" ? row.status : "",
    service: typeof row.service === "string" ? row.service : "",
    scheduled_date: typeof row.scheduled_date === "string" ? row.scheduled_date.slice(0, 10) : "",
    client_user_id: typeof row.client_user_id === "string" ? row.client_user_id : "",
    provider_user_id: typeof row.provider_user_id === "string" ? row.provider_user_id : null,
    price_cents: typeof row.price_cents === "number" ? row.price_cents : null,
    payment_status: typeof row.payment_status === "string" ? row.payment_status : "unpaid",
    payment_intent_id: typeof row.payment_intent_id === "string" ? row.payment_intent_id : null,
    charge_attempts: typeof row.charge_attempts === "number" ? row.charge_attempts : 0,
    charge_amount_cents: typeof row.charge_amount_cents === "number" ? row.charge_amount_cents : null,
    charge_destination: typeof row.charge_destination === "string" ? row.charge_destination : null,
    charge_livemode: typeof row.charge_livemode === "boolean" ? row.charge_livemode : null,
  };
}

function alreadyChargedBody(booking: BookingForCharge, extra: Record<string, unknown> = {}): ChargeHttpResult {
  return {
    status: 200,
    body: {
      code: "already_charged",
      paymentIntentId: booking.payment_intent_id,
      paymentStatus: "succeeded",
      bookingStatus: booking.status === "completed" ? "completed" : booking.status,
      amountCents: booking.charge_amount_cents ?? booking.price_cents,
      destination: booking.charge_destination ?? null,
      livemode: booking.charge_livemode,
      ...extra,
    },
  };
}

function isPaid(booking: BookingForCharge): boolean {
  return booking.status === "completed" || booking.payment_status === "succeeded";
}

async function payableDestination(
  deps: BookingChargeDeps,
  providerUserId: string,
): Promise<{ destination: string } | ChargeHttpResult> {
  const resolved = await deps.store.resolveDestination(providerUserId);
  if (!isAccountId(resolved.destination)) {
    return failure(412, "provider_not_payable", CHARGE_MESSAGES.provider_not_payable);
  }
  if (resolved.verifyOnStripe) {
    try {
      const account = await deps.stripe.accounts.retrieve(resolved.destination);
      const ready = isBillableConnect({
        stripe_account_id: resolved.destination,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
      });
      if (!ready) return failure(412, "provider_not_payable", CHARGE_MESSAGES.provider_not_payable);
    } catch {
      return failure(412, "provider_not_payable", CHARGE_MESSAGES.provider_not_payable);
    }
  } else if (!resolved.ready) {
    return failure(412, "provider_not_payable", CHARGE_MESSAGES.provider_not_payable);
  }
  return { destination: resolved.destination };
}

interface Assessment {
  booking: BookingForCharge;
  amountCents: number;
  clientName: string;
  customerId: string | null;
  card: { paymentMethodId: string; card: CardDetails | null } | null;
  destination: string | null;
  blocker: ChargeHttpResult | null;
}

async function loadBookingForProvider(
  deps: BookingChargeDeps,
  bookingId: string,
  providerUserId: string,
): Promise<{ booking: BookingForCharge } | ChargeHttpResult> {
  if (!isBookingUuid(bookingId)) return failure(400, "invalid_booking", "bookingId is required");
  const booking = await deps.store.getBooking(bookingId);
  if (!booking) return failure(404, "not_found", CHARGE_MESSAGES.not_found);
  if (booking.provider_user_id !== providerUserId) {
    return failure(403, "forbidden", CHARGE_MESSAGES.forbidden);
  }
  return { booking };
}

async function assess(
  deps: BookingChargeDeps,
  booking: BookingForCharge,
): Promise<Assessment> {
  const amountCents = chargeAmountCents(booking.price_cents, booking.service);
  const clientName = await deps.store.clientName(booking.client_user_id);
  const customer = await deps.store.resolveCustomer(booking.client_user_id);
  let card: Assessment["card"] = null;
  let blocker: ChargeHttpResult | null = null;

  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 1_000_000) {
    blocker = failure(422, "invalid_amount", CHARGE_MESSAGES.invalid_amount);
  } else if (isUnresolvedCustomer(customer)) {
    blocker = customer.code === "multiple_customers"
      ? failure(409, "multiple_customers", CHARGE_MESSAGES.multiple_customers)
      : failure(422, "no_card", CHARGE_MESSAGES.no_card);
  } else {
    card = await loadDefaultCard(deps.stripe, customer.customerId);
    if (!card?.paymentMethodId) blocker = failure(422, "no_card", CHARGE_MESSAGES.no_card);
  }

  const payable = await payableDestination(deps, booking.provider_user_id ?? "");
  const destination = "destination" in payable ? payable.destination : null;
  if (!blocker && "status" in payable) blocker = payable;

  return {
    booking,
    amountCents,
    clientName,
    customerId: customer.ok ? customer.customerId : null,
    card,
    destination,
    blocker,
  };
}

function previewBody(assessment: Assessment, code: string | null): ChargeHttpResult {
  return {
    status: 200,
    body: {
      amountCents: assessment.amountCents,
      currency: "usd",
      clientName: assessment.clientName,
      service: assessment.booking.service,
      serviceLabel: serviceLabel(assessment.booking.service),
      scheduledDate: assessment.booking.scheduled_date,
      card: assessment.card?.card
        ? {
          brand: assessment.card.card.brand,
          last4: assessment.card.card.last4,
          expMonth: assessment.card.card.expMonth,
          expYear: assessment.card.card.expYear,
        }
        : null,
      connectReady: Boolean(assessment.destination) && !assessment.blocker,
      destination: assessment.destination,
      code,
    },
  };
}

export async function previewBookingCharge(
  input: { bookingId: string; providerUserId: string },
  deps: BookingChargeDeps,
): Promise<ChargeHttpResult> {
  const loaded = await loadBookingForProvider(deps, input.bookingId, input.providerUserId);
  if ("status" in loaded) return loaded;
  const { booking } = loaded;

  if (isPaid(booking)) {
    const clientName = await deps.store.clientName(booking.client_user_id);
    return previewBody(
      {
        booking,
        amountCents: chargeAmountCents(booking.charge_amount_cents ?? booking.price_cents, booking.service),
        clientName,
        customerId: null,
        card: null,
        destination: booking.charge_destination ?? null,
        blocker: null,
      },
      "already_charged",
    );
  }
  if (booking.status !== "approved") return failure(409, "not_approved", CHARGE_MESSAGES.not_approved);

  const assessment = await assess(deps, booking);
  if (booking.payment_status === "processing" && !assessment.blocker) {
    return previewBody(assessment, "in_progress");
  }
  const code = assessment.blocker ? String(assessment.blocker.body.code ?? null) : null;
  return previewBody(assessment, code);
}

async function finalizeRecorded(
  deps: BookingChargeDeps,
  args: FinalizeChargeArgs,
): Promise<ChargeHttpResult | null> {
  try {
    await deps.store.finalize(args);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "finalize failed";
    console.error("finalize_booking_charge failed", {
      bookingId: args.bookingId,
      paymentIntentId: args.paymentIntentId,
      message,
    });
    return failure(500, "unknown", CHARGE_MESSAGES.unknown);
  }
}

async function finalizeSuccess(
  deps: BookingChargeDeps,
  booking: BookingForCharge,
  pi: PaymentIntentLike,
  fallback: { amountCents: number; destination: string },
): Promise<ChargeHttpResult> {
  const destination = paymentIntentDestination(pi) ?? fallback.destination;
  const amountCents = typeof pi.amount === "number" ? pi.amount : fallback.amountCents;
  const livemode = typeof pi.livemode === "boolean" ? pi.livemode : deps.mode === "live";
  const missed = await finalizeRecorded(deps, {
    bookingId: booking.id,
    success: true,
    paymentIntentId: pi.id,
    amountCents,
    livemode,
    destination,
    error: null,
  });
  if (missed) return missed;
  return {
    status: 200,
    body: {
      code: null,
      paymentIntentId: pi.id,
      status: "succeeded",
      paymentStatus: "succeeded",
      bookingStatus: "completed",
      amountCents,
      destination,
      livemode,
    },
  };
}

export async function chargeBooking(
  input: { bookingId: string; providerUserId: string },
  deps: BookingChargeDeps,
): Promise<ChargeHttpResult> {
  const loaded = await loadBookingForProvider(deps, input.bookingId, input.providerUserId);
  if ("status" in loaded) return loaded;
  let booking = loaded.booking;

  if (isPaid(booking)) {
    if (booking.status !== "completed" && booking.payment_intent_id) {
      const missed = await finalizeRecorded(deps, {
        bookingId: booking.id,
        success: true,
        paymentIntentId: booking.payment_intent_id,
        amountCents: booking.charge_amount_cents ?? booking.price_cents,
        livemode: booking.charge_livemode ?? null,
        destination: booking.charge_destination ?? null,
        error: null,
      });
      if (missed) return missed;
    }
    return alreadyChargedBody(booking, { bookingStatus: "completed" });
  }
  if (booking.status !== "approved") return failure(409, "not_approved", CHARGE_MESSAGES.not_approved);

  const assessment = await assess(deps, booking);
  if (assessment.blocker) return assessment.blocker;
  if (!assessment.customerId || !assessment.card?.paymentMethodId || !assessment.destination) {
    return failure(422, "no_card", CHARGE_MESSAGES.no_card);
  }

  const claimed = await deps.store.claim(booking.id, input.providerUserId);
  if (!claimed) {
    const latest = await deps.store.getBooking(booking.id);
    if (latest && isPaid(latest)) return alreadyChargedBody(latest, { bookingStatus: "completed" });
    if (latest?.payment_status === "processing") {
      return failure(409, "in_progress", CHARGE_MESSAGES.in_progress);
    }
    return failure(409, "not_approved", CHARGE_MESSAGES.not_approved);
  }
  booking = claimed;

  const prior = await findExistingCharge(deps.stripe, booking.id, assessment.customerId);
  if (prior?.status === "succeeded") {
    const adopted = await finalizeSuccess(deps, booking, prior, {
      amountCents: assessment.amountCents,
      destination: assessment.destination,
    });
    if (adopted.status !== 200) return adopted;
    return {
      status: 200,
      body: { ...adopted.body, code: "already_charged" },
    };
  }
  if (prior) {
    console.error("existing payment intent blocks a new charge", {
      bookingId: booking.id,
      paymentIntentId: prior.id,
      status: prior.status,
    });
    return failure(409, "in_progress", CHARGE_MESSAGES.in_progress);
  }

  const attempt = booking.charge_attempts ?? 0;
  const params: Record<string, unknown> = {
    amount: assessment.amountCents,
    currency: "usd",
    customer: assessment.customerId,
    payment_method: assessment.card.paymentMethodId,
    confirm: true,
    off_session: true,
    description: `${serviceLabel(booking.service)} on ${booking.scheduled_date}`,
    metadata: {
      booking_id: booking.id,
      provider_user_id: input.providerUserId,
      client_user_id: booking.client_user_id,
      source: CHARGE_SOURCE,
      mode: deps.mode,
      portal: "always-best-care-provider",
      customer_id: assessment.customerId,
    },
    transfer_data: { destination: assessment.destination },
  };

  let paymentIntent: PaymentIntentLike;
  try {
    paymentIntent = await deps.stripe.paymentIntents.create(params, {
      idempotencyKey: bookingChargeIdempotencyKey(booking.id, attempt),
    });
  } catch (error) {
    if (stripeApiType(error) === "idempotency_error") {
      const prior = await findExistingCharge(deps.stripe, booking.id, assessment.customerId);
      if (prior) {
        const adopted = await finalizeSuccess(deps, booking, prior, {
          amountCents: assessment.amountCents,
          destination: assessment.destination,
        });
        if (adopted.status !== 200) return adopted;
        return {
          status: 200,
          body: { ...adopted.body, code: "already_charged" },
        };
      }
    }
    const mapped = mapStripeError(error);
    if (
      mapped.code === "card_declined"
      || mapped.code === "authentication_required"
      || mapped.code === "stripe_config_error"
    ) {
      const declinedIntent = stripeErrorPaymentIntent(error);
      const missed = await finalizeRecorded(deps, {
        bookingId: booking.id,
        success: false,
        paymentIntentId: declinedIntent?.id ?? null,
        amountCents: assessment.amountCents,
        livemode: declinedIntent?.livemode ?? deps.mode === "live",
        destination: assessment.destination,
        error: mapped.error,
      });
      if (missed) return missed;
    }
    return failure(mapped.httpStatus, mapped.code, mapped.error);
  }

  const outcome = outcomeFromPaymentIntentStatus(paymentIntent.status);
  if (outcome === "succeeded") {
    return finalizeSuccess(deps, booking, paymentIntent, {
      amountCents: assessment.amountCents,
      destination: assessment.destination,
    });
  }
  if (outcome === "card_declined" || outcome === "authentication_required") {
    const message = outcome === "authentication_required"
      ? "This card requires authentication."
      : "Your card was declined.";
    const missed = await finalizeRecorded(deps, {
      bookingId: booking.id,
      success: false,
      paymentIntentId: paymentIntent.id,
      amountCents: assessment.amountCents,
      livemode: typeof paymentIntent.livemode === "boolean" ? paymentIntent.livemode : deps.mode === "live",
      destination: assessment.destination,
      error: message,
    });
    if (missed) return missed;
    return failure(402, outcome, message);
  }

  // processing / unexpected: leave the claim in place so a retry reuses the idempotency key.
  return failure(500, "unknown", CHARGE_MESSAGES.unknown);
}
