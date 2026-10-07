import { useCallback, useEffect, useState } from 'react';
import type { Job } from '@/components/JobCard';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  MY_JOB_STATUSES,
  mapBookingToJob,
  selectCompletedJobs,
  selectMyJobs,
  selectUpcomingRequests,
  todayIsoDate,
  type BookingRow,
  type ClientNameMap,
} from '@/lib/providerJobs';

interface UseProviderJobsOptions {
  /** When false, skips the provider application check and job fetch (e.g. native client app). */
  enabled?: boolean;
}

/**
 * Loads the provider's application status plus two job lists:
 * - upcomingRequests: unassigned 'upcoming' bookings (RLS scopes to the provider's zip codes),
 *   dated today or later, sorted by scheduled_date ascending.
 * - myJobs: bookings assigned to this provider with status approved / pending_client /
 *   confirmed / in-progress; today & future first, sorted by date.
 */
export const useProviderJobs = ({ enabled = true }: UseProviderJobsOptions = {}) => {
  const { user } = useAuth();
  const [applicationStatus, setApplicationStatus] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(enabled);
  const [upcomingRequests, setUpcomingRequests] = useState<Job[]>([]);
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [completedJobs, setCompletedJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(enabled);
  const [reloadKey, setReloadKey] = useState(0);

  // Provider approval check (provider_applications)
  useEffect(() => {
    if (!enabled) return;
    const checkApplicationStatus = async () => {
      if (!user) { setCheckingStatus(false); return; }
      const { data, error } = await supabase
        .from('provider_applications')
        .select('status')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!error && data) setApplicationStatus(data.status);
      setCheckingStatus(false);
    };
    checkApplicationStatus();
  }, [user, enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!user) { setLoadingJobs(false); return; }
    if (checkingStatus) return;
    if (applicationStatus && applicationStatus !== 'approved') { setLoadingJobs(false); return; }

    let cancelled = false;
    const fetchJobs = async () => {
      setLoadingJobs(true);
      const today = todayIsoDate();

      const [upcomingRes, mineRes, completedRes] = await Promise.all([
        // Open requests — RLS limits these to the provider's service zip codes
        supabase
          .from('bookings')
          .select('*')
          .eq('status', 'upcoming')
          .is('provider_user_id', null)
          .gte('scheduled_date', today)
          .order('scheduled_date', { ascending: true }),
        supabase
          .from('bookings')
          .select('*')
          .eq('provider_user_id', user.id)
          .in('status', [...MY_JOB_STATUSES])
          .order('scheduled_date', { ascending: true }),
        supabase
          .from('bookings')
          .select('*')
          .eq('provider_user_id', user.id)
          .eq('status', 'completed')
          .order('scheduled_date', { ascending: false })
          .limit(50),
      ]);

      if (upcomingRes.error) console.error('Error fetching upcoming requests:', upcomingRes.error);
      if (mineRes.error) console.error('Error fetching my jobs:', mineRes.error);
      if (completedRes.error) console.error('Error fetching completed jobs:', completedRes.error);

      // Re-apply the filters client-side so the lists stay correct regardless of query shape.
      const upcomingRows = selectUpcomingRequests((upcomingRes.data as unknown as BookingRow[]) || [], today);
      const myRows = selectMyJobs((mineRes.data as unknown as BookingRow[]) || [], user.id, today);
      const completedRows = selectCompletedJobs((completedRes.data as unknown as BookingRow[]) || [], user.id);

      const clientIds = [...new Set([...upcomingRows, ...myRows, ...completedRows].map((b) => b.client_user_id).filter(Boolean))];
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

      if (cancelled) return;
      setUpcomingRequests(upcomingRows.map((b) => mapBookingToJob(b, profileMap)));
      setMyJobs(myRows.map((b) => mapBookingToJob(b, profileMap)));
      setCompletedJobs(completedRows.map((b) => mapBookingToJob(b, profileMap)));
      setLoadingJobs(false);
    };

    fetchJobs();
    return () => { cancelled = true; };
  }, [user, enabled, checkingStatus, applicationStatus, reloadKey]);

  /** Marks a job as viewed by the provider (existing behaviour) and updates local state. */
  const markViewed = useCallback(async (job: Job) => {
    if (job.providerViewed) return;
    await supabase.from('bookings').update({ provider_viewed: true }).eq('id', job.id);
    const patch = (list: Job[]) => list.map((j) => (j.id === job.id ? { ...j, providerViewed: true } : j));
    setUpcomingRequests(patch);
    setMyJobs(patch);
    setCompletedJobs(patch);
  }, []);

  /** Called after a provider confirms a shift: the request leaves the open list, then lists reload. */
  const handleConfirmed = useCallback((jobId: string) => {
    setUpcomingRequests((prev) => prev.filter((j) => j.id !== jobId));
    setReloadKey((k) => k + 1);
  }, []);

  /** Reload after a visit is completed and charged so it leaves My jobs and can show under Completed. */
  const handleCompleted = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  return {
    applicationStatus,
    checkingStatus,
    loadingJobs,
    upcomingRequests,
    myJobs,
    completedJobs,
    markViewed,
    handleConfirmed,
    handleCompleted,
  };
};

export default useProviderJobs;
