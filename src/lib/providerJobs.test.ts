import { describe, expect, it } from 'vitest';
import {
  mapBookingToJob,
  selectMyJobs,
  selectUpcomingRequests,
  todayIsoDate,
  type BookingRow,
} from './providerJobs';

const row = (over: Partial<BookingRow>): BookingRow => ({
  id: 'x',
  client_user_id: 'client-1',
  provider_user_id: null,
  scheduled_date: '2026-10-01',
  start_time: '09:00',
  end_time: '12:00',
  status: 'upcoming',
  ...over,
});

const ME = 'provider-me';
const TODAY = '2026-09-30';

describe('selectUpcomingRequests', () => {
  it('keeps only unassigned upcoming bookings dated today or later, sorted ascending', () => {
    const rows = [
      row({ id: 'later', scheduled_date: '2026-10-10' }),
      row({ id: 'past', scheduled_date: '2026-09-29' }),
      row({ id: 'today', scheduled_date: TODAY }),
      row({ id: 'assigned', provider_user_id: 'someone', scheduled_date: '2026-10-02' }),
      row({ id: 'confirmed', status: 'confirmed', scheduled_date: '2026-10-02' }),
      row({ id: 'soon-late', scheduled_date: '2026-10-01', start_time: '13:00' }),
      row({ id: 'soon-early', scheduled_date: '2026-10-01', start_time: '08:00' }),
    ];
    expect(selectUpcomingRequests(rows, TODAY).map((r) => r.id)).toEqual([
      'today',
      'soon-early',
      'soon-late',
      'later',
    ]);
  });

  it('returns an empty list when nothing is open', () => {
    expect(selectUpcomingRequests([row({ scheduled_date: '2020-01-01' })], TODAY)).toEqual([]);
  });
});

describe('selectMyJobs', () => {
  it('keeps confirmed / in-progress bookings assigned to the provider', () => {
    const rows = [
      row({ id: 'mine-confirmed', provider_user_id: ME, status: 'confirmed', scheduled_date: '2026-10-05' }),
      row({ id: 'mine-inprog', provider_user_id: ME, status: 'in-progress', scheduled_date: '2026-10-01' }),
      row({ id: 'mine-pending', provider_user_id: ME, status: 'pending_client' }),
      row({ id: 'other', provider_user_id: 'other', status: 'confirmed' }),
      row({ id: 'open', status: 'upcoming' }),
    ];
    expect(selectMyJobs(rows, ME).map((r) => r.id)).toEqual(['mine-inprog', 'mine-confirmed']);
  });
});

describe('mapBookingToJob', () => {
  it('maps DB columns and client names onto the JobCard shape', () => {
    const job = mapBookingToJob(
      row({ id: 'b1', client_zip_code: '20850', service: 'Companionship', provider_viewed: null }),
      { 'client-1': { first_name: 'Ann', last_name: 'Lee' } },
    );
    expect(job).toMatchObject({
      id: 'b1',
      date: 'THU OCT 01 2026',
      clientFirstName: 'Ann',
      clientLastName: 'Lee',
      clientZipCode: '20850',
      service: 'Companionship',
      status: 'upcoming',
      providerViewed: false,
    });
  });
});

describe('todayIsoDate', () => {
  it('formats the local date', () => {
    expect(todayIsoDate(new Date(2026, 8, 30, 23, 59))).toBe('2026-09-30');
  });
});
