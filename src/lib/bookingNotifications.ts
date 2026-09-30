/**
 * Decision table for booking notifications.
 * The database trigger in supabase/migrations/20260930210000_booking_status_notifications.sql
 * is what actually inserts rows. Keep titles in sync with that file.
 */

export const NOTIFICATION_TITLES = {
  unmatched: 'Unmatched booking',
  newBooking: 'New booking in your area',
  providerConfirmed: 'A provider confirmed your shift',
  clientApproved: 'Client approved your shift',
  clientApprovedAdmin: 'Client approved a shift',
  anotherTime: 'Client asked for another time',
  cancelled: 'Shift cancelled',
  deleted: 'Shift deleted',
  problem: 'Provider reported a problem',
  callRequest: 'Client requests a call',
} as const;

export type NotificationAudience = 'zip_providers' | 'admins' | 'client' | 'assigned_provider' | 'previous_provider';

export interface PlannedNotification {
  audience: NotificationAudience;
  title: string;
  type: string;
}

export interface BookingSnap {
  status: string;
  client_zip_code?: string | null;
  provider_user_id?: string | null;
}

export interface BookingNotificationEvent {
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  old?: BookingSnap | null;
  next?: BookingSnap | null;
  /** Providers whose provider_zip_codes include the booking zip. Ignored when zip is blank. */
  coveredProviderCount?: number;
}

const zipOf = (booking?: BookingSnap | null): string => (booking?.client_zip_code ?? '').trim();

const upcomingFanout = (booking: BookingSnap, coveredProviderCount: number): PlannedNotification[] => {
  if (!zipOf(booking) || coveredProviderCount <= 0) {
    return [{ audience: 'admins', title: NOTIFICATION_TITLES.unmatched, type: 'unmatched_booking' }];
  }
  return [{ audience: 'zip_providers', title: NOTIFICATION_TITLES.newBooking, type: 'new_booking' }];
};

/** Who should be notified for a booking insert, status change, zip correction, or delete. */
export const planBookingNotifications = (event: BookingNotificationEvent): PlannedNotification[] => {
  const covered = event.coveredProviderCount ?? 0;

  if (event.op === 'DELETE') {
    return [
      { audience: 'assigned_provider', title: NOTIFICATION_TITLES.deleted, type: 'booking_deleted' },
      { audience: 'admins', title: NOTIFICATION_TITLES.deleted, type: 'booking_deleted' },
    ];
  }

  const next = event.next;
  if (!next) return [];

  if (event.op === 'INSERT') {
    if (next.status !== 'upcoming') return [];
    return upcomingFanout(next, covered);
  }

  const prev = event.old;
  if (!prev || prev.status === next.status) {
    const zipChanged = zipOf(prev) !== zipOf(next);
    if (next.status === 'upcoming' && zipChanged) return upcomingFanout(next, covered);
    return [];
  }

  if (prev.status === 'upcoming' && next.status === 'pending_client') {
    return [{ audience: 'client', title: NOTIFICATION_TITLES.providerConfirmed, type: 'provider_confirmed' }];
  }

  if (prev.status === 'pending_client' && next.status === 'approved') {
    return [
      { audience: 'assigned_provider', title: NOTIFICATION_TITLES.clientApproved, type: 'client_approved' },
      { audience: 'admins', title: NOTIFICATION_TITLES.clientApprovedAdmin, type: 'client_approved' },
    ];
  }

  if (prev.status === 'pending_client' && next.status === 'upcoming') {
    return [{ audience: 'previous_provider', title: NOTIFICATION_TITLES.anotherTime, type: 'client_requested_time' }];
  }

  if (next.status === 'cancelled') {
    return [
      { audience: 'assigned_provider', title: NOTIFICATION_TITLES.cancelled, type: 'booking_cancelled' },
      { audience: 'admins', title: NOTIFICATION_TITLES.cancelled, type: 'booking_cancelled' },
    ];
  }

  if (next.status === 'deleted') {
    return [
      { audience: 'assigned_provider', title: NOTIFICATION_TITLES.deleted, type: 'booking_deleted' },
      { audience: 'admins', title: NOTIFICATION_TITLES.deleted, type: 'booking_deleted' },
    ];
  }

  return [];
};

export const shiftSummary = (service: string | null | undefined, date: string, start: string, end: string): string => {
  const label = (service ?? '').trim() || 'Care';
  return `${label} on ${(date ?? '').trim() || 'unscheduled date'}, ${(start ?? '').trim() || '—'}–${(end ?? '').trim() || '—'}`;
};
