import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Calendar, Clock, User, MapPin, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface DeletedBooking {
  id: string;
  original_booking_id: string;
  client_user_id: string;
  provider_user_id: string | null;
  deleted_by_user_id: string;
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
  deleted_at: string;
}

const AdminDeletedShifts = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [records, setRecords] = useState<DeletedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  useEffect(() => {
    const checkAdminAndFetch = async () => {
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
        .from('deleted_bookings' as any)
        .select('*')
        .order('deleted_at', { ascending: false });

      if (error) {
        console.error(error);
        toast.error('Failed to load records');
        setLoading(false);
        return;
      }

      const bookings = (data || []) as unknown as DeletedBooking[];
      setRecords(bookings);

      // Fetch profile names for clients and deleters
      const userIds = [...new Set(bookings.flatMap(b => [b.client_user_id, b.deleted_by_user_id].filter(Boolean)))];
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

    checkAdminAndFetch();
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="care-gradient safe-area-top">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center gap-4">
          <button onClick={() => navigate('/admin/applications')} className="text-primary-foreground">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold text-primary-foreground">Deleted Shifts</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading...</p>
        ) : records.length === 0 ? (
          <div className="text-center py-12">
            <Trash2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">No deleted shifts on record.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {records.map((record) => {
              const dateObj = new Date(record.scheduled_date + 'T00:00:00');
              const deletedAt = new Date(record.deleted_at);
              return (
                <div key={record.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="font-semibold text-sm">
                        {format(dateObj, 'EEE MMM dd, yyyy')}
                      </span>
                    </div>
                    <span className="text-xs text-destructive font-medium bg-destructive/10 px-2 py-1 rounded-full">
                      Deleted
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{record.start_time} – {record.end_time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{record.service}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Client: {profiles[record.client_user_id] || 'Unknown'}</span>
                    </div>
                    {record.client_city && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{record.client_city}, {record.client_state}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border pt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Deleted by: {profiles[record.deleted_by_user_id] || 'Unknown'}</span>
                    <span>{format(deletedAt, 'MMM dd, yyyy h:mm a')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDeletedShifts;
