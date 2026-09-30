import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTIFICATION_TITLES, planBookingNotifications, shiftSummary } from './bookingNotifications';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260930210000_booking_status_notifications.sql'),
  'utf8',
);

describe('planBookingNotifications', () => {
  it('fans a new upcoming booking out to zip providers', () => {
    expect(
      planBookingNotifications({
        op: 'INSERT',
        next: { status: 'upcoming', client_zip_code: '95814' },
        coveredProviderCount: 2,
      }),
    ).toEqual([{ audience: 'zip_providers', title: NOTIFICATION_TITLES.newBooking, type: 'new_booking' }]);
  });

  it('notifies admins when a new upcoming booking has no zip or no covering provider', () => {
    expect(
      planBookingNotifications({
        op: 'INSERT',
        next: { status: 'upcoming', client_zip_code: null },
        coveredProviderCount: 3,
      }),
    ).toEqual([{ audience: 'admins', title: NOTIFICATION_TITLES.unmatched, type: 'unmatched_booking' }]);

    expect(
      planBookingNotifications({
        op: 'INSERT',
        next: { status: 'upcoming', client_zip_code: '  ' },
        coveredProviderCount: 3,
      })[0].title,
    ).toBe(NOTIFICATION_TITLES.unmatched);

    expect(
      planBookingNotifications({
        op: 'INSERT',
        next: { status: 'upcoming', client_zip_code: '00000' },
        coveredProviderCount: 0,
      })[0],
    ).toMatchObject({ audience: 'admins', title: NOTIFICATION_TITLES.unmatched });
  });

  it('ignores inserts that are not upcoming', () => {
    expect(
      planBookingNotifications({ op: 'INSERT', next: { status: 'approved' }, coveredProviderCount: 1 }),
    ).toEqual([]);
  });

  it('notifies the client when a provider confirms (upcoming -> pending_client)', () => {
    expect(
      planBookingNotifications({
        op: 'UPDATE',
        old: { status: 'upcoming' },
        next: { status: 'pending_client' },
      }),
    ).toEqual([{ audience: 'client', title: NOTIFICATION_TITLES.providerConfirmed, type: 'provider_confirmed' }]);
  });

  it('notifies the assigned provider and admins when the client approves', () => {
    expect(
      planBookingNotifications({
        op: 'UPDATE',
        old: { status: 'pending_client', provider_user_id: 'prov' },
        next: { status: 'approved', provider_user_id: 'prov' },
      }),
    ).toEqual([
      { audience: 'assigned_provider', title: NOTIFICATION_TITLES.clientApproved, type: 'client_approved' },
      { audience: 'admins', title: NOTIFICATION_TITLES.clientApprovedAdmin, type: 'client_approved' },
    ]);
  });

  it('notifies the previous provider when the client asks for another time', () => {
    expect(
      planBookingNotifications({
        op: 'UPDATE',
        old: { status: 'pending_client', provider_user_id: 'prov' },
        next: { status: 'upcoming', provider_user_id: null },
      }),
    ).toEqual([
      { audience: 'previous_provider', title: NOTIFICATION_TITLES.anotherTime, type: 'client_requested_time' },
    ]);
  });

  it('notifies the assigned provider and admins on cancel or delete', () => {
    expect(
      planBookingNotifications({
        op: 'UPDATE',
        old: { status: 'approved', provider_user_id: 'prov' },
        next: { status: 'cancelled', provider_user_id: 'prov' },
      }).map((n) => n.title),
    ).toEqual([NOTIFICATION_TITLES.cancelled, NOTIFICATION_TITLES.cancelled]);

    expect(
      planBookingNotifications({
        op: 'UPDATE',
        old: { status: 'approved' },
        next: { status: 'deleted' },
      }).map((n) => n.type),
    ).toEqual(['booking_deleted', 'booking_deleted']);

    expect(planBookingNotifications({ op: 'DELETE', old: { status: 'upcoming' } }).map((n) => n.audience)).toEqual([
      'assigned_provider',
      'admins',
    ]);
  });

  it('re-fans an open request when only the zip changes', () => {
    expect(
      planBookingNotifications({
        op: 'UPDATE',
        old: { status: 'upcoming', client_zip_code: null },
        next: { status: 'upcoming', client_zip_code: '95814' },
        coveredProviderCount: 1,
      }),
    ).toEqual([{ audience: 'zip_providers', title: NOTIFICATION_TITLES.newBooking, type: 'new_booking' }]);
  });

  it('stays quiet when status and zip do not change', () => {
    expect(
      planBookingNotifications({
        op: 'UPDATE',
        old: { status: 'approved', client_zip_code: '95814' },
        next: { status: 'approved', client_zip_code: '95814' },
        coveredProviderCount: 2,
      }),
    ).toEqual([]);
  });
});

describe('shiftSummary', () => {
  it('includes service, date, and time', () => {
    expect(shiftSummary('Companionship', '2026-10-02', '9:00 AM', '10:00 AM')).toBe(
      'Companionship on 2026-10-02, 9:00 AM–10:00 AM',
    );
    expect(shiftSummary('  ', '', '', '')).toBe('Care on unscheduled date, —–—');
  });
});

describe('booking notification migration', () => {
  it('adds type and booking_id, a security definer trigger, realtime, and own-role select', () => {
    expect(migration).toContain('add column if not exists type text');
    expect(migration).toContain('add column if not exists booking_id uuid');
    expect(migration).toContain('security definer');
    expect(migration).toContain('after insert or update of status, client_zip_code or delete');
    expect(migration).toContain('execute function public.notify_on_booking_change()');
    expect(migration).toContain('supabase_realtime add table public.notifications');
    expect(migration).toContain('Users can read their own roles');
    expect(migration).toContain('user_id = auth.uid()');
    expect(migration).toContain('public.report_booking_problem');
    expect(migration).toContain('public.notify_client_requests_call');
    for (const title of Object.values(NOTIFICATION_TITLES)) {
      expect(migration).toContain(title);
    }
  });

  it('keeps internal writers off the browser role and grants the two RPCs', () => {
    expect(migration).toContain(
      'revoke all on function public.insert_notification(uuid, text, text, text, uuid, text) from public, anon, authenticated',
    );
    expect(migration).toContain('grant execute on function public.report_booking_problem(uuid, text) to authenticated');
    expect(migration).toContain(
      'grant execute on function public.notify_client_requests_call(uuid) to authenticated',
    );
  });
});

describe('browser notification inserts', () => {
  it('does not insert cross-user notifications from the provider sheet or client pending shifts', () => {
    const sheet = readFileSync(resolve(process.cwd(), 'src/components/JobDetailsSheet.tsx'), 'utf8');
    const pending = readFileSync(resolve(process.cwd(), 'src/components/ClientPendingShifts.tsx'), 'utf8');
    expect(sheet).not.toMatch(/from\(['"]notifications['"]\)\s*\.insert/);
    expect(pending).not.toMatch(/from\(['"]notifications['"]\)\s*\.insert/);
    expect(sheet).toContain("rpc('report_booking_problem'");
    expect(pending).toContain("rpc('notify_client_requests_call'");
  });
});
