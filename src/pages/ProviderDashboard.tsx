import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import JobCard, { type Job } from '@/components/JobCard';
import JobDetailsSheet from '@/components/JobDetailsSheet';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

const ProviderDashboard = () => {
  const { user } = useAuth();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  useEffect(() => {
    const checkApplicationStatus = async () => {
      if (!user) {
        setCheckingStatus(false);
        return;
      }

      const { data, error } = await supabase
        .from('provider_applications')
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && data) {
        setApplicationStatus(data.status);
      }
      setCheckingStatus(false);
    };

    checkApplicationStatus();
  }, [user]);

  useEffect(() => {
    if (!user || checkingStatus) return;
    if (applicationStatus && applicationStatus !== 'approved') {
      setLoadingJobs(false);
      return;
    }

    const fetchJobs = async () => {
      setLoadingJobs(true);

      const { data: bookings, error } = await supabase
        .from('bookings' as any)
        .select('*')
        .in('status', ['upcoming', 'in-progress', 'confirmed'])
        .order('scheduled_date', { ascending: true });

      if (error) {
        console.error('Error fetching bookings:', error);
        setLoadingJobs(false);
        return;
      }

      if (!bookings || bookings.length === 0) {
        setJobs([]);
        setLoadingJobs(false);
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
      setLoadingJobs(false);
    };

    fetchJobs();
  }, [user, checkingStatus, applicationStatus]);

  const handleJobClick = async (job: Job) => {
    setSelectedJob(job);
    setSheetOpen(true);

    if (!job.providerViewed) {
      await supabase.from('bookings' as any).update({ provider_viewed: true }).eq('id', job.id);
      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, providerViewed: true } : j)));
    }
  };

  if (checkingStatus) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (applicationStatus && applicationStatus !== 'approved') {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="care-gradient safe-area-top">
          <div className="max-w-md mx-auto px-6 py-6">
            <h1 className="text-xl font-bold text-primary-foreground">Application Status</h1>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center space-y-4 max-w-sm">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Clock className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">
              {applicationStatus === 'pending' ? 'Application Under Review' : 'Application Not Approved'}
            </h2>
            <p className="text-muted-foreground text-sm">
              {applicationStatus === 'pending'
                ? 'Your provider application is currently being reviewed by our team. You will receive full access to your account once approved.'
                : 'Unfortunately, your application was not approved. Please contact support for more information.'}
            </p>
            {applicationStatus === 'pending' && (
              <div className="bg-muted/50 rounded-xl p-4 mt-4">
                <p className="text-xs text-muted-foreground">
                  This usually takes 1–2 business days. You'll be notified once a decision has been made.
                </p>
              </div>
            )}
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="care-gradient pt-12 pb-6 px-6">
        <h1 className="text-xl font-semibold text-white text-center">My Jobs</h1>
      </div>

      <div className="px-4 pt-6">
        {loadingJobs ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading jobs...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No jobs available in your territory.</p>
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

export default ProviderDashboard;
