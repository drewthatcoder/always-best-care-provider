import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EMAIL_FROM } from "../../supabase/functions/_shared/email.ts";
import {
  escapeHtml,
  formatUsdFromCents,
  servicePricingEmailHtml,
  servicePricingResendPayload,
} from "../../supabase/functions/submit-service-pricing/email.ts";
import {
  MAX_NOTES_LENGTH,
  MAX_ZIP_CODES,
  PRICING_SERVICES,
  parseDollarToCents,
  validateServicePricing,
  type NormalizedServicePricing,
} from "../../supabase/functions/submit-service-pricing/validate.ts";
import {
  SERVICE_DETAILS,
  emptyPricingFormValues,
  pricingFormSchema,
  toServicePricingPayload,
} from "./servicePricing";

const migrationPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../supabase/migrations/20260929203000_provider_service_pricing.sql",
);

function prices(amount: string): Record<(typeof PRICING_SERVICES)[number], string> {
  return Object.fromEntries(PRICING_SERVICES.map((service) => [service, amount])) as Record<
    (typeof PRICING_SERVICES)[number],
    string
  >;
}

function invalidMessages(result: ReturnType<typeof validateServicePricing>): string[] {
  const failed = result as { ok: boolean; messages?: string[] };
  if (!failed.messages) throw new Error("expected validation to fail");
  return failed.messages;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    provider_name: "Jordan Lee",
    provider_email: "jordan@example.com",
    provider_phone: "(555) 010-2000",
    notes: "Weekends after 9am",
    zips: [
      { zip: "75201", prices: prices("45") },
      { zip: "78701", prices: prices("12.50") },
    ],
    ...overrides,
  };
}

describe("service pricing validation", () => {
  it("keeps the eight mobile services in order", () => {
    expect([...PRICING_SERVICES]).toEqual([
      "Bathing & Grooming",
      "Dressing Assistance",
      "Transferring",
      "Walking Assistance",
      "Meal Prep",
      "Light Housekeeping",
      "Medication Assistance",
      "Transportation",
    ]);
    expect(SERVICE_DETAILS["Bathing & Grooming"]).toBe("Personal hygiene assistance");
    expect(SERVICE_DETAILS["Dressing Assistance"]).toBe("Help with clothing and dressing");
    expect(SERVICE_DETAILS.Transferring).toBe("Safe mobility assistance");
    expect(SERVICE_DETAILS["Walking Assistance"]).toBe("Support for safe movement");
    expect(SERVICE_DETAILS["Meal Prep"]).toBe("Healthy meal planning & cooking");
    expect(SERVICE_DETAILS["Light Housekeeping"]).toBe("Cleaning and home organization");
    expect(SERVICE_DETAILS["Medication Assistance"]).toBe("Timely medication management");
    expect(SERVICE_DETAILS.Transportation).toBe("Rides to appointments & errands");
  });

  it("converts dollar amounts to cents and rejects extra decimals", () => {
    expect(parseDollarToCents("0")).toBe(0);
    expect(parseDollarToCents("45")).toBe(4500);
    expect(parseDollarToCents("12.5")).toBe(1250);
    expect(parseDollarToCents("12.50")).toBe(1250);
    expect(parseDollarToCents(12.5)).toBe(1250);
    expect(parseDollarToCents("01234.50")).toBe(1_234_50);
    expect(parseDollarToCents("-1")).toBeNull();
    expect(parseDollarToCents("12.555")).toBeNull();
    expect(parseDollarToCents("12.345")).toBeNull();
    expect(parseDollarToCents("$12")).toBeNull();
    expect(parseDollarToCents("")).toBeNull();
  });

  it("accepts a complete submission and stores cents", () => {
    const result = validateServicePricing(validBody());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.zips).toHaveLength(2);
    expect(result.value.zips[0]?.zip).toBe("75201");
    expect(result.value.zips[0]?.prices["Bathing & Grooming"]).toBe(4500);
    expect(result.value.zips[1]?.prices.Transportation).toBe(1250);
    expect(result.value.providerPhone).toBe("(555) 010-2000");
  });

  it("keeps a leading-zero zip as text", () => {
    const result = validateServicePricing(validBody({ zips: [{ zip: "01234", prices: prices("0.00") }] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.zips[0]?.zip).toBe("01234");
    expect(result.value.zips[0]?.prices["Meal Prep"]).toBe(0);
  });

  it("rejects duplicate zips, bad zips, missing services, and long notes", () => {
    const duplicate = validateServicePricing(
      validBody({
        zips: [
          { zip: "75201", prices: prices("10") },
          { zip: "75201", prices: prices("11") },
        ],
      }),
    );
    expect(duplicate.ok).toBe(false);
    expect(invalidMessages(duplicate)).toContain("Duplicate zip code: 75201.");

    const badZip = validateServicePricing(validBody({ zips: [{ zip: "123", prices: prices("10") }] }));
    expect(badZip.ok).toBe(false);
    expect(invalidMessages(badZip).some((message) => message.includes("5-digit"))).toBe(true);

    const missing = validateServicePricing(
      validBody({
        zips: [{ zip: "75201", prices: { ...prices("10"), Transportation: undefined } }],
      }),
    );
    expect(missing.ok).toBe(false);
    expect(invalidMessages(missing).some((message) => message.includes("Transportation"))).toBe(true);

    const notes = validateServicePricing(validBody({ notes: "x".repeat(MAX_NOTES_LENGTH + 1) }));
    expect(notes.ok).toBe(false);
    expect(invalidMessages(notes).some((message) => message.includes(String(MAX_NOTES_LENGTH)))).toBe(true);

    const tooMany = validateServicePricing(
      validBody({
        zips: Array.from({ length: MAX_ZIP_CODES + 1 }, (_, index) => ({
          zip: String(10000 + index),
          prices: prices("1"),
        })),
      }),
    );
    expect(tooMany.ok).toBe(false);
    expect(invalidMessages(tooMany).some((message) => message.includes(String(MAX_ZIP_CODES)))).toBe(true);
  });

  it("flags duplicate zips on the client schema", () => {
    const values = emptyPricingFormValues();
    values.providerName = "Jordan Lee";
    values.email = "jordan@example.com";
    values.zips = [
      { zip: "75201", prices: prices("10") },
      { zip: "75201", prices: prices("12.50") },
    ];
    const parsed = pricingFormSchema.safeParse(values);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const zipMessages = parsed.error.issues.filter((issue) => issue.path.at(-1) === "zip").map((issue) => issue.message);
    expect(zipMessages).toContain("This zip code is already listed");
  });
});

describe("service pricing email", () => {
  const submission: NormalizedServicePricing & { submissionId: string } = {
    providerName: `Jordan <script>alert(1)</script>`,
    providerEmail: "jordan@example.com",
    providerPhone: `555 & main`,
    notes: "Tom & <Jerry>\nLine 2",
    submissionId: "11111111-1111-1111-1111-111111111111",
    zips: [
      {
        zip: "75201",
        prices: Object.fromEntries(PRICING_SERVICES.map((service) => [service, 4500])) as NormalizedServicePricing["zips"][number]["prices"],
      },
      {
        zip: "78701",
        prices: Object.fromEntries(PRICING_SERVICES.map((service) => [service, 1250])) as NormalizedServicePricing["zips"][number]["prices"],
      },
    ],
  };

  it("escapes user text and formats one row per zip", () => {
    const html = servicePricingEmailHtml(submission);
    expect(html).toContain("Jordan &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("555 &amp; main");
    expect(html).toContain("Tom &amp; &lt;Jerry&gt;<br>Line 2");
    expect(html).toContain("Bathing &amp; Grooming");
    expect(html).not.toContain("Bathing & Grooming");
    expect(html).toContain("$45.00");
    expect(html).toContain("$12.50");
    expect(html).toContain(">75201<");
    expect(html).toContain(">78701<");
    const bathing = html.indexOf("Bathing &amp; Grooming");
    const transportation = html.indexOf(">Transportation<");
    expect(bathing).toBeGreaterThan(-1);
    expect(transportation).toBeGreaterThan(bathing);
    expect(escapeHtml(`"`)).toBe("&quot;");
    expect(formatUsdFromCents(0)).toBe("$0.00");
    expect(formatUsdFromCents(125000)).toBe("$1,250.00");
  });

  it("sets reply-to to the provider and sends from the shared address", () => {
    const payload = servicePricingResendPayload(submission);
    expect(payload.from).toBe(EMAIL_FROM);
    expect(payload.to).toEqual(["techsupport@cityoftreestech.com"]);
    expect(payload.reply_to).toBe("jordan@example.com");
    expect(payload.subject).toBe("Service pricing from Jordan <script>alert(1)</script>");
  });
});

describe("service pricing payload", () => {
  it("sends trimmed dollar strings and nulls empty optional fields", () => {
    const values = emptyPricingFormValues();
    values.providerName = " Jordan Lee ";
    values.email = " jordan@example.com ";
    values.phone = " ";
    values.notes = " ";
    values.zips[0] = { zip: "75201", prices: prices("10.00") };
    expect(toServicePricingPayload(values)).toMatchObject({
      provider_name: "Jordan Lee",
      provider_email: "jordan@example.com",
      provider_phone: null,
      notes: null,
      zips: [{ zip: "75201" }],
    });
  });
});

describe("provider_service_pricing migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("creates the table, indexes, and a self-read policy without an insert policy", () => {
    expect(sql).toContain("create table if not exists public.provider_service_pricing");
    expect(sql).toContain("submission_id uuid not null");
    expect(sql).toContain("references auth.users (id) on delete set null");
    expect(sql).toContain("price_cents integer not null");
    expect(sql).toContain("price_cents >= 0");
    expect(sql).toContain("provider_service_pricing_submission_id_idx");
    expect(sql).toContain("provider_service_pricing_zip_idx");
    expect(sql).toContain("provider_service_pricing_provider_email_idx");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("user_id = auth.uid()");
    expect(sql.toLowerCase()).not.toContain("for insert");
    expect(sql.toLowerCase()).not.toContain("for update");
    expect(sql.toLowerCase()).not.toContain("for delete");
  });
});
