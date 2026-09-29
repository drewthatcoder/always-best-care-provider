import { z } from "zod";
import { readFunctionError } from "@/lib/invokeFunction";
import {
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_PHONE_LENGTH,
  MAX_ZIP_CODES,
  PRICING_SERVICES,
  type PricingService,
  isValidProviderEmail,
  parseDollarToCents,
} from "../../supabase/functions/submit-service-pricing/validate.ts";

export {
  MAX_ZIP_CODES,
  PRICING_SERVICES,
  type PricingService,
};

/** Descriptions from the mobile app, in the same order as PRICING_SERVICES. */
export const SERVICE_DETAILS: Record<PricingService, string> = {
  "Bathing & Grooming": "Personal hygiene assistance",
  "Dressing Assistance": "Help with clothing and dressing",
  Transferring: "Safe mobility assistance",
  "Walking Assistance": "Support for safe movement",
  "Meal Prep": "Healthy meal planning & cooking",
  "Light Housekeeping": "Cleaning and home organization",
  "Medication Assistance": "Timely medication management",
  Transportation: "Rides to appointments & errands",
};

const dollarPrice = z
  .string()
  .trim()
  .min(1, "Enter a price")
  .refine(
    (value) => parseDollarToCents(value) !== null,
    "Enter a price of $0.00 or more with at most 2 decimals",
  );

const pricesSchema = z.object(
  Object.fromEntries(PRICING_SERVICES.map((service) => [service, dollarPrice])) as Record<
    PricingService,
    typeof dollarPrice
  >,
);

const zipBlockSchema = z.object({
  zip: z.string().trim().regex(/^\d{5}$/, "Enter a 5-digit US zip code"),
  prices: pricesSchema,
});

export const pricingFormSchema = z
  .object({
    providerName: z
      .string()
      .trim()
      .min(1, "Full name is required")
      .max(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or fewer`)
      .refine((value) => !/[\r\n]/.test(value), "Enter your name on one line"),
    email: z
      .string()
      .trim()
      .min(1, "Email is required")
      .max(MAX_EMAIL_LENGTH, "Enter a valid email address")
      .refine((value) => isValidProviderEmail(value), "Enter a valid email address"),
    phone: z
      .string()
      .trim()
      .max(MAX_PHONE_LENGTH, `Phone must be ${MAX_PHONE_LENGTH} characters or fewer`)
      .refine((value) => !/[\r\n]/.test(value), "Enter the phone number on one line"),
    notes: z.string().trim().max(MAX_NOTES_LENGTH, `Notes must be ${MAX_NOTES_LENGTH} characters or fewer`),
    zips: z
      .array(zipBlockSchema)
      .min(1, "Add at least one zip code")
      .max(MAX_ZIP_CODES, `You can submit at most ${MAX_ZIP_CODES} zip codes`),
  })
  .superRefine((value, ctx) => {
    const firstIndex = new Map<string, number>();
    const flagged = new Set<number>();
    value.zips.forEach((block, index) => {
      if (!/^\d{5}$/.test(block.zip)) return;
      const first = firstIndex.get(block.zip);
      if (first === undefined) {
        firstIndex.set(block.zip, index);
        return;
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "This zip code is already listed",
        path: ["zips", index, "zip"],
      });
      if (!flagged.has(first)) {
        flagged.add(first);
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "This zip code is already listed",
          path: ["zips", first, "zip"],
        });
      }
    });
  });

export type PricingFormValues = z.infer<typeof pricingFormSchema>;

export function emptyZipBlock(): PricingFormValues["zips"][number] {
  const prices = Object.fromEntries(PRICING_SERVICES.map((service) => [service, ""])) as Record<
    PricingService,
    string
  >;
  return { zip: "", prices };
}

export function emptyPricingFormValues(): PricingFormValues {
  return {
    providerName: "",
    email: "",
    phone: "",
    notes: "",
    zips: [emptyZipBlock()],
  };
}

export function toServicePricingPayload(values: PricingFormValues) {
  return {
    provider_name: values.providerName.trim(),
    provider_email: values.email.trim(),
    provider_phone: values.phone.trim() ? values.phone.trim() : null,
    notes: values.notes.trim() ? values.notes.trim() : null,
    zips: values.zips.map((block) => ({
      zip: block.zip.trim(),
      prices: Object.fromEntries(
        PRICING_SERVICES.map((service) => [service, block.prices[service].trim()]),
      ),
    })),
  };
}

/** Read `?name=&email=` from the approval-email link. Caps match the form limits. */
export function readPricingQueryPrefill(search: string): { name: string; email: string } {
  const params = new URLSearchParams(search);
  const name = (params.get("name") ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
  const email = (params.get("email") ?? "").replace(/[\r\n]+/g, "").trim().slice(0, MAX_EMAIL_LENGTH);
  return { name, email };
}

export function applyPricingQueryPrefill(values: PricingFormValues, search: string): PricingFormValues {
  const query = readPricingQueryPrefill(search);
  return {
    ...values,
    providerName: query.name || values.providerName,
    email: query.email || values.email,
  };
}

export async function readPricingInvokeError(data: unknown, error: unknown): Promise<string> {
  const direct = readFunctionError(data, error, "");
  if (direct) return direct;

  const context =
    error && typeof error === "object" && "context" in error
      ? (error as { context?: unknown }).context
      : undefined;

  if (context instanceof Response) {
    try {
      const body: unknown = await context.clone().json();
      const parsed = readFunctionError(body, null, "");
      if (parsed) return parsed;
    } catch {
      // The function did not return JSON.
    }
  }

  return "Could not submit pricing. Please try again.";
}
