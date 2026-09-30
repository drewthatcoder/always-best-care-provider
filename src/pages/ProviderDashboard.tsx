import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, LogOut } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { type Job } from '@/components/JobCard';
import JobDetailsSheet from '@/components/JobDetailsSheet';
import ProviderJobSections from '@/components/ProviderJobSections';
import { useProviderJobs } from '@/hooks/useProviderJobs';
import { supabase } from '@/integrations/supabase/client';

const ProviderDashboard = () => {
  const navigate = useNavigate();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const {
    applicationStatus,
    checkingStatus,
    loadingJobs,
    upcomingRequests,
    myJobs,
    markViewed,
    handleConfirmed,
  } = useProviderJobs();

  const handleJobClick = async (job: Job) => {
    setSelectedJob(job);
    setSheetOpen(true);
    await markViewed(job);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
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
          <div className="max-w-md mx-auto px-6 py-6 flex items-center justify-between">
            <h1 className="text-xl font-bold text-primary-foreground">Application Status</h1>
            <button onClick={handleLogout} className="flex items-center gap-2 text-sm font-medium bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground px-3 py-2 rounded-lg transition-colors">
              <LogOut className="w-4 h-4" /> Logout
            </button>
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
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <h1 className="text-xl font-semibold text-white">Dashboard</h1>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm font-medium bg-white/15 hover:bg-white/25 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>

      <div className="px-4 pt-6">
        <ProviderJobSections
          loading={loadingJobs}
          upcomingRequests={upcomingRequests}
          myJobs={myJobs}
          onJobClick={handleJobClick}
        />
      </div>

      <JobDetailsSheet job={selectedJob} open={sheetOpen} onOpenChange={setSheetOpen} onConfirm={handleConfirmed} />
      <BottomNav />
    </div>
  );
};

export default ProviderDashboard;
