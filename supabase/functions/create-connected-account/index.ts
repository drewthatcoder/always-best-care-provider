import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { getStripe } from "../_shared/stripe.ts";
import { getServiceClient, requireUser } from "../_shared/supabase.ts";

/**
 * Auth'd provider → Stripe Express (or Standard fallback) connected account.
 * Idempotent: if provider_profiles.stripe_account_id is already set, reuse it.
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

    const stripe = getStripe();
    const admin = getServiceClient();

    const { data: existing, error: lookupError } = await admin
      .from("provider_profiles")
      .select("id, user_id, business_name, stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) {
      return jsonResponse({ error: lookupError.message }, 500);
    }

    if (existing?.stripe_account_id) {
      try {
        const account = await stripe.accounts.retrieve(existing.stripe_account_id);
        return jsonResponse({
          accountId: account.id,
          created: false,
          alreadyExisted: true,
          livemode: false,
        });
      } catch (retrieveError) {
        console.warn(
          "Stored stripe_account_id could not be retrieved; creating a new TEST account",
          retrieveError,
        );
      }
    }

    const metadata = {
      supabase_user_id: user.id,
      portal: "always-best-care-provider",
      mode: "test",
    };

    const common: Record<string, unknown> = {
      country: "US",
      email: user.email ?? undefined,
      metadata,
      business_profile: {
        name: existing?.business_name || undefined,
        product_description: "Always Best Care in-home care services (TEST)",
      },
    };

    let account;
    let accountType: "express" | "standard" = "express";
    try {
      account = await stripe.accounts.create({
        ...common,
        type: "express",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
    } catch (expressError) {
      console.warn("Express account unavailable; falling back to Standard", expressError);
      accountType = "standard";
      account = await stripe.accounts.create({
        ...common,
        type: "standard",
      });
    }

    if (existing?.id) {
      const { error: updateError } = await admin
        .from("provider_profiles")
        .update({ stripe_account_id: account.id })
        .eq("user_id", user.id);
      if (updateError) return jsonResponse({ error: updateError.message }, 500);
    } else {
      const { error: insertError } = await admin.from("provider_profiles").insert({
        user_id: user.id,
        stripe_account_id: account.id,
        business_name: existing?.business_name ?? null,
      });
      if (insertError) return jsonResponse({ error: insertError.message }, 500);
    }

    return jsonResponse({
      accountId: account.id,
      created: true,
      alreadyExisted: false,
      accountType,
      livemode: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("create-connected-account", message);
    return jsonResponse({ error: message }, 500);
  }
});
