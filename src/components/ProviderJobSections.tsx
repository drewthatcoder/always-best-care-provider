import { Link } from 'react-router-dom';
import { Briefcase, Inbox } from 'lucide-react';
import JobCard, { type Job } from '@/components/JobCard';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ProviderJobSectionsProps {
  loading: boolean;
  upcomingRequests: Job[];
  myJobs: Job[];
  onJobClick: (job: Job) => void;
}

const SectionHeader = ({ icon: Icon, title, count, id }: { icon: typeof Inbox; title: string; count: number; id: string }) => (
  <CardHeader className="p-4 pb-3">
    <div className="flex items-center justify-between gap-2">
      <CardTitle id={id} className="text-base font-semibold flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        {title}
      </CardTitle>
      <Badge variant={count > 0 ? 'default' : 'secondary'} aria-label={`${count} ${title.toLowerCase()}`}>
        {count}
      </Badge>
    </div>
  </CardHeader>
);

/** Stacked "Upcoming requests" + "My jobs" sections for the provider dashboard. */
const ProviderJobSections = ({ loading, upcomingRequests, myJobs, onJobClick }: ProviderJobSectionsProps) => {
  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Loading jobs...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Card aria-labelledby="upcoming-requests-title" data-testid="upcoming-requests">
        <SectionHeader icon={Inbox} id="upcoming-requests-title" title="Upcoming requests" count={upcomingRequests.length} />
        <CardContent className="p-4 pt-0">
          {upcomingRequests.length === 0 ? (
            <div className="text-center py-6 px-2 space-y-2">
              <p className="text-sm text-muted-foreground">No upcoming requests in your zip codes yet.</p>
              <p className="text-sm text-muted-foreground">
                Add or check your service zip codes in{' '}
                <Link to="/settings" className="text-primary font-medium underline underline-offset-2">
                  Settings
                </Link>
                .
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                Open shifts in your service area. Tap one to review and confirm.
              </p>
              <div className="space-y-3">
                {upcomingRequests.map((job) => (
                  <JobCard key={job.id} job={job} onClick={() => onJobClick(job)} />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card aria-labelledby="my-jobs-title" data-testid="my-jobs">
        <SectionHeader icon={Briefcase} id="my-jobs-title" title="My jobs" count={myJobs.length} />
        <CardContent className="p-4 pt-0">
          {myJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No confirmed or in-progress jobs yet.
            </p>
          ) : (
            <div className="space-y-3">
              {myJobs.map((job) => (
                <JobCard key={job.id} job={job} onClick={() => onJobClick(job)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProviderJobSections;
