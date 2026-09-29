/** Canonical service names, in the mobile app's order. */
export const PRICING_SERVICES = [
  "Bathing & Grooming",
  "Dressing Assistance",
  "Transferring",
  "Walking Assistance",
  "Meal Prep",
  "Light Housekeeping",
  "Medication Assistance",
  "Transportation",
] as const;

export type PricingService = (typeof PRICING_SERVICES)[number];

export const MAX_ZIP_CODES = 25;
export const MAX_NOTES_LENGTH = 2000;
export const MAX_NAME_LENGTH = 200;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_PHONE_LENGTH = 40;
/** Postgres integer max. price_cents is an int4. */
export const MAX_PRICE_CENTS = 2_147_483_647;

const SERVICE_SET = new Set<string>(PRICING_SERVICES);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_RE = /^\d{5}$/;
const DOLLAR_RE = /^\d+(\.\d{1,2})?$/;

export type ServicePriceCents = Record<PricingService, number>;

export type NormalizedZipPricing = {
  zip: string;
  prices: ServicePriceCents;
};

export type NormalizedServicePricing = {
  providerName: string;
  providerEmail: string;
  providerPhone: string | null;
  notes: string | null;
  zips: NormalizedZipPricing[];
};

export type ServicePricingValidation =
  | { ok: true; value: NormalizedServicePricing }
  | { ok: false; messages: string[] };

export function isPricingService(value: string): value is PricingService {
  return SERVICE_SET.has(value);
}

export function isValidProviderEmail(value: string): boolean {
  return value.length > 0 && value.length <= MAX_EMAIL_LENGTH && EMAIL_RE.test(value);
}

/**
 * Parse a USD amount into cents.
 * Accepts "12", "12.5", "12.50", and finite numbers with at most 2 decimal places.
 * Rejects negatives, extra decimals, and values that do not fit in int4.
 */
export function parseDollarToCents(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    const cents = Math.round(value * 100);
    if (Math.abs(value * 100 - cents) > 1e-6) return null;
    if (!Number.isSafeInteger(cents) || cents > MAX_PRICE_CENTS) return null;
    return cents;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!DOLLAR_RE.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const wholeNum = Number(whole);
  const fracNum = Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(wholeNum) || !Number.isSafeInteger(fracNum)) return null;
  const cents = wholeNum * 100 + fracNum;
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_PRICE_CENTS) return null;
  return cents;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function zipLabel(zip: string, index: number): string {
  return ZIP_RE.test(zip) ? zip : `block ${index + 1}`;
}

export function validateServicePricing(body: unknown): ServicePricingValidation {
  const messages: string[] = [];
  if (!isRecord(body)) {
    return { ok: false, messages: ["Invalid payload."] };
  }

  const name = typeof body.provider_name === "string" ? body.provider_name.trim() : "";
  if (!name) messages.push("Full name is required.");
  else if (name.length > MAX_NAME_LENGTH) {
    messages.push(`Name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  } else if (/[\r\n]/.test(name)) messages.push("Enter your name on one line.");

  const email = typeof body.provider_email === "string" ? body.provider_email.trim() : "";
  if (!email) messages.push("Email is required.");
  else if (!isValidProviderEmail(email)) messages.push("Enter a valid email address.");

  let phone: string | null = null;
  if (body.provider_phone !== undefined && body.provider_phone !== null) {
    if (typeof body.provider_phone !== "string") {
      messages.push("Phone must be text.");
    } else {
      const trimmed = body.provider_phone.trim();
      if (trimmed.length > MAX_PHONE_LENGTH) {
        messages.push(`Phone must be ${MAX_PHONE_LENGTH} characters or fewer.`);
      } else if (/[\r\n]/.test(trimmed)) {
        messages.push("Enter the phone number on one line.");
      } else if (trimmed) {
        phone = trimmed;
      }
    }
  }

  let notes: string | null = null;
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== "string") {
      messages.push("Notes must be text.");
    } else {
      const trimmed = body.notes.trim();
      if (trimmed.length > MAX_NOTES_LENGTH) {
        messages.push(`Notes must be ${MAX_NOTES_LENGTH} characters or fewer.`);
      } else if (trimmed) {
        notes = trimmed;
      }
    }
  }

  const zips: NormalizedZipPricing[] = [];
  if (!Array.isArray(body.zips) || body.zips.length === 0) {
    messages.push("Add at least one zip code.");
  } else if (body.zips.length > MAX_ZIP_CODES) {
    messages.push(`You can submit at most ${MAX_ZIP_CODES} zip codes.`);
  } else {
    const seen = new Set<string>();
    body.zips.forEach((entry, index) => {
      if (!isRecord(entry)) {
        messages.push(`Zip code block ${index + 1} is invalid.`);
        return;
      }
      const zip = typeof entry.zip === "string" ? entry.zip.trim() : "";
      if (!ZIP_RE.test(zip)) {
        messages.push(`Zip code block ${index + 1} must be a 5-digit US zip code.`);
      } else if (seen.has(zip)) {
        messages.push(`Duplicate zip code: ${zip}.`);
      } else {
        seen.add(zip);
      }

      const label = zipLabel(zip, index);
      if (!isRecord(entry.prices)) {
        messages.push(`Each zip code needs a price for all 8 services (${label}).`);
        return;
      }

      const prices = {} as ServicePriceCents;
      for (const key of Object.keys(entry.prices)) {
        if (!isPricingService(key)) messages.push(`Unknown service "${key}" for zip ${label}.`);
      }
      let complete = true;
      for (const service of PRICING_SERVICES) {
        if (!(service in entry.prices)) {
          messages.push(`${service} is required for zip ${label}.`);
          complete = false;
          continue;
        }
        const cents = parseDollarToCents(entry.prices[service]);
        if (cents === null) {
          messages.push(
            `${service} for zip ${label} must be a price of $0.00 or more with at most 2 decimals.`,
          );
          complete = false;
          continue;
        }
        prices[service] = cents;
      }
      if (ZIP_RE.test(zip) && complete && !messages.some((message) => message === `Duplicate zip code: ${zip}.`)) {
        zips.push({ zip, prices });
      }
    });
  }

  if (messages.length > 0 || !name || !email) {
    return { ok: false, messages: messages.length > 0 ? messages : ["Invalid payload."] };
  }

  return {
    ok: true,
    value: {
      providerName: name,
      providerEmail: email,
      providerPhone: phone,
      notes,
      zips,
    },
  };
}
