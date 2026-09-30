import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { latestNotifications, useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

interface NotificationBellProps {
  /** Full notifications page for this role. */
  to: string;
}

const NotificationBell = ({ to }: NotificationBellProps) => {
  const navigate = useNavigate();
  const { items, unreadCount, markAsRead, refetch } = useNotifications();
  const latest = latestNotifications(items, 10);
  const badge = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) void refetch();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="notification-bell"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          className="relative flex items-center justify-center w-10 h-10 rounded-lg bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground transition-colors"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span
              data-testid="notification-unread-count"
              className="absolute -top-1 -right-1 min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-[1.15rem] text-center"
            >
              {badge}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0" data-testid="notification-dropdown">
        <DropdownMenuLabel className="px-3 py-2">Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0" />
        {latest.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">No notifications yet</p>
        ) : (
          latest.map((notice) => (
            <DropdownMenuItem
              key={notice.id}
              data-testid="notification-item"
              className="flex flex-col items-start gap-0.5 px-3 py-2 cursor-pointer"
              onSelect={(event) => {
                event.preventDefault();
                void markAsRead(notice.id);
              }}
            >
              <span className={cn('text-sm leading-snug', notice.read ? 'text-muted-foreground' : 'font-semibold text-foreground')}>
                {notice.title}
              </span>
              {notice.body && (
                <span className="text-xs text-muted-foreground line-clamp-2 whitespace-normal">{notice.body}</span>
              )}
              <span className="text-[11px] text-muted-foreground">
                {format(new Date(notice.created_at), 'MMM d, h:mm a')}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator className="my-0" />
        <DropdownMenuItem
          data-testid="notification-view-all"
          className="justify-center text-primary font-medium cursor-pointer"
          onSelect={() => navigate(to)}
        >
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBell;
