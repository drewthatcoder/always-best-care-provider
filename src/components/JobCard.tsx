import { Calendar, Clock, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCents } from '@/lib/bookingCharge';
import { jobStatusLabel, paymentBadgeLabel } from '@/lib/providerJobs';

export interface Job {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  clientName?: string;
  clientFirstName?: string;
  clientLastName?: string;
  location?: string;
  service?: string;
  clientZipCode?: string;
  status: 'upcoming' | 'in-progress' | 'completed' | 'cancelled' | 'confirmed' | 'pending_admin' | 'pending_client' | 'approved';
  providerViewed?: boolean;
  // Full client details
  clientPhone?: string;
  clientAddress?: string;
  clientAddressLine2?: string;
  clientCity?: string;
  clientState?: string;
  clientDateOfBirth?: string;
  clientHeight?: string;
  clientWeight?: string;
  clientResponsibleParty?: string;
  clientResponsiblePartyName?: string;
  clientResponsiblePartyEmail?: string;
  clientAdditionalInfo?: string;
  clientRecurringWeekly?: string;
  notes?: string;
  scheduledDate?: string;
  priceCents?: number | null;
  chargeAmountCents?: number | null;
  paymentStatus?: 'unpaid' | 'processing' | 'succeeded' | 'failed' | null;
}

interface JobCardProps {
  job: Job;
  onClick?: () => void;
}

const JobCard = ({ job, onClick }: JobCardProps) => {
  const statusStyles = {
    'upcoming': 'border-l-primary',
    'in-progress': 'border-l-care-orange',
    'completed': 'border-l-success',
    'cancelled': 'border-l-muted',
    'confirmed': 'border-l-success',
    'pending_admin': 'border-l-care-orange',
    'pending_client': 'border-l-care-orange',
    'approved': 'border-l-success',
  };

  const statusBadgeStyles: Partial<Record<Job['status'], string>> = {
    approved: 'bg-success/15 text-success border-success/30',
    confirmed: 'bg-success/15 text-success border-success/30',
    pending_client: 'bg-care-orange/15 text-care-orange border-care-orange/30',
    pending_admin: 'bg-care-orange/15 text-care-orange border-care-orange/30',
    'in-progress': 'bg-care-orange/15 text-care-orange border-care-orange/30',
    completed: 'bg-muted text-muted-foreground border-border',
    cancelled: 'bg-muted text-muted-foreground border-border',
  };
  // Open requests are already grouped under "Upcoming requests"; assigned jobs get an explicit badge.
  const showStatusBadge = job.status !== 'upcoming';
  const paymentLabel = paymentBadgeLabel(job.paymentStatus);
  const amountCents = job.paymentStatus === 'succeeded' && typeof job.chargeAmountCents === 'number'
    ? job.chargeAmountCents
    : typeof job.priceCents === 'number'
      ? job.priceCents
      : null;

  return (
    <div
      onClick={onClick}
      data-status={job.status}
      className={cn(
        "bg-card rounded-lg border border-border p-4 cursor-pointer",
        "hover:shadow-md transition-shadow",
        "border-l-4",
        statusStyles[job.status]
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span className="font-medium text-foreground">{job.date}</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>{job.startTime} ~ {job.endTime}</span>
          </div>

          {job.service && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{job.service}</span>
            </div>
          )}
          
          {(job.clientAddress || job.clientZipCode) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span>{job.clientAddress ? `${job.clientAddress}, ${job.clientCity || ''} ${job.clientState || ''} ${job.clientZipCode || ''}`.trim() : job.clientZipCode}</span>
            </div>
          )}
        </div>
        
        <div className="text-right space-y-1">
          {showStatusBadge && (
            <span
              data-testid="job-status-badge"
              className={cn(
                'inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap',
                statusBadgeStyles[job.status] ?? 'bg-muted text-muted-foreground border-border',
              )}
            >
              {jobStatusLabel(job.status)}
            </span>
          )}
          {paymentLabel && (
            <span
              data-testid="payment-badge"
              className={cn(
                'inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap',
                job.paymentStatus === 'failed'
                  ? 'bg-destructive/15 text-destructive border-destructive/30'
                  : 'bg-success/15 text-success border-success/30',
              )}
            >
              {paymentLabel}
            </span>
          )}
          {typeof amountCents === 'number' && amountCents > 0 && (
            <p data-testid="job-amount" className="text-sm font-semibold text-foreground">
              {formatCents(amountCents)}
            </p>
          )}
          {(job.clientFirstName || job.clientLastName || job.clientName) && (
            <>
              <p className="text-sm font-semibold text-foreground">
                {job.clientFirstName && job.clientLastName
                  ? `${job.clientFirstName} ${job.clientLastName.charAt(0)}.`
                  : job.clientName}
              </p>
              <p className="text-xs text-muted-foreground">Client</p>
            </>
          )}
          {!job.providerViewed && (
            <span className="inline-block text-[10px] font-bold bg-accent text-accent-foreground px-2 py-0.5 rounded-full">
              UPDATED
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default JobCard;
