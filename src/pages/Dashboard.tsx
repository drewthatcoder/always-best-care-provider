import { useState } from 'react';
import { Clock } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { type Job } from '@/components/JobCard';
import JobDetailsSheet from '@/components/JobDetailsSheet';
import ClientProfileSection from '@/components/ClientProfileSection';
import ProviderJobSections from '@/components/ProviderJobSections';
import { useProviderJobs } from '@/hooks/useProviderJobs';
import { isNativePlatform } from '@/hooks/usePlatform';

const Dashboard = () => {
  const isNative = isNativePlatform();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Only check provider application status / load jobs on web (providers), not mobile (clients)
  const {
    applicationStatus,
    checkingStatus,
    loadingJobs,
    upcomingRequests,
    myJobs,
    markViewed,
    handleConfirmed,
  } = useProviderJobs({ enabled: !isNative });

  const handleJobClick = async (job: Job) => {
    setSelectedJob(job);
    setSheetOpen(true);
    await markViewed(job);
  };

  if (checkingStatus) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>);

  }

  // Show pending screen if application exists but isn't approved
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
              {applicationStatus === 'pending' ?
              'Your provider application is currently being reviewed by our team. You will receive full access to your account once approved.' :
              'Unfortunately, your application was not approved. Please contact support for more information.'}
            </p>
            {applicationStatus === 'pending' &&
            <div className="bg-muted/50 rounded-xl p-4 mt-4">
                <p className="text-xs text-muted-foreground">
                  This usually takes 1–2 business days. You'll be notified once a decision has been made.
                </p>
              </div>
            }
          </div>
        </div>
        <BottomNav />
      </div>);

  }

  // Show provider jobs view for approved providers, client profile for everyone else
  const isApprovedProvider = !isNative && applicationStatus === 'approved';

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="care-gradient pt-12 pb-6 px-6">
        <h1 className="text-xl font-semibold text-white text-center">
          {isApprovedProvider ? 'Dashboard' : 'Client Profile'}
        </h1>
      </div>

      {/* Provider Jobs View */}
      {isApprovedProvider ? (
        <div className="px-4 pt-6">
          <ProviderJobSections
            loading={loadingJobs}
            upcomingRequests={upcomingRequests}
            myJobs={myJobs}
            onJobClick={handleJobClick}
          />
        </div>
      ) : (
        /* Client Profile View */
        <div className="px-4 -mt-8">
          <ClientProfileSection />
        </div>
      )}

      {/* Job Details Sheet */}
      <JobDetailsSheet
        job={selectedJob}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onConfirm={handleConfirmed}
      />

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
};

export default Dashboard;
