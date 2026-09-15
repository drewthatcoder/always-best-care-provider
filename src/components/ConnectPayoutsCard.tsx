import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Banknote, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  CONNECT_STATUS_ACTION,
  CONNECT_STATUS_LABEL,
  deriveConnectStatus,
  type ConnectProfile,
  type ConnectStatus,
} from "@/lib/connectStatus";

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

const ConnectPayoutsCard = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = useState<ConnectProfile | null>(null);
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
      setProfile((base.data as ConnectProfile | null) ?? null);
      setLoading(false);
      return;
    }

    if (full.error) {
      toast.error(full.error.message);
      setLoading(false);
      return;
    }

    setProfile((full.data as ConnectProfile | null) ?? null);
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
      const { data: accountData, error: accountError } = await supabase.functions.invoke(
        "create-connected-account",
        { body: {} },
      );
      if (accountError) throw accountError;
      if (accountData?.error) throw new Error(accountData.error);

      const origin = window.location.origin;
      const { data: linkData, error: linkError } = await supabase.functions.invoke(
        "create-account-link",
        {
          body: {
            origin,
            returnUrl: `${origin}/settings?connect=return`,
            refreshUrl: `${origin}/settings?connect=refresh`,
            accountId: accountData?.accountId,
          },
        },
      );
      if (linkError) throw linkError;
      if (linkData?.error) throw new Error(linkData.error);
      if (!linkData?.url) throw new Error("Stripe did not return an onboarding link.");

      window.location.assign(linkData.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start Stripe Connect";
      toast.error(message);
      setStarting(false);
    }
  };

  const status = deriveConnectStatus(profile);

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
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              TEST mode
            </Badge>
            <Badge variant="outline" className={statusBadgeClass(status)}>
              {CONNECT_STATUS_LABEL[status]}
            </Badge>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Set up payouts so this franchise can receive TEST-mode transfers later. This does not
          charge clients and does not change franchise registration billing.
        </p>

        {profile?.stripe_account_id && (
          <p className="text-xs text-muted-foreground font-mono break-all">
            Account {profile.stripe_account_id}
          </p>
        )}

        <Button
          size="sm"
          className="gap-1"
          onClick={startOnboarding}
          disabled={starting || loading || !user}
        >
          {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
          {CONNECT_STATUS_ACTION[status]}
        </Button>
      </div>
    </div>
  );
};

export default ConnectPayoutsCard;
