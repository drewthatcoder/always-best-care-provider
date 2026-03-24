import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, User, Mail, Phone, MapPin, CreditCard, Calendar, Briefcase, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ProviderApplication {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  adba: string | null;
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

const SHIFT_LABELS: Record<string, string> = {
  morning: 'Morning (7 AM – 12 PM)',
  afternoon: 'Afternoon (12 PM – 5 PM)',
  evening: 'Evening (5 PM – 10 PM)',
};

const ALL_SERVICES = [
  'bathing', 'dressing', 'housekeeping', 'meal', 'medication',
  'toileting', 'transferring', 'transportation', 'walking',
];

const AdminApprovedApplications = () => {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<ProviderApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ProviderApplication | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');

  useEffect(() => {
    fetchApproved();
  }, []);

  const fetchApproved = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('provider_applications')
      .select('*')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load approved applications');
    } else {
      setApplications(data || []);
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = [...applications];

    // Search by name or DBA
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.first_name.toLowerCase().includes(q) ||
          a.last_name.toLowerCase().includes(q) ||
          `${a.first_name} ${a.last_name}`.toLowerCase().includes(q) ||
          (a.adba && a.adba.toLowerCase().includes(q))
      );
    }

    // Filter by service
    if (serviceFilter !== 'all') {
      result = result.filter((a) => a.selected_services.includes(serviceFilter));
    }

    // Filter by plan
    if (planFilter !== 'all') {
      result = result.filter((a) => a.payment_plan === planFilter);
    }

    // Sort
    if (sortBy === 'newest') {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === 'oldest') {
      result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else {
      result.sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
    }

    return result;
  }, [applications, searchQuery, serviceFilter, planFilter, sortBy]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="care-gradient safe-area-top">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4 mb-4">
            <button onClick={() => navigate('/admin/applications')} className="text-primary-foreground hover:text-primary-foreground/80">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-2xl font-bold text-primary-foreground">Approved Providers</h1>
          </div>
          <p className="text-primary-foreground/70 text-sm">
            {filtered.length} of {applications.length} approved provider{applications.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="max-w-4xl mx-auto px-6 pt-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or DBA..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex flex-wrap gap-2">

          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="License Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plans</SelectItem>
              <SelectItem value="monthly">1 License — $59.89/mo</SelectItem>
              <SelectItem value="monthly-2">2 Licenses — $110/mo</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'newest' | 'oldest' | 'name')}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      <div className="max-w-4xl mx-auto px-6 py-4 space-y-3">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {applications.length === 0 ? 'No approved providers yet.' : 'No results match your filters.'}
          </div>
        ) : (
          filtered.map((app) => (
            <button
              key={app.id}
              onClick={() => { setSelected(app); setSheetOpen(true); }}
              className="w-full text-left rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{app.first_name} {app.last_name}</p>
                    {app.adba && <p className="text-sm text-primary font-medium">{app.adba}</p>}
                    <p className="text-sm text-muted-foreground">{app.email}</p>
                  </div>
                </div>
                <Badge variant="default" className="gap-1 shrink-0">Approved</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{new Date(app.created_at).toLocaleDateString()}</span>
                <span>{app.selected_services.length} service(s)</span>
                <span>{app.payment_plan === 'monthly' ? '1 License' : app.payment_plan === 'monthly-2' ? '2 Licenses' : '—'}</span>
              </div>
            </button>
          ))
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
                <Badge variant="default">Approved</Badge>

                <Separator />

                <Section title="Contact Information" icon={User}>
                  {selected.adba && <InfoRow label="DBA/Preferred Business Name" value={selected.adba} />}
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

                <Section title="Services" icon={Briefcase}>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.selected_services.map((s) => (
                      <Badge key={s} variant="secondary" className="capitalize">{s.replace(/-/g, ' ')}</Badge>
                    ))}
                  </div>
                </Section>

                <Separator />

                <Section title="Service Area Zip Codes" icon={MapPin}>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.service_zip_codes.map((z) => (
                      <Badge key={z} variant="secondary">{z}</Badge>
                    ))}
                  </div>
                </Section>

                <Separator />

                <Section title="Availability" icon={Calendar}>
                  {selected.available_days?.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Days</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.available_days.map((d) => (
                          <Badge key={d} variant="secondary">{d}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {selected.available_shifts?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground mb-1">Shifts</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.available_shifts.map((s) => (
                          <Badge key={s} variant="secondary">{SHIFT_LABELS[s] || s}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
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
                <p className="text-xs text-muted-foreground">
                  Submitted {new Date(selected.created_at).toLocaleString()}
                </p>
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

export default AdminApprovedApplications;
