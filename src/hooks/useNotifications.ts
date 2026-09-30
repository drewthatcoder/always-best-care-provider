import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface BellNotification {
  id: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

const FETCH_LIMIT = 50;
/** Polling fallback when the realtime channel errors, times out, or closes. */
export const NOTIFICATION_FALLBACK_REFETCH_MS = 60_000;

export const latestNotifications = <T,>(items: T[], limit = 10): T[] => items.slice(0, limit);

export const useNotifications = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<BellNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refetch = useCallback(async () => {
    if (!user) {
      setItems([]);
      setUnreadCount(0);
      return;
    }

    const [listRes, countRes] = await Promise.all([
      supabase
        .from('notifications')
        .select('id, title, body, read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false),
    ]);

    const rows = (listRes.data as BellNotification[] | null) ?? [];
    setItems(rows);
    if (countRes.error || countRes.count == null) {
      setUnreadCount(rows.filter((row) => !row.read).length);
    } else {
      setUnreadCount(countRes.count);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const safeRefetch = () => {
      if (!cancelled) void refetch();
    };
    safeRefetch();

    let lastFallbackRefetch = 0;
    const fallbackRefetch = () => {
      const now = Date.now();
      if (now - lastFallbackRefetch < 15_000) return;
      lastFallbackRefetch = now;
      safeRefetch();
    };

    const channel = supabase
      .channel(`notifications-bell-${user.id}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => safeRefetch(),
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          fallbackRefetch();
        }
      });

    const interval = window.setInterval(safeRefetch, NOTIFICATION_FALLBACK_REFETCH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') safeRefetch();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [user, refetch]);

  const markAsRead = useCallback(
    async (id: string) => {
      let wasUnread = false;
      setItems((prev) => {
        wasUnread = prev.some((row) => row.id === id && !row.read);
        return prev.map((row) => (row.id === id ? { ...row, read: true } : row));
      });
      if (wasUnread) setUnreadCount((count) => Math.max(0, count - 1));
      await supabase.from('notifications').update({ read: true }).eq('id', id);
      await refetch();
    },
    [refetch],
  );

  return { items, unreadCount, markAsRead, refetch };
};
