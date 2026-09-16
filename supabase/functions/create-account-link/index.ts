import { resolveAccountLinkUrls } from "../_shared/accountLinkUrls.ts";
import { flagsFromAccount, persistConnectFlags } from "../_shared/connectFlags.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { getStripe, isPlatformLive } from "../_shared/stripe.ts";
import { livemodeFromStripeObject } from "../_shared/stripeMode.ts";
import { getServiceClient, requireUser } from "../_shared/supabase.ts";

type Body = {
  origin?: string;
  returnUrl?: string;
  refreshUrl?: string;
  accountId?: string;
};

/**
 * Creates a Stripe AccountLink so the provider can finish Connect onboarding.
 * Return/refresh land on /settings. Mode follows STRIPE_SECRET_KEY.
 *
 * Already-complete accounts persist flags and either return an account_update /
 * login link or a 200 with alreadyComplete so Settings can show Connected.
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

    const urls = resolveAccountLinkUrls(body, {
      PROVIDER_APP_URL: Deno.env.get("PROVIDER_APP_URL") ?? undefined,
      SITE_URL: Deno.env.get("SITE_URL") ?? undefined,
      APP_URL: Deno.env.get("APP_URL") ?? undefined,
    });
    if ("error" in urls) return jsonResponse({ error: urls.error }, 400);

    const stripe = getStripe();
    const admin = getServiceClient();
    const platformLive = isPlatformLive();

    const { data: profile, error: lookupError } = await admin
      .from("provider_profiles")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (lookupError) return jsonResponse({ error: lookupError.message }, 500);

    if (body.accountId && profile?.stripe_account_id && body.accountId !== profile.stripe_account_id) {
      return jsonResponse({ error: "Stripe account does not belong to this provider." }, 403);
    }

    const accountId = profile?.stripe_account_id ?? body.accountId;
    if (!accountId) {
      return jsonResponse(
        { error: "No connected account yet. Call create-connected-account first." },
        400,
      );
    }

    const account = await stripe.accounts.retrieve(accountId);
    const flags = flagsFromAccount(account);
    const persist = await persistConnectFlags(admin, accountId, flags);
    const alreadyComplete = flags.onboarding_complete || (flags.charges_enabled && flags.payouts_enabled);
    const preferredType = account.details_submitted ? "account_update" : "account_onboarding";

    const createLink = (type: "account_onboarding" | "account_update") =>
      stripe.accountLinks.create({
        account: accountId,
        refresh_url: urls.refreshUrl,
        return_url: urls.returnUrl,
        type,
      });

    try {
      const link = await createLink(preferredType);
      return jsonResponse({
        url: link.url,
        type: preferredType,
        alreadyComplete,
        ...flags,
        persisted: persist.persisted,
        warning: persist.warning,
        livemode: livemodeFromStripeObject(account, platformLive),
      });
    } catch (linkError) {
      const linkMessage =
        linkError instanceof Error ? linkError.message : "Could not create Stripe account link";
      console.warn("create-account-link preferred type failed", preferredType, linkMessage);

      if (preferredType === "account_update") {
        try {
          const fallback = await createLink("account_onboarding");
          return jsonResponse({
            url: fallback.url,
            type: "account_onboarding",
            alreadyComplete,
            ...flags,
            persisted: persist.persisted,
            warning: persist.warning,
            livemode: livemodeFromStripeObject(account, platformLive),
          });
        } catch (fallbackError) {
          console.warn("create-account-link onboarding fallback failed", fallbackError);
        }
      }

      if (alreadyComplete) {
        try {
          const login = await stripe.accounts.createLoginLink(accountId);
          return jsonResponse({
            url: login.url,
            type: "login_link",
            alreadyComplete: true,
            ...flags,
            persisted: persist.persisted,
            warning: persist.warning,
            livemode: livemodeFromStripeObject(account, platformLive),
          });
        } catch (loginError) {
          console.warn("create-account-link login_link failed", loginError);
          return jsonResponse({
            url: null,
            alreadyComplete: true,
            ...flags,
            persisted: persist.persisted,
            warning: linkMessage,
            livemode: livemodeFromStripeObject(account, platformLive),
          });
        }
      }

      return jsonResponse(
        {
          error: linkMessage,
          alreadyComplete: false,
          ...flags,
          persisted: persist.persisted,
          livemode: livemodeFromStripeObject(account, platformLive),
        },
        400,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("create-account-link", message);
    return jsonResponse({ error: message }, 500);
  }
});
