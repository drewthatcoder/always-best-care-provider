import { format } from 'date-fns';

export type AdminBookingFilter = 'unmatched' | 'upcoming' | 'awaiting_client' | 'approved' | 'past';

export interface AdminBookingRow {
  id: string;
  scheduled_date: string;
  status: string;
  client_zip_code: string | null;
}

export const ADMIN_BOOKING_FILTERS: { id: AdminBookingFilter; label: string }[] = [
  { id: 'unmatched', label: 'Unmatched' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'awaiting_client', label: 'Awaiting client' },
  { id: 'approved', label: 'Approved' },
  { id: 'past', label: 'Past date' },
];

export const normalizeZip = (zip: string | null | undefined): string => (zip ?? '').trim();

export const coveredZipSet = (zips: Array<string | null | undefined>): Set<string> => {
  const set = new Set<string>();
  for (const zip of zips) {
    const normalized = normalizeZip(zip);
    if (normalized) set.add(normalized);
  }
  return set;
};

/** Null/blank zip, or a zip no provider has in provider_zip_codes. */
export const isUnmatchedBooking = (zip: string | null | undefined, covered: Set<string>): boolean => {
  const normalized = normalizeZip(zip);
  if (!normalized) return true;
  return !covered.has(normalized);
};

export const matchesAdminBookingFilter = <T extends AdminBookingRow>(
  booking: T,
  filter: AdminBookingFilter,
  covered: Set<string>,
  today: string,
): boolean => {
  switch (filter) {
    case 'unmatched':
      return isUnmatchedBooking(booking.client_zip_code, covered);
    case 'upcoming':
      return booking.status === 'upcoming' && booking.scheduled_date >= today;
    case 'awaiting_client':
      return booking.status === 'pending_client';
    case 'approved':
      return booking.status === 'approved';
    case 'past':
      return booking.scheduled_date < today;
    default:
      return false;
  }
};

export const filterAdminBookings = <T extends AdminBookingRow>(
  bookings: T[],
  filter: AdminBookingFilter,
  covered: Set<string>,
  today: string,
): T[] => bookings.filter((booking) => matchesAdminBookingFilter(booking, filter, covered, today));

export const formatBookingDate = (value: string): string => {
  const day = (value ?? '').slice(0, 10);
  const parsed = new Date(`${day}T00:00:00`);
  if (!day || Number.isNaN(parsed.getTime())) return value || '—';
  return format(parsed, 'EEE MMM d, yyyy');
};

export const personName = (first?: string | null, last?: string | null): string =>
  [first, last].map((part) => (part ?? '').trim()).filter(Boolean).join(' ');

export interface PersonLinesInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** First line is always the display name (or Unknown). Email and phone follow when present. */
export const personLines = ({ name, email, phone }: PersonLinesInput): string[] => {
  const lines = [(name ?? '').trim() || 'Unknown'];
  const mail = (email ?? '').trim();
  const tel = (phone ?? '').trim();
  if (mail) lines.push(mail);
  if (tel) lines.push(tel);
  return lines;
};
