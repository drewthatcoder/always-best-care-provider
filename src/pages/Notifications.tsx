import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Generic notifications page that redirects based on user role
const Notifications = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user) return;

    const checkRole = async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      const roles = (data || []).map((r) => r.role);

      if (roles.includes('admin')) {
        navigate('/admin/notifications', { replace: true });
      } else {
        // Check if provider by looking for provider_applications
        const { data: provApp } = await supabase
          .from('provider_applications')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (provApp) {
          navigate('/provider-notifications', { replace: true });
        } else {
          navigate('/client-notifications', { replace: true });
        }
      }
      setChecked(true);
    };

    checkRole();
  }, [user, navigate]);

  if (!checked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return null;
};

export default Notifications;
