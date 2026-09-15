import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { getStripe } from "../_shared/stripe.ts";
import { getServiceClient, requireUser } from "../_shared/supabase.ts";

type Body = {
  origin?: string;
  returnUrl?: string;
  refreshUrl?: string;
  accountId?: string;
};

function isAbsoluteUrl(value: string | undefined): value is string {
  return !!value && /^https?:\/\//i.test(value);
}

function resolveUrls(body: Body): { returnUrl: string; refreshUrl: string } | { error: string } {
  if (isAbsoluteUrl(body.returnUrl) && isAbsoluteUrl(body.refreshUrl)) {
    return { returnUrl: body.returnUrl, refreshUrl: body.refreshUrl };
  }

  const envBase =
    Deno.env.get("PROVIDER_APP_URL") ||
    Deno.env.get("SITE_URL") ||
    Deno.env.get("APP_URL") ||
    body.origin;

  if (isAbsoluteUrl(envBase)) {
    const origin = envBase.replace(/\/$/, "");
    return {
      returnUrl: `${origin}/settings?connect=return`,
      refreshUrl: `${origin}/settings?connect=refresh`,
    };
  }

  return {
    error:
      "Stripe Account Links require absolute URLs. Pass origin from the browser or set PROVIDER_APP_URL.",
  };
}

/**
 * Creates a Stripe AccountLink so the provider can finish Connect onboarding.
 * Return/refresh land on /settings. TEST mode only.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { user, error: authError } = await requireUser(req);
    if (!user) return jsonResponse({ error: authError }, 401);

    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }

    const urls = resolveUrls(body);
    if ("error" in urls) return jsonResponse({ error: urls.error }, 400);

    const stripe = getStripe();
    const admin = getServiceClient();

    let accountId = body.accountId;
    if (!accountId) {
      const { data: profile, error: lookupError } = await admin
        .from("provider_profiles")
        .select("stripe_account_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (lookupError) return jsonResponse({ error: lookupError.message }, 500);
      accountId = profile?.stripe_account_id ?? undefined;
    }

    if (!accountId) {
      return jsonResponse(
        { error: "No connected account yet. Call create-connected-account first." },
        400,
      );
    }

    const account = await stripe.accounts.retrieve(accountId);
    const linkType = account.details_submitted ? "account_update" : "account_onboarding";

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: urls.refreshUrl,
      return_url: urls.returnUrl,
      type: linkType,
    });

    return jsonResponse({
      url: link.url,
      type: linkType,
      livemode: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("create-account-link", message);
    return jsonResponse({ error: message }, 500);
  }
});
