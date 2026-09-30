import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { userIsAdmin } from '@/lib/adminAccess';

// Generic notifications page that redirects based on user role
const Notifications = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user) return;

    const checkRole = async () => {
      const isAdmin = await userIsAdmin(user.id);

      if (isAdmin) {
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
