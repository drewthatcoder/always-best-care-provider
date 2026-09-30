import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Calendar, CheckCircle2, ClipboardCheck, ClipboardList, LogOut, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import CallAlwaysBestCareButton from '@/components/CallAlwaysBestCareButton';
import NotificationBell from '@/components/NotificationBell';
import { cn } from '@/lib/utils';

const LINKS = [
  { to: '/admin/applications', label: 'Applications', icon: ClipboardList, testId: 'admin-nav-applications' },
  { to: '/admin/approved', label: 'Approved Providers', icon: CheckCircle2, testId: 'admin-nav-approved' },
  { to: '/admin/bookings', label: 'Bookings', icon: Calendar, testId: 'admin-nav-bookings' },
  { to: '/admin/approved-shifts', label: 'Approved Shifts', icon: ClipboardCheck, testId: 'admin-nav-approved-shifts' },
  { to: '/admin/deleted-shifts', label: 'Deleted Shifts', icon: Trash2, testId: 'admin-nav-deleted-shifts' },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell, testId: 'admin-nav-notifications' },
];

interface AdminHeaderProps {
  title: string;
  subtitle?: ReactNode;
  onBack?: () => void;
  showLogout?: boolean;
  wide?: boolean;
}

const AdminHeader = ({ title, subtitle, onBack, showLogout = false, wide = false }: AdminHeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <header className="care-gradient safe-area-top" data-testid="admin-header">
      <div className={cn(wide ? 'max-w-6xl' : 'max-w-4xl', 'mx-auto px-6 py-6')}>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={() => (onBack ? onBack() : navigate('/admin/applications'))}
              className="text-primary-foreground hover:text-primary-foreground/80 shrink-0"
              aria-label="Back"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-2xl font-bold text-primary-foreground truncate">{title}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell to="/admin/notifications" />
            {showLogout && (
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 text-sm font-medium bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground px-4 py-2 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            )}
          </div>
        </div>
        {subtitle ? <div className="text-primary-foreground/70 text-sm">{subtitle}</div> : null}
        <nav className="flex items-center gap-3 mt-4 flex-wrap" aria-label="Admin">
          {LINKS.map((link) => {
            const Icon = link.icon;
            const active = location.pathname === link.to;
            return (
              <button
                key={link.to}
                type="button"
                data-testid={link.testId}
                onClick={() => navigate(link.to)}
                className={cn(
                  'flex items-center gap-2 text-sm font-medium text-primary-foreground px-4 py-2 rounded-lg transition-colors',
                  active ? 'bg-primary-foreground/30' : 'bg-primary-foreground/15 hover:bg-primary-foreground/25',
                )}
              >
                <Icon className="w-4 h-4" />
                {link.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-4">
          <CallAlwaysBestCareButton tone="on-primary" />
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;
