import { useState, useEffect } from 'react';
import BottomNav from '@/components/BottomNav';
import JobCard, { type Job } from '@/components/JobCard';
import JobDetailsSheet from '@/components/JobDetailsSheet';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { mapBookingToJob, type BookingRow, type ClientNameMap } from '@/lib/providerJobs';
import { CheckCircle2 } from 'lucide-react';

const ProviderApprovedShifts = () => {
  const { user } = useAuth();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchApprovedShifts = async () => {
      setLoading(true);

      const { data: bookings, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('provider_user_id', user.id)
        .in('status', ['approved', 'pending_client'])
        .order('scheduled_date', { ascending: true });

      if (error) {
        console.error('Error fetching approved shifts:', error);
        setLoading(false);
        return;
      }

      const rows = (bookings || []) as unknown as BookingRow[];
      if (rows.length === 0) {
        setJobs([]);
        setLoading(false);
        return;
      }

      const clientIds = [...new Set(rows.map((b) => b.client_user_id).filter(Boolean))];
      const profileMap: ClientNameMap = {};
      if (clientIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', clientIds);
        (profiles || []).forEach((p) => {
          profileMap[p.user_id] = { first_name: p.first_name, last_name: p.last_name };
        });
      }

      setJobs(rows.map((b) => mapBookingToJob(b, profileMap)));
      setLoading(false);
    };

    fetchApprovedShifts();
  }, [user, reloadKey]);

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

      <JobDetailsSheet
        job={selectedJob}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onCompleted={() => setReloadKey((key) => key + 1)}
      />
      <BottomNav />
    </div>
  );
};

export default ProviderApprovedShifts;
