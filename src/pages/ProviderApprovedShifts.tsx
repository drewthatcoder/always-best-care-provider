import { useState, useEffect } from 'react';
import BottomNav from '@/components/BottomNav';
import JobCard, { type Job } from '@/components/JobCard';
import JobDetailsSheet from '@/components/JobDetailsSheet';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { CheckCircle2 } from 'lucide-react';

const ProviderApprovedShifts = () => {
  const { user } = useAuth();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchApprovedShifts = async () => {
      setLoading(true);

      const { data: bookings, error } = await supabase
        .from('bookings' as any)
        .select('*')
        .eq('provider_user_id', user.id)
        .in('status', ['approved', 'pending_client'])
        .order('scheduled_date', { ascending: true });

      if (error) {
        console.error('Error fetching approved shifts:', error);
        setLoading(false);
        return;
      }

      if (!bookings || bookings.length === 0) {
        setJobs([]);
        setLoading(false);
        return;
      }

      const clientIds = [...new Set((bookings as any[]).map((b: any) => b.client_user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', clientIds);

      const profileMap: Record<string, { first_name: string | null; last_name: string | null }> = {};
      (profiles || []).forEach((p: any) => {
        profileMap[p.user_id] = { first_name: p.first_name, last_name: p.last_name };
      });

      const mapped: Job[] = (bookings as any[]).map((b: any) => {
        const profile = profileMap[b.client_user_id];
        const dateObj = new Date(b.scheduled_date + 'T00:00:00');
        return {
          id: b.id,
          date: format(dateObj, 'EEE MMM dd yyyy').toUpperCase(),
          startTime: b.start_time,
          endTime: b.end_time,
          clientFirstName: profile?.first_name ?? undefined,
          clientLastName: profile?.last_name ?? undefined,
          service: b.service,
          clientZipCode: b.client_zip_code ?? undefined,
          status: b.status as Job['status'],
          providerViewed: b.provider_viewed ?? false,
          clientPhone: b.client_phone ?? undefined,
          clientAddress: b.client_address ?? undefined,
          clientAddressLine2: b.client_address_line2 ?? undefined,
          clientCity: b.client_city ?? undefined,
          clientState: b.client_state ?? undefined,
          clientDateOfBirth: b.client_date_of_birth ?? undefined,
          clientHeight: b.client_height ?? undefined,
          clientWeight: b.client_weight ?? undefined,
          clientResponsibleParty: b.client_responsible_party ?? undefined,
          clientResponsiblePartyName: b.client_responsible_party_name ?? undefined,
          clientResponsiblePartyEmail: b.client_responsible_party_email ?? undefined,
          clientAdditionalInfo: b.client_additional_info ?? undefined,
          clientRecurringWeekly: b.client_recurring_weekly ?? undefined,
          notes: b.notes ?? undefined,
        };
      });

      setJobs(mapped);
      setLoading(false);
    };

    fetchApprovedShifts();
  }, [user]);

  const handleJobClick = (job: Job) => {
    setSelectedJob(job);
    setSheetOpen(true);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="care-gradient pt-12 pb-6 px-6">
        <h1 className="text-xl font-semibold text-white text-center">Approved Shifts</h1>
      </div>

      <div className="px-4 pt-6">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading shifts...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <p className="text-muted-foreground">No approved shifts yet.</p>
            <p className="text-xs text-muted-foreground">Shifts you confirm will appear here once approved by the client.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onClick={() => handleJobClick(job)} />
            ))}
          </div>
        )}
      </div>

      <JobDetailsSheet job={selectedJob} open={sheetOpen} onOpenChange={setSheetOpen} />
      <BottomNav />
    </div>
  );
};

export default ProviderApprovedShifts;
