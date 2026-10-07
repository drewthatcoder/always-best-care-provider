import { format } from "date-fns";

/** Shown when the client has no Stripe customer or no card. */
export const NO_CARD_MESSAGE =
  "This client has no card on file. Ask them to add one in the Always Best Care app or call the agency.";

export const CHARGE_ERROR_MESSAGES: Record<string, string> = {
  no_card: NO_CARD_MESSAGE,
  provider_not_payable: "Finish payout setup in Settings first.",
  multiple_customers: "This client has conflicting payment profiles. Ask an admin to resolve it before charging.",
  not_approved: "This shift is not approved, so it can't be charged yet.",
  in_progress: "A charge is already in progress. Wait a moment and refresh.",
  card_declined: "The card was declined.",
  authentication_required: "The card needs authentication. Ask the client to update their card in the app.",
  invalid_amount: "This visit has no valid price.",
  too_early: "This visit can't be charged before the scheduled date.",
  unauthorized: "Sign in again to charge this visit.",
  forbidden: "You are not the assigned provider for this visit.",
  unknown: "Payment status is unknown. Refreshing…",
  stripe_config_error: "Stripe rejected this charge. Refresh and try again.",
};

const SERVER_MESSAGE_CODES = new Set(["card_declined", "authentication_required", "stripe_config_error"]);

export interface ChargeCard {
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
}

export interface ChargePreview {
  amountCents: number;
  clientName: string;
  service: string;
  serviceLabel: string;
  scheduledDate: string;
  card: ChargeCard | null;
  connectReady: boolean;
  destination: string | null;
  code: string | null;
}

export type ChargeCallResult =
  | { ok: true; kind: "preview"; preview: ChargePreview }
  | { ok: true; kind: "completed"; code: string | null; paymentIntentId: string | null }
  | { ok: false; kind: "error"; code: string; error: string; status: number };

/** Boolean discriminants do not narrow while strictNullChecks is off. */
export function isChargeError(
  result: ChargeCallResult,
): result is Extract<ChargeCallResult, { kind: "error" }> {
  return result.kind === "error";
}

export function chargeFunctionName(envValue: string | undefined = import.meta.env.VITE_CHARGE_FUNCTION): string {
  const name = typeof envValue === "string" ? envValue.trim() : "";
  return name || "charge-client";
}

/** The button stays hidden unless this is the string "true". */
export function isCompleteAndChargeFlag(value: string | undefined): boolean {
  return value === "true";
}

export function isCompleteAndChargeEnabled(): boolean {
  return isCompleteAndChargeFlag(import.meta.env.VITE_ENABLE_COMPLETE_AND_CHARGE);
}

export function formatCents(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  return `$${(safe / 100).toFixed(2)}`;
}

export function formatCardLabel(card: { brand: string; last4: string }): string {
  const raw = (card.brand || "Card").trim() || "Card";
  const brand = raw.charAt(0).toUpperCase() + raw.slice(1);
  return `${brand} •••${card.last4}`;
}

export function formatVisitDate(isoDate: string): string {
  const day = (isoDate ?? "").slice(0, 10);
  const parsed = new Date(`${day}T00:00:00`);
  if (!day || Number.isNaN(parsed.getTime())) return isoDate || "the scheduled date";
  return format(parsed, "MMM d");
}

/** Server values only. Example: Charge $55.00 to Visa •••4242 for Dressing on Dec 2? */
export function chargeConfirmationText(input: {
  amountCents: number;
  card: { brand: string; last4: string } | null;
  serviceLabel: string;
  scheduledDate: string;
}): string {
  const card = input.card ? formatCardLabel(input.card) : "the card on file";
  return `Charge ${formatCents(input.amountCents)} to ${card} for ${input.serviceLabel} on ${formatVisitDate(input.scheduledDate)}?`;
}

export function messageForChargeCode(code: string | null | undefined, serverError?: string | null): string {
  if (code && SERVER_MESSAGE_CODES.has(code) && serverError && serverError.trim()) return serverError.trim();
  if (code && CHARGE_ERROR_MESSAGES[code]) return CHARGE_ERROR_MESSAGES[code];
  if (serverError && serverError.trim()) return serverError.trim();
  return CHARGE_ERROR_MESSAGES.unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readCard(value: unknown): ChargeCard | null {
  const record = asRecord(value);
  if (!record || typeof record.last4 !== "string" || !record.last4) return null;
  return {
    brand: typeof record.brand === "string" ? record.brand : "card",
    last4: record.last4,
    expMonth: typeof record.expMonth === "number" ? record.expMonth : null,
    expYear: typeof record.expYear === "number" ? record.expYear : null,
  };
}

export function interpretChargeResponse(kind: "preview" | "complete", status: number, body: unknown): ChargeCallResult {
  const record = asRecord(body);
  const code = record && typeof record.code === "string" ? record.code : null;
  const serverError = record && typeof record.error === "string" ? record.error : null;

  if (kind === "preview" && status === 200 && record && typeof record.amountCents === "number") {
    return {
      ok: true,
      kind: "preview",
      preview: {
        amountCents: record.amountCents,
        clientName: typeof record.clientName === "string" ? record.clientName : "Client",
        service: typeof record.service === "string" ? record.service : "",
        serviceLabel: typeof record.serviceLabel === "string" ? record.serviceLabel : "Care",
        scheduledDate: typeof record.scheduledDate === "string" ? record.scheduledDate : "",
        card: readCard(record.card),
        connectReady: record.connectReady === true,
        destination: typeof record.destination === "string" ? record.destination : null,
        code,
      },
    };
  }

  if (kind === "complete" && status === 200) {
    return {
      ok: true,
      kind: "completed",
      code,
      paymentIntentId: record && typeof record.paymentIntentId === "string" ? record.paymentIntentId : null,
    };
  }

  return {
    ok: false,
    kind: "error",
    status,
    code: code || "unknown",
    error: messageForChargeCode(code || "unknown", serverError),
  };
}

export async function readInvokePayload(
  data: unknown,
  error: unknown,
): Promise<{ status: number; body: unknown }> {
  if (!error) return { status: 200, body: data };
  const context = error && typeof error === "object" && "context" in error
    ? (error as { context?: unknown }).context
    : undefined;
  if (context instanceof Response) {
    try {
      return { status: context.status || 500, body: await context.clone().json() };
    } catch {
      return { status: context.status || 500, body: data };
    }
  }
  return { status: 500, body: data };
}

async function invokeCharge(body: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.functions.invoke(chargeFunctionName(), { body });
  return readInvokePayload(data, error);
}

export async function requestChargePreview(bookingId: string): Promise<ChargeCallResult> {
  const response = await invokeCharge({ action: "preview", bookingId });
  return interpretChargeResponse("preview", response.status, response.body);
}

export async function requestCompleteAndCharge(bookingId: string): Promise<ChargeCallResult> {
  const response = await invokeCharge({ action: "complete_and_charge", bookingId });
  return interpretChargeResponse("complete", response.status, response.body);
}

/** Preview codes that must not enable the confirm button. */
export function chargeConfirmBlocked(code: string | null | undefined): boolean {
  return code === "no_card"
    || code === "provider_not_payable"
    || code === "multiple_customers"
    || code === "invalid_amount"
    || code === "not_approved"
    || code === "in_progress";
}
