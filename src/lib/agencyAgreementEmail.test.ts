import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AGREEMENT_BASE64 } from "../../supabase/functions/submit-provider-application/agreementAttachment.ts";
import {
  AGREEMENT_FILENAME,
  AGREEMENT_RETURN_EMAIL,
  AGREEMENT_SUBJECT,
  EMAIL_FROM,
  agreementEmailHtml,
  agreementEmailSubject,
  buildAgreementResendBody,
  greetingName,
  isValidEmail,
} from "../../supabase/functions/submit-provider-application/email.ts";

const docxPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../supabase/functions/submit-provider-application/assets/Agency-Subscriber-Agreement.docx",
);

describe("submit-provider-application email", () => {
  it("keeps the hosted Resend from address", () => {
    expect(EMAIL_FROM).toBe("CareConnect <onboarding@resend.dev>");
  });

  it("asks the provider to sign and return the attached agreement", () => {
    const html = agreementEmailHtml("Jordan");
    expect(agreementEmailSubject()).toBe(AGREEMENT_SUBJECT);
    expect(html).toContain("Hi Jordan");
    expect(html).toContain("Thank you for creating your Always Best Care provider account");
    expect(html).toContain("download the attached Agency Subscriber Agreement");
    expect(html).toContain("sign it");
    expect(html).toContain(`mailto:${AGREEMENT_RETURN_EMAIL}`);
    expect(html).toContain(AGREEMENT_RETURN_EMAIL);
    expect(html).not.toContain("lovable.app");
  });

  it("escapes provider names in HTML", () => {
    expect(agreementEmailHtml(`<img src=x onerror=alert(1)>`)).toContain(
      "Hi &lt;img src=x onerror=alert(1)&gt;",
    );
    expect(agreementEmailHtml(`<img src=x onerror=alert(1)>`)).not.toContain("<img src=x");
  });

  it("validates email and greeting fallbacks", () => {
    expect(isValidEmail("owner@abc-seniors.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(greetingName("  Pat  ")).toBe("Pat");
    expect(greetingName("")).toBe("there");
  });

  it("attaches the bundled Agency Subscriber Agreement docx", () => {
    const docx = readFileSync(docxPath);
    expect(docx.subarray(0, 2).toString()).toBe("PK");
    expect(Buffer.from(AGREEMENT_BASE64, "base64")).toEqual(docx);

    const body = buildAgreementResendBody({
      to: " owner@example.com ",
      firstName: "Jordan",
      attachmentBase64: AGREEMENT_BASE64,
    });
    expect(body.from).toBe(EMAIL_FROM);
    expect(body.to).toEqual(["owner@example.com"]);
    expect(body.subject).toBe(AGREEMENT_SUBJECT);
    expect(body.attachments).toEqual([
      {
        filename: AGREEMENT_FILENAME,
        content: AGREEMENT_BASE64,
        content_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ]);
  });
});
