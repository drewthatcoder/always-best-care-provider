import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  chargeConfirmationText,
  chargeConfirmBlocked,
  isChargeError,
  messageForChargeCode,
  requestChargePreview,
  requestCompleteAndCharge,
  type ChargePreview,
} from "@/lib/bookingCharge";
import { toast } from "sonner";
import type { Job } from "./JobCard";

interface CompleteAndChargeDialogProps {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
  onRefresh?: () => void;
}

const CompleteAndChargeDialog = ({
  job,
  open,
  onOpenChange,
  onCompleted,
  onRefresh,
}: CompleteAndChargeDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [charging, setCharging] = useState(false);
  const [preview, setPreview] = useState<ChargePreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !job) return;
    let cancelled = false;
    setLoading(true);
    setCharging(false);
    setPreview(null);
    setMessage(null);
    requestChargePreview(job.id)
      .then((result) => {
        if (cancelled) return;
        if (isChargeError(result)) {
          setMessage(messageForChargeCode(result.code, result.error));
          if (result.code === "unknown") onRefresh?.();
          return;
        }
        if (result.kind !== "preview") {
          setMessage(messageForChargeCode("unknown"));
          onRefresh?.();
          return;
        }
        setPreview(result.preview);
        if (result.preview.code) setMessage(messageForChargeCode(result.preview.code));
      })
      .catch(() => {
        if (cancelled) return;
        setMessage(messageForChargeCode("unknown"));
        onRefresh?.();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, job?.id]);

  const blocked = chargeConfirmBlocked(preview?.code);
  const canConfirm = Boolean(preview) && !blocked && !loading && !charging;
  const sentence = preview && preview.amountCents > 0 && preview.code !== "no_card"
    ? chargeConfirmationText(preview)
    : null;

  const confirm = async () => {
    if (!job || !canConfirm) return;
    setCharging(true);
    setMessage(null);
    try {
      const result = await requestCompleteAndCharge(job.id);
      if (isChargeError(result)) {
        setMessage(result.error);
        if (result.code === "unknown") onRefresh?.();
        if (result.code === "already_charged") onCompleted?.();
        return;
      }
      if (result.kind === "completed") {
        toast.success(result.code === "already_charged" ? "This visit was already charged." : "Visit completed and charged.");
        onOpenChange(false);
        onCompleted?.();
      }
    } catch {
      setMessage(messageForChargeCode("unknown"));
      onRefresh?.();
    } finally {
      setCharging(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!charging) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark complete & charge</AlertDialogTitle>
          <AlertDialogDescription>
            {loading ? "Checking the card on file…" : sentence || "Review this charge before confirming."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {message && (
          <p data-testid="charge-message" className="text-sm text-foreground">
            {message}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={charging}>Cancel</AlertDialogCancel>
          <Button
            data-testid="confirm-charge"
            onClick={confirm}
            disabled={!canConfirm}
          >
            {charging ? "Charging…" : preview?.code === "already_charged" ? "Mark complete" : "Charge"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CompleteAndChargeDialog;
