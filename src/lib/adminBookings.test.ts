import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  coveredZipSet,
  filterAdminBookings,
  formatBookingDate,
  isUnmatchedBooking,
  personLines,
  personName,
  type AdminBookingRow,
} from './adminBookings';

const booking = (over: Partial<AdminBookingRow>): AdminBookingRow => ({
  id: 'b',
  scheduled_date: '2026-10-05',
  status: 'upcoming',
  client_zip_code: '95814',
  ...over,
});

const TODAY = '2026-09-30';
const covered = coveredZipSet(['95814', ' 95825 ', '', null]);

describe('isUnmatchedBooking', () => {
  it('treats null, blank, and uncovered zips as unmatched', () => {
    expect(isUnmatchedBooking(null, covered)).toBe(true);
    expect(isUnmatchedBooking('   ', covered)).toBe(true);
    expect(isUnmatchedBooking('00000', covered)).toBe(true);
    expect(isUnmatchedBooking('95814', covered)).toBe(false);
    expect(isUnmatchedBooking(' 95825 ', covered)).toBe(false);
  });
});

describe('filterAdminBookings', () => {
  const rows = [
    booking({ id: 'null-zip', client_zip_code: null, status: 'upcoming', scheduled_date: '2026-10-02' }),
    booking({ id: 'no-cover', client_zip_code: '00000', status: 'pending_client', scheduled_date: '2026-10-03' }),
    booking({ id: 'open', client_zip_code: '95814', status: 'upcoming', scheduled_date: '2026-10-04' }),
    booking({ id: 'past-open', client_zip_code: '95814', status: 'upcoming', scheduled_date: '2026-09-01' }),
    booking({ id: 'waiting', client_zip_code: '95814', status: 'pending_client', scheduled_date: '2026-10-06' }),
    booking({ id: 'approved', client_zip_code: '95825', status: 'approved', scheduled_date: '2026-10-07' }),
    booking({ id: 'old-approved', client_zip_code: '95814', status: 'approved', scheduled_date: '2026-09-15' }),
  ];

  it('splits unmatched, upcoming, awaiting client, approved, and past date', () => {
    expect(filterAdminBookings(rows, 'unmatched', covered, TODAY).map((r) => r.id)).toEqual(['null-zip', 'no-cover']);
    expect(filterAdminBookings(rows, 'upcoming', covered, TODAY).map((r) => r.id)).toEqual(['null-zip', 'open']);
    expect(filterAdminBookings(rows, 'awaiting_client', covered, TODAY).map((r) => r.id)).toEqual([
      'no-cover',
      'waiting',
    ]);
    expect(filterAdminBookings(rows, 'approved', covered, TODAY).map((r) => r.id)).toEqual([
      'approved',
      'old-approved',
    ]);
    expect(filterAdminBookings(rows, 'past', covered, TODAY).map((r) => r.id)).toEqual(['past-open', 'old-approved']);
  });
});

describe('display helpers', () => {
  it('formats booking dates and person lines from booking or profile fields', () => {
    expect(formatBookingDate('2026-10-02')).toBe('Fri Oct 2, 2026');
    expect(formatBookingDate('')).toBe('—');
    expect(personName('Ada', 'Lovelace')).toBe('Ada Lovelace');
    expect(personName('  ', null)).toBe('');
    expect(personLines({ name: 'Ada Lovelace', email: 'ada@example.com', phone: '916-555-0100' })).toEqual([
      'Ada Lovelace',
      'ada@example.com',
      '916-555-0100',
    ]);
    expect(personLines({ name: '', email: null, phone: '  ' })).toEqual(['Unknown']);
  });
});

describe('admin bookings migration', () => {
  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260930210100_admin_bookings_access.sql'),
    'utf8',
  );

  it('adds admin select, update, and delete policies using has_role', () => {
    expect(sql).toContain('Admins can select bookings');
    expect(sql).toContain('Admins can update bookings');
    expect(sql).toContain('Admins can delete bookings');
    expect(sql).toContain("public.has_role(_user_id => auth.uid(), _role => 'admin'::public.app_role)");
    expect(sql).toContain('for select');
    expect(sql).toContain('for update');
    expect(sql).toContain('for delete');
    expect(sql).toContain('security definer');
    expect(sql).toContain('public.admin_user_contacts');
    expect(sql).toContain('Admins can read provider zip codes');
    expect(sql).toContain('grant execute on function public.admin_user_contacts(uuid[]) to authenticated');
  });
});
