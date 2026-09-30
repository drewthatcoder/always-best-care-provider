import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, User, MapPin, FileText, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import AdminHeader from '@/components/admin/AdminHeader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { userIsAdmin } from '@/lib/adminAccess';
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

      const isAdmin = await userIsAdmin(user.id);

      if (!isAdmin) {
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
      <AdminHeader
        title="Approved Shifts"
        subtitle={`${bookings.length} confirmed shift${bookings.length !== 1 ? 's' : ''}`}
      />

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
