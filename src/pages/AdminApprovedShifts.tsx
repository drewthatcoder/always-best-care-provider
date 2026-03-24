import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, User, MapPin, FileText, CheckCircle2, Bell, Trash2, ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface ApprovedBooking {
  id: string;
  client_user_id: string;
  provider_user_id: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  service: string;
  status: string;
  client_phone: string | null;
  client_address: string | null;
  client_city: string | null;
  client_state: string | null;
  client_zip_code: string | null;
  notes: string | null;
  created_at: string;
}

const AdminApprovedShifts = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<ApprovedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!roleData) {
        toast.error('Access denied');
        navigate('/');
        return;
      }

      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('status', 'approved')
        .order('scheduled_date', { ascending: false });

      if (error) {
        console.error(error);
        toast.error('Failed to load approved shifts');
        setLoading(false);
        return;
      }

      const results = (data || []) as ApprovedBooking[];
      setBookings(results);

      // Fetch profile names
      const userIds = [...new Set(results.flatMap(b => [b.client_user_id, b.provider_user_id].filter(Boolean) as string[]))];
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name')
          .in('user_id', userIds);

        const map: Record<string, string> = {};
        (profs || []).forEach((p: any) => {
          map[p.user_id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';
        });
        setProfiles(map);
      }

      setLoading(false);
    };

    fetchData();
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="care-gradient safe-area-top">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4 mb-4">
            <button onClick={() => navigate('/admin/applications')} className="text-primary-foreground hover:text-primary-foreground/80">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-2xl font-bold text-primary-foreground">Approved Shifts</h1>
          </div>
          <p className="text-primary-foreground/70 text-sm">
            {bookings.length} confirmed shift{bookings.length !== 1 ? 's' : ''}
          </p>
          <nav className="flex items-center gap-3 mt-4 flex-wrap">
            <button
              onClick={() => navigate('/admin/approved')}
              className="flex items-center gap-2 text-sm font-medium bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground px-4 py-2 rounded-lg transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              Approved Providers
            </button>
            <button
              onClick={() => navigate('/admin/deleted-shifts')}
              className="flex items-center gap-2 text-sm font-medium bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground px-4 py-2 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Deleted Shifts
            </button>
            <button
              onClick={() => navigate('/notifications')}
              className="flex items-center gap-2 text-sm font-medium bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground px-4 py-2 rounded-lg transition-colors"
            >
              <Bell className="w-4 h-4" />
              Notifications
            </button>
            <button
              onClick={() => navigate('/admin/applications')}
              className="flex items-center gap-2 text-sm font-medium bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground px-4 py-2 rounded-lg transition-colors"
            >
              <ClipboardList className="w-4 h-4" />
              Applications
            </button>
          </nav>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading...</p>
        ) : bookings.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">No approved shifts yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => {
              const dateObj = new Date(booking.scheduled_date + 'T00:00:00');
              return (
                <div key={booking.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="font-semibold text-sm text-foreground">
                        {format(dateObj, 'EEE MMM dd, yyyy')}
                      </span>
                    </div>
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Confirmed
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-foreground">{booking.start_time} – {booking.end_time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-foreground capitalize">{booking.service}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-foreground">Client: {profiles[booking.client_user_id] || 'Unknown'}</span>
                    </div>
                    {booking.provider_user_id && (
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-foreground">Provider: {profiles[booking.provider_user_id] || 'Unknown'}</span>
                      </div>
                    )}
                    {booking.client_city && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-foreground">{booking.client_city}, {booking.client_state}</span>
                      </div>
                    )}
                  </div>

                  {booking.notes && (
                    <div className="border-t border-border pt-2 text-xs text-muted-foreground">
                      {booking.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminApprovedShifts;
