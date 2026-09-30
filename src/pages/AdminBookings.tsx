import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { userIsAdmin } from '@/lib/adminAccess';
import {
  ADMIN_BOOKING_FILTERS,
  coveredZipSet,
  filterAdminBookings,
  formatBookingDate,
  personLines,
  personName,
  type AdminBookingFilter,
} from '@/lib/adminBookings';
import { jobStatusLabel } from '@/lib/providerJobs';
import AdminHeader from '@/components/admin/AdminHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

interface BookingRecord {
  id: string;
  client_user_id: string;
  provider_user_id: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  service: string;
  status: string;
  client_phone: string | null;
  client_zip_code: string | null;
}

interface Contact {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface ProviderOption {
  userId: string;
  name: string;
  email: string | null;
}

const UNASSIGNED = 'none';

const AdminBookings = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [coveredZips, setCoveredZips] = useState<Set<string>>(new Set());
  const [zipCoverageKnown, setZipCoverageKnown] = useState(true);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [filter, setFilter] = useState<AdminBookingFilter>('unmatched');
  const [draftZips, setDraftZips] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [bookingsRes, zipsRes, providersRes] = await Promise.all([
      supabase.from('bookings').select('*').order('scheduled_date', { ascending: false }),
      supabase.from('provider_zip_codes').select('zip_code'),
      supabase
        .from('provider_applications')
        .select('user_id, first_name, last_name, email, status')
        .eq('status', 'approved'),
    ]);

    if (bookingsRes.error) {
      console.error(bookingsRes.error);
      toast.error('Failed to load bookings');
      setBookings([]);
    } else {
      const rows = (bookingsRes.data || []) as BookingRecord[];
      setBookings(rows);
      setDraftZips(Object.fromEntries(rows.map((row) => [row.id, row.client_zip_code ?? ''])));
    }

    if (zipsRes.error) {
      console.error(zipsRes.error);
      setZipCoverageKnown(false);
      setCoveredZips(new Set());
      toast.error('Could not load provider zip codes. Unmatched shows blank zips only.');
    } else {
      setZipCoverageKnown(true);
      setCoveredZips(coveredZipSet((zipsRes.data || []).map((row) => row.zip_code)));
    }

    const providerOptions: ProviderOption[] = (providersRes.data || []).map((row) => ({
      userId: row.user_id,
      name: personName(row.first_name, row.last_name) || 'Provider',
      email: row.email,
    }));
    setProviders(providerOptions);

    const ids = [
      ...new Set(
        ((bookingsRes.data || []) as BookingRecord[]).flatMap((row) =>
          [row.client_user_id, row.provider_user_id].filter(Boolean),
        ) as string[],
      ),
    ];

    if (ids.length > 0) {
      const { data: contactRows, error: contactError } = await supabase.rpc('admin_user_contacts', {
        p_user_ids: ids,
      });
      if (contactError) {
        console.error(contactError);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', ids);
        const map: Record<string, Contact> = {};
        (profiles || []).forEach((profile) => {
          map[profile.user_id] = {
            user_id: profile.user_id,
            email: null,
            first_name: profile.first_name,
            last_name: profile.last_name,
          };
        });
        setContacts(map);
      } else {
        const map: Record<string, Contact> = {};
        ((contactRows || []) as Contact[]).forEach((contact) => {
          map[contact.user_id] = contact;
        });
        setContacts(map);
      }
    } else {
      setContacts({});
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/admin-login');
      return;
    }

    let cancelled = false;
    const gate = async () => {
      const allowed = await userIsAdmin(user.id);
      if (cancelled) return;
      if (!allowed) {
        toast.error('Access denied');
        navigate('/');
        return;
      }
      await load();
    };
    void gate();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, navigate, load]);

  const today = useMemo(() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }, []);

  const visible = useMemo(() => {
    const coverage = zipCoverageKnown ? coveredZips : new Set<string>();
    if (!zipCoverageKnown && filter === 'unmatched') {
      return bookings.filter((row) => !(row.client_zip_code ?? '').trim());
    }
    return filterAdminBookings(bookings, filter, coverage, today);
  }, [bookings, coveredZips, filter, today, zipCoverageKnown]);

  const providerChoices = useMemo(() => {
    const map = new Map<string, ProviderOption>();
    providers.forEach((provider) => map.set(provider.userId, provider));
    bookings.forEach((row) => {
      if (!row.provider_user_id || map.has(row.provider_user_id)) return;
      const contact = contacts[row.provider_user_id];
      map.set(row.provider_user_id, {
        userId: row.provider_user_id,
        name: personName(contact?.first_name, contact?.last_name) || 'Assigned provider',
        email: contact?.email ?? null,
      });
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [providers, bookings, contacts]);

  const clientLines = (row: BookingRecord) => {
    const contact = contacts[row.client_user_id];
    return personLines({
      name: personName(contact?.first_name, contact?.last_name),
      email: contact?.email,
      phone: row.client_phone,
    });
  };

  const providerLabel = (userId: string | null) => {
    if (!userId) return 'Unassigned';
    const known = providerChoices.find((provider) => provider.userId === userId);
    if (known) return known.name;
    const contact = contacts[userId];
    return personName(contact?.first_name, contact?.last_name) || 'Assigned provider';
  };

  const patchBooking = (id: string, patch: Partial<BookingRecord>) => {
    setBookings((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const saveZip = async (row: BookingRecord) => {
    const next = (draftZips[row.id] ?? '').trim();
    setBusyId(row.id);
    const { error } = await supabase
      .from('bookings')
      .update({ client_zip_code: next || null })
      .eq('id', row.id);
    setBusyId(null);
    if (error) {
      toast.error('Could not update zip');
      return;
    }
    patchBooking(row.id, { client_zip_code: next || null });
    toast.success(next ? 'Zip updated' : 'Zip cleared');
  };

  const reassign = async (row: BookingRecord, value: string) => {
    const providerId = value === UNASSIGNED ? null : value;
    setBusyId(row.id);
    const { error } = await supabase.from('bookings').update({ provider_user_id: providerId }).eq('id', row.id);
    setBusyId(null);
    if (error) {
      toast.error('Could not update provider');
      return;
    }
    patchBooking(row.id, { provider_user_id: providerId });
    toast.success(providerId ? 'Provider reassigned' : 'Provider cleared');
  };

  const cancelBooking = async (row: BookingRecord) => {
    setBusyId(row.id);
    const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', row.id);
    setBusyId(null);
    if (error) {
      toast.error('Could not cancel shift');
      return;
    }
    patchBooking(row.id, { status: 'cancelled' });
    toast.success('Shift cancelled');
  };

  return (
    <div className="min-h-screen bg-background" data-testid="admin-bookings-page">
      <AdminHeader
        wide
        title="Bookings"
        subtitle={`${visible.length} in this filter · ${bookings.length} total`}
      />
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Booking filters">
          {ADMIN_BOOKING_FILTERS.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={filter === item.id ? 'default' : 'outline'}
              data-testid={`booking-filter-${item.id}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        {!zipCoverageKnown && (
          <p className="text-sm text-muted-foreground">
            Provider zip coverage could not be loaded. Unmatched is limited to bookings with no zip.
          </p>
        )}
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading bookings...</p>
        ) : visible.length === 0 ? (
          <p className="text-center text-muted-foreground py-12" data-testid="admin-bookings-empty">
            No bookings in this filter.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date / time</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Zip</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => {
                const lines = clientLines(row);
                return (
                  <TableRow key={row.id} data-testid="booking-row">
                    <TableCell className="whitespace-nowrap">
                      <div className="font-medium">{formatBookingDate(row.scheduled_date)}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.start_time} – {row.end_time}
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">{row.service}</TableCell>
                    <TableCell>
                      {lines.map((line, index) => (
                        <div key={`${row.id}-${index}`} className={index === 0 ? 'font-medium' : 'text-xs text-muted-foreground'}>
                          {line}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label="Client zip code"
                          value={draftZips[row.id] ?? ''}
                          onChange={(event) =>
                            setDraftZips((prev) => ({ ...prev, [row.id]: event.target.value }))
                          }
                          className="w-24 h-9"
                          maxLength={10}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyId === row.id}
                          onClick={() => saveZip(row)}
                        >
                          Save
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2 min-w-[180px]">
                        <p className="text-sm">{providerLabel(row.provider_user_id)}</p>
                        <Select
                          value={row.provider_user_id ?? UNASSIGNED}
                          onValueChange={(value) => reassign(row, value)}
                          disabled={busyId === row.id}
                        >
                          <SelectTrigger aria-label="Reassign provider">
                            <SelectValue placeholder="Provider" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNASSIGNED}>Clear provider</SelectItem>
                            {providerChoices.map((provider) => (
                              <SelectItem key={provider.userId} value={provider.userId}>
                                {provider.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === 'cancelled' ? 'destructive' : 'secondary'}>
                        {jobStatusLabel(row.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={busyId === row.id || row.status === 'cancelled'}
                        onClick={() => cancelBooking(row)}
                      >
                        Cancel
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};

export default AdminBookings;
