import { describe, expect, it } from 'vitest';
import {
  MY_JOB_STATUSES,
  canCompleteAndCharge,
  canConfirmShift,
  jobStatusLabel,
  mapBookingToJob,
  paymentBadgeLabel,
  selectApprovedShifts,
  selectCompletedJobs,
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
  it('keeps approved / pending_client / confirmed / in-progress bookings assigned to the provider', () => {
    const rows = [
      row({ id: 'mine-confirmed', provider_user_id: ME, status: 'confirmed', scheduled_date: '2026-10-05' }),
      row({ id: 'mine-inprog', provider_user_id: ME, status: 'in-progress', scheduled_date: '2026-10-01' }),
      row({ id: 'mine-pending', provider_user_id: ME, status: 'pending_client', scheduled_date: '2026-10-03' }),
      row({ id: 'mine-approved', provider_user_id: ME, status: 'approved', scheduled_date: '2026-10-07' }),
      row({ id: 'mine-cancelled', provider_user_id: ME, status: 'cancelled', scheduled_date: '2026-10-02' }),
      row({ id: 'other-approved', provider_user_id: 'other', status: 'approved' }),
      row({ id: 'unassigned-approved', provider_user_id: null, status: 'approved' }),
      row({ id: 'open', status: 'upcoming' }),
    ];
    expect(selectMyJobs(rows, ME, TODAY).map((r) => r.id)).toEqual([
      'mine-inprog',
      'mine-pending',
      'mine-confirmed',
      'mine-approved',
    ]);
  });

  it('includes the production case: approved Oct 07 2026 5-6 PM shift assigned to me', () => {
    const approved = row({
      id: '4c5420b6',
      provider_user_id: ME,
      status: 'approved',
      scheduled_date: '2026-10-07',
      start_time: '5:00 PM',
      end_time: '6:00 PM',
      client_zip_code: '99988',
    });
    expect(selectMyJobs([approved], ME, TODAY).map((r) => r.id)).toEqual(['4c5420b6']);
  });

  it('lists today/future shifts first (ascending), then past shifts (most recent first)', () => {
    const rows = [
      row({ id: 'past-old', provider_user_id: ME, status: 'approved', scheduled_date: '2026-09-01' }),
      row({ id: 'future', provider_user_id: ME, status: 'approved', scheduled_date: '2026-10-07' }),
      row({ id: 'past-recent', provider_user_id: ME, status: 'confirmed', scheduled_date: '2026-09-28' }),
      row({ id: 'today', provider_user_id: ME, status: 'pending_client', scheduled_date: TODAY }),
    ];
    expect(selectMyJobs(rows, ME, TODAY).map((r) => r.id)).toEqual(['today', 'future', 'past-recent', 'past-old']);
  });

  it('queries the same statuses it filters on', () => {
    expect([...MY_JOB_STATUSES]).toEqual(['approved', 'pending_client', 'confirmed', 'in-progress']);
  });
});

describe('job status helpers', () => {
  it('labels assigned statuses for badges', () => {
    expect(jobStatusLabel('approved')).toBe('Approved');
    expect(jobStatusLabel('pending_client')).toBe('Awaiting client approval');
    expect(jobStatusLabel('confirmed')).toBe('Confirmed');
    expect(jobStatusLabel('in-progress')).toBe('In progress');
    expect(jobStatusLabel('something_new')).toBe('something_new');
  });

  it('only allows confirming open requests', () => {
    expect(canConfirmShift('upcoming')).toBe(true);
    for (const s of ['approved', 'pending_client', 'confirmed', 'in-progress']) {
      expect(canConfirmShift(s)).toBe(false);
    }
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

describe('complete and charge helpers', () => {
  it('allows the charge action only for approved jobs', () => {
    expect(canCompleteAndCharge('approved')).toBe(true);
    for (const status of ['upcoming', 'pending_client', 'completed', 'cancelled', 'confirmed']) {
      expect(canCompleteAndCharge(status)).toBe(false);
    }
  });

  it('keeps completed jobs out of My jobs and lists them newest first', () => {
    const rows = [
      row({ id: 'done-old', provider_user_id: ME, status: 'completed', scheduled_date: '2026-09-01' }),
      row({ id: 'done-new', provider_user_id: ME, status: 'completed', scheduled_date: '2026-10-02' }),
      row({ id: 'still-approved', provider_user_id: ME, status: 'approved', scheduled_date: '2026-10-03' }),
    ];
    expect(selectMyJobs(rows, ME, TODAY).map((r) => r.id)).toEqual(['still-approved']);
    expect(selectCompletedJobs(rows, ME).map((r) => r.id)).toEqual(['done-new', 'done-old']);
  });

  it('keeps completed jobs visible on the Approved shifts page in their own list', () => {
    const rows = [
      row({ id: 'done', provider_user_id: ME, status: 'completed', scheduled_date: '2026-12-02', payment_status: 'succeeded' }),
      row({ id: 'approved-late', provider_user_id: ME, status: 'approved', scheduled_date: '2026-10-09' }),
      row({ id: 'pending', provider_user_id: ME, status: 'pending_client', scheduled_date: '2026-10-04' }),
      row({ id: 'other-provider', provider_user_id: 'someone', status: 'completed', scheduled_date: '2026-10-01' }),
      row({ id: 'cancelled', provider_user_id: ME, status: 'cancelled', scheduled_date: '2026-10-01' }),
    ];
    const { active, completed } = selectApprovedShifts(rows, ME);
    expect(active.map((r) => r.id)).toEqual(['pending', 'approved-late']);
    expect(completed.map((r) => r.id)).toEqual(['done']);
    expect(canCompleteAndCharge(completed[0].status)).toBe(false);
  });

  it('maps price and payment status and labels paid or failed', () => {
    const job = mapBookingToJob(row({ price_cents: 5500, payment_status: 'succeeded', charge_amount_cents: 5500 }));
    expect(job.priceCents).toBe(5500);
    expect(job.paymentStatus).toBe('succeeded');
    expect(paymentBadgeLabel('succeeded')).toBe('Paid');
    expect(paymentBadgeLabel('failed')).toBe('Payment failed');
    expect(paymentBadgeLabel('unpaid')).toBeNull();
  });
});

describe('todayIsoDate', () => {
  it('formats the local date', () => {
    expect(todayIsoDate(new Date(2026, 8, 30, 23, 59))).toBe('2026-09-30');
  });
});
