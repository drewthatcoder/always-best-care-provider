import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, Clock, CheckCircle2, XCircle, User, Mail, Phone, MapPin, CreditCard, AlertCircle, Bell, Trash2, ClipboardCheck, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface ProviderApplication {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  payment_option: string | null;
  payment_plan: string | null;
  selected_services: string[];
  service_zip_codes: string[];
  available_days: string[];
  available_shifts: string[];
  additional_info: string | null;
  status: string;
  created_at: string;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive'; icon: typeof Clock }> = {
  pending:  { label: 'Pending',  variant: 'secondary',    icon: Clock },
  approved: { label: 'Approved', variant: 'default',      icon: CheckCircle2 },
  rejected: { label: 'Rejected', variant: 'destructive',  icon: XCircle },
};

const AdminApplications = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [applications, setApplications] = useState<ProviderApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ProviderApplication | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchApplications();

    const channel = supabase
      .channel('admin-applications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'provider_applications' }, (payload) => {
        const newApp = payload.new as ProviderApplication;
        setApplications((prev) => [newApp, ...prev]);
        toast.info(`New application from ${newApp.first_name} ${newApp.last_name}`, {
          icon: <Bell className="w-4 h-4" />,
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const pendingApps  = useMemo(() => applications.filter((a) => a.status === 'pending'), [applications]);
  const displayedApps = useMemo(() => applications.filter((a) => a.status !== 'approved'), [applications]);

  const fetchApplications = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('provider_applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) toast.error('Failed to load applications');
    else setApplications(data || []);
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
   navigate('/');
  };

  const updateStatus = async (id: string, status: string) => {
    setUpdating(true);
    const { error } = await supabase
      .from('provider_applications')
      .update({ status })
      .eq('id', id);

    if (error) { toast.error('Failed to update status'); setUpdating(false); return; }

    toast.success(`Application ${status}`);
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    if (selected?.id === id) setSelected((prev) => prev ? { ...prev, status } : null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await fetch(`https://uwgfitnpesgdkiwtekcb.supabase.co/functions/v1/notify-provider-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ applicationId: id, status }),
});
      }
    } catch (emailErr) {
      console.error('Email notification failed:', emailErr);
    }

    setUpdating(false);
  };

  const openDetails = (app: ProviderApplication) => { setSelected(app); setSheetOpen(true); };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="care-gradient safe-area-top">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate(-1)} className="text-primary-foreground hover:text-primary-foreground/80">
                <ArrowLeft className="w-6 h-6" />
              </button>
              <h1 className="text-2xl font-bold text-primary-foreground">Provider Applications</h1>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm font-medium bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground px-4 py-2 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
          <p className="text-primary-foreground/70 text-sm">
            {applications.length} application{applications.length !== 1 ? 's' : ''} total
          </p>
          <nav className="flex items-center gap-3 mt-4 flex-wrap">
            <button onClick={() => navigate('/admin/approved')} className="flex items-center gap-2 text-sm font-medium bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground px-4 py-2 rounded-lg transition-colors">
              <CheckCircle2 className="w-4 h-4" /> Approved Providers
            </button>
            <button onClick={() => navigate('/admin/approved-shifts')} className="flex items-center gap-2 text-sm font-medium bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground px-4 py-2 rounded-lg transition-colors">
              <ClipboardCheck className="w-4 h-4" /> Approved Shifts
            </button>
            <button onClick={() => navigate('/notifications')} className="flex items-center gap-2 text-sm font-medium bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground px-4 py-2 rounded-lg transition-colors">
              <Bell className="w-4 h-4" /> Notifications
            </button>
            <button onClick={() => navigate('/admin/deleted-shifts')} className="flex items-center gap-2 text-sm font-medium bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground px-4 py-2 rounded-lg transition-colors">
              <Trash2 className="w-4 h-4" /> Deleted Shifts
            </button>
          </nav>
        </div>
      </div>

      {/* Pending Alert */}
      {pendingApps.length > 0 && (
        <div className="max-w-4xl mx-auto px-6 pt-6">
          <Alert className="border-primary/50 bg-primary/5">
            <AlertCircle className="h-5 w-5 text-primary" />
            <AlertTitle className="text-foreground font-semibold">
              {pendingApps.length} New Application{pendingApps.length !== 1 ? 's' : ''} Awaiting Review
            </AlertTitle>
            <AlertDescription className="text-muted-foreground">
              {pendingApps.map((a) => `${a.first_name} ${a.last_name}`).join(', ')} — click to review and approve.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* List */}
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-3">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading applications...</div>
        ) : displayedApps.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No pending or rejected applications.</div>
        ) : (
          displayedApps.map((app) => {
            const cfg = statusConfig[app.status] || statusConfig.pending;
            const StatusIcon = cfg.icon;
            return (
              <button key={app.id} onClick={() => openDetails(app)} className="w-full text-left rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{app.first_name} {app.last_name}</p>
                      <p className="text-sm text-muted-foreground">{app.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={cfg.variant} className="gap-1">
                      <StatusIcon className="w-3 h-3" />
                      {cfg.label}
                    </Badge>
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{new Date(app.created_at).toLocaleDateString()}</span>
                  <span>{app.selected_services.length} service(s)</span>
                  <span>{app.service_zip_codes.length} zip code(s)</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.first_name} {selected.last_name}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <div className="flex items-center gap-2">
                  <Badge variant={statusConfig[selected.status]?.variant || 'secondary'}>
                    {statusConfig[selected.status]?.label || selected.status}
                  </Badge>
                  {selected.status === 'pending' && (
                    <div className="flex gap-2 ml-auto">
                      <Button size="sm" onClick={() => updateStatus(selected.id, 'approved')} disabled={updating}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => updateStatus(selected.id, 'rejected')} disabled={updating}>Reject</Button>
                    </div>
                  )}
                </div>
                <Separator />
                <Section title="Contact Information" icon={User}>
                  <InfoRow icon={Mail} label="Email" value={selected.email} />
                  <InfoRow icon={Phone} label="Phone" value={selected.phone} />
                  <InfoRow icon={MapPin} label="Address" value={[selected.address, selected.city, selected.state, selected.zip_code].filter(Boolean).join(', ') || '—'} />
                </Section>
                <Separator />
                <Section title="Payment" icon={CreditCard}>
                  <InfoRow label="Method" value={selected.payment_option === 'card' ? 'Debit/Credit Card' : selected.payment_option === 'ach' ? 'ACH' : '—'} />
                  <InfoRow label="License" value={selected.payment_plan === 'monthly' ? '1 License — $59.89/mo' : selected.payment_plan === 'monthly-2' ? '2 Licenses — $110/mo' : '—'} />
                  <InfoRow label="Onboarding Fee" value="$299.00" />
                </Section>
                <Separator />
                <Section title="Service Area Zip Codes" icon={MapPin}>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.service_zip_codes.map((z) => <Badge key={z} variant="secondary">{z}</Badge>)}
                  </div>
                </Section>
                {selected.additional_info && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm font-medium text-foreground mb-1">Additional Info</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selected.additional_info}</p>
                    </div>
                  </>
                )}
                <Separator />
                <p className="text-xs text-muted-foreground">Submitted {new Date(selected.created_at).toLocaleString()}</p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

const Section = ({ title, icon: Icon, children }: { title: string; icon: typeof User; children: React.ReactNode }) => (
  <div className="space-y-2">
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-primary" />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
    <div className="pl-6 space-y-1.5">{children}</div>
  </div>
);

const InfoRow = ({ icon: Icon, label, value }: { icon?: typeof Mail; label: string; value: string }) => (
  <div className="flex items-start gap-2 text-sm">
    {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />}
    <span className="text-muted-foreground">{label}:</span>
    <span className="text-foreground">{value}</span>
  </div>
);

export default AdminApplications;
