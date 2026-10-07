/**
 * Card-on-file helpers shared by provider charges and SetupIntent functions.
 * No Deno or Stripe SDK imports so unit tests can load this file.
 */

export interface CardDetails {
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
}

export interface PaymentMethodLike {
  id?: string;
  type?: string;
  card?: {
    brand?: string | null;
    last4?: string | null;
    exp_month?: number | null;
    exp_year?: number | null;
  } | null;
}

export interface CustomerLike {
  id?: string;
  deleted?: boolean;
  invoice_settings?: {
    default_payment_method?: unknown;
  } | null;
}

export interface CardStripe {
  customers: {
    retrieve(
      id: string,
      params?: { expand?: string[] },
    ): Promise<CustomerLike>;
  };
  paymentMethods: {
    list(params: { customer: string; type: "card"; limit: number }): Promise<{ data: PaymentMethodLike[] }>;
    retrieve?(id: string): Promise<PaymentMethodLike>;
  };
}

export function paymentMethodIdFromStripe(value: unknown): string | null {
  if (typeof value === "string" && value.startsWith("pm_")) return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.startsWith("pm_")) return id;
  }
  return null;
}

export function cardDetailsFromPaymentMethod(value: unknown): CardDetails | null {
  if (!value || typeof value !== "object") return null;
  const pm = value as PaymentMethodLike;
  if (pm.type && pm.type !== "card") return null;
  const card = pm.card;
  if (!card?.last4) return null;
  const brand = (card.brand ?? "card").trim() || "card";
  return {
    brand,
    last4: card.last4,
    expMonth: typeof card.exp_month === "number" ? card.exp_month : null,
    expYear: typeof card.exp_year === "number" ? card.exp_year : null,
  };
}

function isMissingResource(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "resource_missing";
}

/**
 * Default payment method, otherwise the first card.
 * Returns null when the customer is missing, deleted, or has no card.
 */
export async function loadDefaultCard(
  stripe: CardStripe,
  customerId: string,
): Promise<{ paymentMethodId: string; card: CardDetails | null } | null> {
  let customer: CustomerLike;
  try {
    customer = await stripe.customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    });
  } catch (error) {
    if (isMissingResource(error)) return null;
    throw error;
  }
  if (!customer || customer.deleted) return null;

  const expanded = customer.invoice_settings?.default_payment_method;
  const defaultId = paymentMethodIdFromStripe(expanded);
  const expandedCard = cardDetailsFromPaymentMethod(expanded);

  if (defaultId && expandedCard) {
    return { paymentMethodId: defaultId, card: expandedCard };
  }

  const listed = await stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
    limit: 10,
  });
  const cards = listed.data ?? [];

  if (defaultId) {
    const match = cards.find((pm) => pm.id === defaultId);
    const fromList = match ? cardDetailsFromPaymentMethod(match) : null;
    if (fromList) return { paymentMethodId: defaultId, card: fromList };
    if (stripe.paymentMethods.retrieve) {
      try {
        const retrieved = await stripe.paymentMethods.retrieve(defaultId);
        const fromRetrieve = cardDetailsFromPaymentMethod(retrieved);
        if (fromRetrieve) return { paymentMethodId: defaultId, card: fromRetrieve };
      } catch (error) {
        if (!isMissingResource(error)) throw error;
      }
    }
    return { paymentMethodId: defaultId, card: null };
  }

  const first = cards[0];
  const firstId = first?.id && first.id.startsWith("pm_") ? first.id : null;
  if (!firstId) return null;
  return { paymentMethodId: firstId, card: cardDetailsFromPaymentMethod(first) };
}
