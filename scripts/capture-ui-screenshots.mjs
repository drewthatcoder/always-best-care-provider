/**
 * Screenshot the provider dashboard, notification bell, job details, and admin
 * bookings page with Supabase mocked via Playwright route interception.
 *
 *   npx --yes -p playwright@1.55.0 node scripts/capture-ui-screenshots.mjs
 *
 * Requires the Vite dev server on http://127.0.0.1:8080.
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      const key = line.slice(0, index);
      let value = line.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return [key, value];
    }),
);

const supabaseUrl = new URL(env.VITE_SUPABASE_URL);
const storageKey = `sb-${supabaseUrl.hostname.split('.')[0]}-auth-token`;
const outDir = '/opt/cursor/artifacts/screenshots';

const PROVIDER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const SAM = '33333333-3333-4333-8333-333333333333';
const ADA = '44444444-4444-4444-8444-444444444444';
const GRACE = '55555555-5555-4555-8555-555555555555';

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwtFor = (userId, email) =>
  `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    exp: 2000000000,
  })}.signature`;

const sessionFor = (userId, email) => ({
  access_token: jwtFor(userId, email),
  refresh_token: 'refresh-token',
  expires_in: 60 * 60 * 24 * 30,
  expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  token_type: 'bearer',
  user: {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  },
});

const booking = (overrides) => ({
  client_additional_info: null,
  client_address: '12 Oak Street',
  client_address_line2: null,
  client_city: 'Sacramento',
  client_date_of_birth: null,
  client_height: null,
  client_phone: '916-555-0142',
  client_recurring_weekly: null,
  client_responsible_party: null,
  client_responsible_party_email: null,
  client_responsible_party_name: null,
  client_state: 'CA',
  client_user_id: SAM,
  client_weight: null,
  client_zip_code: '95814',
  created_at: '2026-09-01T00:00:00.000Z',
  end_time: '12:00 PM',
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  notes: null,
  provider_user_id: null,
  provider_viewed: true,
  scheduled_date: '2026-10-20',
  service: 'Companionship',
  start_time: '9:00 AM',
  status: 'upcoming',
  updated_at: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

const bookings = [
  booking({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    client_user_id: SAM,
    client_phone: '916-555-0142',
    client_zip_code: '95814',
    scheduled_date: '2026-10-20',
    service: 'Companionship',
    status: 'upcoming',
    provider_user_id: null,
  }),
  booking({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    client_user_id: ADA,
    client_phone: '916-555-0101',
    client_zip_code: null,
    client_address: null,
    scheduled_date: '2026-01-15',
    start_time: '9:00 AM',
    end_time: '12:00 PM',
    service: 'Companionship',
    status: 'upcoming',
  }),
  booking({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    client_user_id: GRACE,
    client_phone: '916-555-0199',
    client_zip_code: '99999',
    scheduled_date: '2026-02-01',
    start_time: '2:00 PM',
    end_time: '4:00 PM',
    service: 'Medication',
    status: 'upcoming',
  }),
];

const notifications = [
  {
    id: 'n1',
    user_id: PROVIDER,
    title: 'New booking in your area',
    body: 'Companionship on 2026-10-20, 9:00 AM–12:00 PM (zip 95814).',
    read: false,
    created_at: '2026-09-30T18:00:00.000Z',
    client_zip_code: '95814',
    type: 'new_booking',
    booking_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  },
  {
    id: 'n2',
    user_id: PROVIDER,
    title: 'Client approved your shift',
    body: 'Companionship on 2026-10-18, 1:00 PM–2:00 PM. The session is booked.',
    read: false,
    created_at: '2026-09-30T16:00:00.000Z',
    client_zip_code: '95814',
    type: 'client_approved',
    booking_id: null,
  },
  {
    id: 'n3',
    user_id: PROVIDER,
    title: 'Client asked for another time',
    body: 'Meal prep on 2026-10-12, 10:00 AM–11:00 AM. The shift is back in available jobs.',
    read: true,
    created_at: '2026-09-28T12:00:00.000Z',
    client_zip_code: '95814',
    type: 'client_requested_time',
    booking_id: null,
  },
  {
    id: 'n4',
    user_id: ADMIN,
    title: 'Unmatched booking',
    body: 'Companionship on 2026-01-15, 9:00 AM–12:00 PM. No zip code is on file, so no provider can see this shift.',
    read: false,
    created_at: '2026-09-30T17:00:00.000Z',
    client_zip_code: null,
    type: 'unmatched_booking',
    booking_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  },
];

const profiles = [
  { user_id: SAM, first_name: 'Sam', last_name: 'Rivera' },
  { user_id: ADA, first_name: 'Ada', last_name: 'Lovelace' },
  { user_id: GRACE, first_name: 'Grace', last_name: 'Hopper' },
  { user_id: PROVIDER, first_name: 'Jordan', last_name: 'Lee' },
];

const contacts = [
  { user_id: SAM, email: 'sam@example.com', first_name: 'Sam', last_name: 'Rivera' },
  { user_id: ADA, email: 'ada@example.com', first_name: 'Ada', last_name: 'Lovelace' },
  { user_id: GRACE, email: 'grace@example.com', first_name: 'Grace', last_name: 'Hopper' },
  { user_id: PROVIDER, email: 'jordan@example.com', first_name: 'Jordan', last_name: 'Lee' },
];

const applications = [
  {
    user_id: PROVIDER,
    first_name: 'Jordan',
    last_name: 'Lee',
    email: 'jordan@example.com',
    phone: '916-555-2000',
    status: 'approved',
  },
];

const applyFilters = (rows, url) => {
  let result = rows.slice();
  for (const [key, value] of url.searchParams.entries()) {
    if (['select', 'order', 'apikey', 'limit', 'offset'].includes(key)) continue;
    if (value.startsWith('eq.')) {
      const expected = value.slice(3);
      result = result.filter((row) => String(row[key] ?? '') === expected);
    } else if (value === 'is.null') {
      result = result.filter((row) => row[key] == null);
    } else if (value.startsWith('not.is.null') || value === 'not.is.null') {
      result = result.filter((row) => row[key] != null);
    } else if (value.startsWith('gte.')) {
      const expected = value.slice(4);
      result = result.filter((row) => String(row[key] ?? '') >= expected);
    } else if (value.startsWith('in.(') && value.endsWith(')')) {
      const allowed = new Set(value.slice(4, -1).split(',').map((part) => decodeURIComponent(part)));
      result = result.filter((row) => allowed.has(String(row[key])));
    }
  }
  const limit = url.searchParams.get('limit');
  if (limit) result = result.slice(0, Number(limit));
  return result;
};

const cors = (request) => ({
  'access-control-allow-origin': request.headers()['origin'] || '*',
  'access-control-allow-headers': request.headers()['access-control-request-headers'] || '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD',
  'access-control-expose-headers': 'content-range, content-length',
  'content-type': 'application/json',
});

const json = async (route, body, extra = {}) => {
  const request = route.request();
  await route.fulfill({
    status: extra.status ?? 200,
    headers: { ...cors(request), ...(extra.headers || {}) },
    body: body === undefined ? '' : JSON.stringify(body),
  });
};

const browser = await chromium.launch({ headless: true });

const shoot = async (userId, email, path, run) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
  await context.addInitScript(
    ([key, session]) => {
      localStorage.setItem(key, JSON.stringify(session));
    },
    [storageKey, sessionFor(userId, email)],
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error('pageerror', error.message));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.hostname.endsWith('supabase.co')) {
      await route.continue();
      return;
    }
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors(request), body: '' });
      return;
    }

    const pathname = url.pathname;
    console.log(request.method(), pathname, url.search);

    if (pathname.includes('/auth/v1/user') || pathname.includes('/auth/v1/token')) {
      await json(route, sessionFor(userId, email).user);
      return;
    }

    if (pathname.endsWith('/rest/v1/rpc/has_role')) {
      const payload = request.postDataJSON?.() || {};
      await json(route, payload._user_id === ADMIN && payload._role === 'admin');
      return;
    }

    if (pathname.endsWith('/rest/v1/rpc/admin_user_contacts')) {
      const payload = request.postDataJSON?.() || {};
      const ids = new Set(payload.p_user_ids || []);
      await json(route, contacts.filter((contact) => ids.has(contact.user_id)));
      return;
    }

    if (pathname.endsWith('/rest/v1/bookings')) {
      if (request.method() === 'PATCH' || request.method() === 'DELETE') {
        await json(route, []);
        return;
      }
      await json(route, applyFilters(bookings, url));
      return;
    }

    if (pathname.endsWith('/rest/v1/notifications')) {
      const rows = applyFilters(notifications, url);
      if (request.method() === 'HEAD' || url.searchParams.get('select') === 'id') {
        const unread = rows.filter((row) => row.read === false).length;
        await json(route, request.method() === 'HEAD' ? undefined : rows, {
          headers: { 'content-range': `*/${unread}` },
        });
        return;
      }
      if (request.method() === 'PATCH') {
        await json(route, []);
        return;
      }
      await json(route, rows);
      return;
    }

    if (pathname.endsWith('/rest/v1/provider_applications')) {
      await json(route, applyFilters(applications, url));
      return;
    }

    if (pathname.endsWith('/rest/v1/profiles')) {
      await json(route, applyFilters(profiles, url));
      return;
    }

    if (pathname.endsWith('/rest/v1/provider_zip_codes')) {
      await json(route, [{ zip_code: '95814', user_id: PROVIDER }]);
      return;
    }

    await json(route, []);
  });

  await page.goto(`http://127.0.0.1:8080${path}`, { waitUntil: 'domcontentloaded' });
  await run(page);
  await context.close();
};

await shoot(PROVIDER, 'jordan@example.com', '/provider-dashboard', async (page) => {
  await page.getByTestId('notification-unread-count').waitFor({ timeout: 15000 });
  await page.getByText('Companionship').first().waitFor();
  await page.getByTestId('call-always-best-care').waitFor();
  await page.screenshot({ path: `${outDir}/provider-dashboard-bell-and-call.png`, fullPage: false });

  await page.getByTestId('notification-bell').click();
  await page.getByTestId('notification-dropdown').waitFor();
  await page.getByText('New booking in your area').waitFor();
  await page.screenshot({ path: `${outDir}/provider-bell-dropdown.png`, fullPage: false });
  await page.keyboard.press('Escape');

  await page.getByText('Companionship').first().click();
  await page.getByText('Job Details').waitFor();
  const call = page.getByTestId('call-always-best-care').last();
  await call.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${outDir}/job-details-call-button.png`, fullPage: false });
});

await shoot(ADMIN, 'admin@example.com', '/admin/bookings', async (page) => {
  await page.getByTestId('booking-filter-unmatched').waitFor({ timeout: 15000 });
  await page.getByText('Ada Lovelace').waitFor();
  await page.getByText('Grace Hopper').waitFor();
  await page.locator('input[value="99999"]').waitFor();
  await page.screenshot({ path: `${outDir}/admin-bookings-unmatched.png`, fullPage: true });
});

await browser.close();
console.log('screenshots written to', outDir);
