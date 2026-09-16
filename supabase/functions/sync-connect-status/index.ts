import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { flagsFromAccount, persistConnectFlags } from "../_shared/connectFlags.ts";
import { getStripe } from "../_shared/stripe.ts";
import { getServiceClient, requireUser } from "../_shared/supabase.ts";

type Body = {
  accountId?: string;
};

/**
 * Retrieves the provider's Stripe Connect account and writes capability flags.
 * Recovers Settings badge state when account.updated webhooks were missed.
 * TEST mode only. Does not charge clients or create transfers.
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

    const stripe = getStripe();
    const admin = getServiceClient();

    const { data: profile, error: lookupError } = await admin
      .from("provider_profiles")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (lookupError) return jsonResponse({ error: lookupError.message }, 500);

    const accountId = profile?.stripe_account_id ?? undefined;
    if (!accountId) {
      return jsonResponse(
        { error: "No connected account yet. Call create-connected-account first." },
        400,
      );
    }

    if (body.accountId && body.accountId !== accountId) {
      return jsonResponse({ error: "Stripe account does not belong to this provider." }, 403);
    }

    const account = await stripe.accounts.retrieve(accountId);
    const flags = flagsFromAccount(account);
    const persist = await persistConnectFlags(admin, accountId, flags);

    return jsonResponse({
      accountId,
      ...flags,
      persisted: persist.persisted,
      warning: persist.warning ?? persist.error,
      livemode: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("sync-connect-status", message);
    return jsonResponse({ error: message }, 500);
  }
});
