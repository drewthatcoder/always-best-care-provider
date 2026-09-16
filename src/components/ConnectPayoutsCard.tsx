import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Banknote, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { stripeAccountLinkBody } from "@/lib/accountLinkUrls";
import {
  CONNECT_STATUS_ACTION,
  CONNECT_STATUS_LABEL,
  connectModeBadge,
  deriveConnectStatus,
  readLivemode,
  type ConnectProfile,
  type ConnectStatus,
} from "@/lib/connectStatus";
import { isConnectComplete, readFunctionError } from "@/lib/invokeFunction";

const FULL_SELECT =
  "id, user_id, business_name, stripe_account_id, stripe_customer_id, subscription_status, charges_enabled, payouts_enabled, details_submitted, onboarding_complete";
const BASE_SELECT =
  "id, user_id, business_name, stripe_account_id, stripe_customer_id, subscription_status";

function statusBadgeClass(status: ConnectStatus): string {
  if (status === "connected") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (status === "restricted") return "bg-red-100 text-red-800 border-red-200";
  if (status === "incomplete") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-muted text-muted-foreground";
}

function mergeConnectFlags(
  profile: ConnectProfile,
  flags: Partial<ConnectProfile> | null | undefined,
): ConnectProfile {
  if (!flags) return profile;
  return {
    ...profile,
    stripe_account_id: flags.stripe_account_id ?? profile.stripe_account_id,
    charges_enabled: flags.charges_enabled ?? profile.charges_enabled,
    payouts_enabled: flags.payouts_enabled ?? profile.payouts_enabled,
    details_submitted: flags.details_submitted ?? profile.details_submitted,
    onboarding_complete: flags.onboarding_complete ?? profile.onboarding_complete,
  };
}

const ConnectPayoutsCard = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = useState<ConnectProfile | null>(null);
  const [livemode, setLivemode] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const full = await supabase
      .from("provider_profiles")
      .select(FULL_SELECT)
      .eq("user_id", user.id)
      .maybeSingle();

    let loaded: ConnectProfile | null = null;

    if (full.error && /does not exist|schema cache/i.test(full.error.message)) {
      const base = await supabase
        .from("provider_profiles")
        .select(BASE_SELECT)
        .eq("user_id", user.id)
        .maybeSingle();
      if (base.error) {
        toast.error(base.error.message);
        setLoading(false);
        return;
      }
      loaded = (base.data as ConnectProfile | null) ?? null;
    } else if (full.error) {
      toast.error(full.error.message);
      setLoading(false);
      return;
    } else {
      loaded = (full.data as ConnectProfile | null) ?? null;
    }

    const { data: syncData } = await supabase.functions.invoke("sync-connect-status", {
      body: loaded?.stripe_account_id ? { accountId: loaded.stripe_account_id } : {},
    });
    const syncedMode = readLivemode(syncData);
    if (syncedMode !== null) setLivemode(syncedMode);
    if (
      loaded &&
      syncData &&
      (syncData.charges_enabled !== undefined || syncData.onboarding_complete !== undefined)
    ) {
      loaded = mergeConnectFlags(loaded, {
        stripe_account_id: syncData.accountId ?? loaded.stripe_account_id,
        charges_enabled: syncData.charges_enabled,
        payouts_enabled: syncData.payouts_enabled,
        details_submitted: syncData.details_submitted,
        onboarding_complete: syncData.onboarding_complete,
      });
    }

    setProfile(loaded);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const connect = searchParams.get("connect");
    if (!connect) return;

    if (connect === "return") {
      toast.success("Returned from Stripe. Refreshing payout status…");
      loadProfile();
    } else if (connect === "refresh") {
      toast.message("Stripe needs you to restart onboarding.");
    }

    const next = new URLSearchParams(searchParams);
    next.delete("connect");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, loadProfile]);

  const startOnboarding = async () => {
    if (!user) {
      toast.error("Sign in to set up payouts.");
      return;
    }

    setStarting(true);
    try {
      const origin = window.location.origin;
      const { data: accountData, error: accountError } = await supabase.functions.invoke(
        "create-connected-account",
        { body: {} },
      );
      if (accountError || accountData?.error) {
        throw new Error(
          readFunctionError(accountData, accountError, "Could not create a Stripe connected account."),
        );
      }

      const createdMode = readLivemode(accountData);
      if (createdMode !== null) setLivemode(createdMode);

      const nextProfile = mergeConnectFlags(profile ?? { stripe_account_id: accountData?.accountId ?? null }, {
        stripe_account_id: accountData?.accountId ?? profile?.stripe_account_id ?? null,
        charges_enabled: accountData?.charges_enabled,
        payouts_enabled: accountData?.payouts_enabled,
        details_submitted: accountData?.details_submitted,
        onboarding_complete: accountData?.onboarding_complete,
      });
      setProfile(nextProfile);

      const alreadyComplete = isConnectComplete(accountData);
      const currentStatus = deriveConnectStatus(profile);

      if (alreadyComplete && currentStatus !== "connected") {
        toast.success("Stripe payouts are connected.");
        setStarting(false);
        return;
      }

      const { data: linkData, error: linkError } = await supabase.functions.invoke(
        "create-account-link",
        {
          body: {
            ...stripeAccountLinkBody(origin),
            accountId: accountData?.accountId,
          },
        },
      );

      const linkMode = readLivemode(linkData);
      if (linkMode !== null) setLivemode(linkMode);

      if (linkData && isConnectComplete(linkData)) {
        setProfile((prev) =>
          mergeConnectFlags(prev ?? nextProfile, {
            stripe_account_id: accountData?.accountId ?? prev?.stripe_account_id ?? null,
            charges_enabled: linkData.charges_enabled,
            payouts_enabled: linkData.payouts_enabled,
            details_submitted: linkData.details_submitted,
            onboarding_complete: linkData.onboarding_complete,
          }),
        );
        if (!linkData.url) {
          toast.success("Stripe payouts are connected.");
          setStarting(false);
          return;
        }
      }

      if (linkError || linkData?.error) {
        throw new Error(
          readFunctionError(linkData, linkError, "Could not open Stripe setup. Refresh payout status and try again."),
        );
      }
      if (!linkData?.url) throw new Error("Stripe did not return an onboarding link.");

      window.location.assign(linkData.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start Stripe Connect";
      toast.error(message);
      setStarting(false);
    }
  };

  const status = deriveConnectStatus(profile);
  const modeBadge = connectModeBadge(livemode);

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground mb-2 px-1">Payouts</h2>
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-primary shrink-0" />
            <span className="font-medium text-sm">Connect Stripe</span>
          </div>
          <div className="flex items-center gap-2">
            {modeBadge === "TEST" && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                TEST mode
              </Badge>
            )}
            {modeBadge === "LIVE" && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                LIVE
              </Badge>
            )}
            <Badge variant="outline" className={statusBadgeClass(status)}>
              {CONNECT_STATUS_LABEL[status]}
            </Badge>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {livemode === false
            ? "Set up payouts so this franchise can receive TEST-mode transfers later. This does not charge clients and does not change franchise registration billing."
            : "Set up payouts so this franchise can receive transfers to its connected Stripe account. This does not charge clients and does not change franchise registration billing."}
        </p>

        {profile?.stripe_account_id && (
          <p className="text-xs text-muted-foreground font-mono break-all">
            Account {profile.stripe_account_id}
          </p>
        )}

        {!user && (
          <p className="text-xs text-muted-foreground">
            Sign in as a provider to start Connect onboarding.
          </p>
        )}

        {status !== "connected" && (
          <Button
            size="sm"
            className="gap-1"
            onClick={startOnboarding}
            disabled={starting || loading || !user}
          >
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            {CONNECT_STATUS_ACTION[status]}
          </Button>
        )}

        {status === "connected" && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={startOnboarding}
            disabled={starting || loading || !user}
          >
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            {CONNECT_STATUS_ACTION.connected}
          </Button>
        )}
      </div>
    </div>
  );
};

export default ConnectPayoutsCard;
