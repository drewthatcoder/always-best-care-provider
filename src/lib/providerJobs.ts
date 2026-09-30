import { format } from 'date-fns';
import type { Job } from '@/components/JobCard';

/** Minimal shape of a `bookings` row used by the provider dashboard. */
export interface BookingRow {
  id: string;
  client_user_id: string;
  provider_user_id?: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  service?: string | null;
  status: string;
  provider_viewed?: boolean | null;
  client_zip_code?: string | null;
  client_phone?: string | null;
  client_address?: string | null;
  client_address_line2?: string | null;
  client_city?: string | null;
  client_state?: string | null;
  client_date_of_birth?: string | null;
  client_height?: string | null;
  client_weight?: string | null;
  client_responsible_party?: string | null;
  client_responsible_party_name?: string | null;
  client_responsible_party_email?: string | null;
  client_additional_info?: string | null;
  client_recurring_weekly?: string | null;
  notes?: string | null;
}

export type ClientNameMap = Record<string, { first_name: string | null; last_name: string | null }>;

/** Statuses that count as "my jobs" once a booking is assigned to the provider. */
export const MY_JOB_STATUSES = ['confirmed', 'in-progress'] as const;

/** Local calendar date (yyyy-MM-dd) used to hide past-dated upcoming requests. */
export const todayIsoDate = (now: Date = new Date()): string => format(now, 'yyyy-MM-dd');

const byScheduledDateAsc = (a: BookingRow, b: BookingRow) => {
  if (a.scheduled_date !== b.scheduled_date) return a.scheduled_date < b.scheduled_date ? -1 : 1;
  return (a.start_time || '').localeCompare(b.start_time || '');
};

/**
 * Open requests a provider can pick up: status 'upcoming', not yet assigned,
 * scheduled today or later (past-dated requests are hidden). Sorted by date asc.
 * Zip-code scoping is enforced server-side by RLS.
 */
export const selectUpcomingRequests = (rows: BookingRow[], today: string): BookingRow[] =>
  rows
    .filter((b) => b.status === 'upcoming' && !b.provider_user_id && b.scheduled_date >= today)
    .sort(byScheduledDateAsc);

/** Bookings assigned to this provider that are confirmed or in progress. Sorted by date asc. */
export const selectMyJobs = (rows: BookingRow[], providerUserId: string): BookingRow[] =>
  rows
    .filter(
      (b) =>
        b.provider_user_id === providerUserId &&
        (MY_JOB_STATUSES as readonly string[]).includes(b.status),
    )
    .sort(byScheduledDateAsc);

export const mapBookingToJob = (b: BookingRow, profiles: ClientNameMap = {}): Job => {
  const profile = profiles[b.client_user_id];
  const dateObj = new Date(b.scheduled_date + 'T00:00:00');
  return {
    id: b.id,
    date: format(dateObj, 'EEE MMM dd yyyy').toUpperCase(),
    startTime: b.start_time,
    endTime: b.end_time,
    clientFirstName: profile?.first_name ?? undefined,
    clientLastName: profile?.last_name ?? undefined,
    service: b.service ?? undefined,
    clientZipCode: b.client_zip_code ?? undefined,
    status: b.status as Job['status'],
    providerViewed: b.provider_viewed ?? false,
    clientPhone: b.client_phone ?? undefined,
    clientAddress: b.client_address ?? undefined,
    clientAddressLine2: b.client_address_line2 ?? undefined,
    clientCity: b.client_city ?? undefined,
    clientState: b.client_state ?? undefined,
    clientDateOfBirth: b.client_date_of_birth ?? undefined,
    clientHeight: b.client_height ?? undefined,
    clientWeight: b.client_weight ?? undefined,
    clientResponsibleParty: b.client_responsible_party ?? undefined,
    clientResponsiblePartyName: b.client_responsible_party_name ?? undefined,
    clientResponsiblePartyEmail: b.client_responsible_party_email ?? undefined,
    clientAdditionalInfo: b.client_additional_info ?? undefined,
    clientRecurringWeekly: b.client_recurring_weekly ?? undefined,
    notes: b.notes ?? undefined,
  };
};
