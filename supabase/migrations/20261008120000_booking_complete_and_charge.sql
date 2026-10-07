-- Provider "Mark complete & charge".
-- Additive. Do not apply this file from the app deploy. Run it in the SQL editor
-- only after the PR is approved. Safe to re-run.
--
-- price formula matches mobile and src bookingPriceCents:
--   non-empty comma-separated service tokens
--   5500 cents each for the first two, 4500 cents for each after
--   "dressing" = 5500; "bathing, dressing" = 11000; three tokens = 15500

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists price_cents integer,
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists payment_intent_id text,
  add column if not exists charge_attempts integer default 0,
  add column if not exists charge_amount_cents integer,
  add column if not exists charge_livemode boolean,
  add column if not exists charge_destination text,
  add column if not exists charge_error text,
  add column if not exists charged_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings
  add constraint bookings_payment_status_check
  check (payment_status in ('unpaid', 'processing', 'succeeded', 'failed'));

create unique index if not exists bookings_payment_intent_id_unique
  on public.bookings (payment_intent_id)
  where payment_intent_id is not null;

comment on column public.bookings.price_cents is
  'Snapshot of booking_price_cents(service) when the booking moves pending_client -> approved.';
comment on column public.bookings.payment_status is
  'unpaid, processing, succeeded, or failed. Providers cannot set this.';

-- ---------------------------------------------------------------------------
-- Price formula
-- ---------------------------------------------------------------------------
create or replace function public.booking_price_cents(service text)
returns integer
language sql
immutable
as $fn$
  with tokens as (
    select btrim(token) as token
    from unnest(string_to_array(coalesce(service, ''), ',')) as token
    where btrim(token) <> ''
  ),
  counted as (
    select count(*)::integer as n from tokens
  )
  select case
    when n <= 0 then 0
    when n <= 2 then n * 5500
    else (2 * 5500) + ((n - 2) * 4500)
  end
  from counted;
$fn$;

comment on function public.booking_price_cents(text) is
  '5500 cents for each of the first two non-empty comma-separated services, 4500 for each after.';

-- Backfill approved rows before the guard trigger exists on a fresh run.
-- Re-runs are allowed because the guard permits the postgres / supabase_admin session.
update public.bookings
set price_cents = public.booking_price_cents(service)
where status = 'approved'
  and price_cents is null;

-- ---------------------------------------------------------------------------
-- Guard. Providers cannot change payment columns or price_cents, cannot change
-- service once the booking is approved or completed, and cannot move a booking
-- into or out of completed. service_role, an admin (has_role), and the
-- postgres / supabase_admin session (SQL editor, migrations) can.
-- Normal pre-approval edits are not blocked. pending_client -> approved
-- snapshots price_cents for every caller.
-- ---------------------------------------------------------------------------
create or replace function public.guard_booking_charge_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_jwt_role text := coalesce(auth.role(), '');
  v_privileged boolean := false;
  v_snapshotted boolean := false;
begin
  if old.status is not distinct from 'pending_client'
     and new.status is not distinct from 'approved'
     and new.price_cents is not distinct from old.price_cents
  then
    new.price_cents := public.booking_price_cents(new.service);
    v_snapshotted := new.price_cents is distinct from old.price_cents;
  end if;

  v_privileged :=
    v_jwt_role = 'service_role'
    or session_user in ('postgres', 'supabase_admin')
    or (
      auth.uid() is not null
      and public.has_role(_user_id => auth.uid(), _role => 'admin')
    );

  if v_privileged then
    return new;
  end if;

  if new.payment_status is distinct from old.payment_status
     or new.payment_intent_id is distinct from old.payment_intent_id
     or new.charge_attempts is distinct from old.charge_attempts
     or new.charge_amount_cents is distinct from old.charge_amount_cents
     or new.charge_livemode is distinct from old.charge_livemode
     or new.charge_destination is distinct from old.charge_destination
     or new.charge_error is distinct from old.charge_error
     or new.charged_at is distinct from old.charged_at
     or new.completed_at is distinct from old.completed_at
  then
    raise exception 'payment fields are locked'
      using errcode = '42501';
  end if;

  if new.price_cents is distinct from old.price_cents and not v_snapshotted then
    raise exception 'price_cents is locked'
      using errcode = '42501';
  end if;

  if (old.status is not distinct from 'completed')
     is distinct from (new.status is not distinct from 'completed')
  then
    raise exception 'completed status is locked'
      using errcode = '42501';
  end if;

  if old.status in ('approved', 'completed')
     and new.service is distinct from old.service
  then
    raise exception 'service is locked after approval'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

drop trigger if exists bookings_guard_charge_update on public.bookings;
create trigger bookings_guard_charge_update
  before update on public.bookings
  for each row
  execute function public.guard_booking_charge_update();

-- ---------------------------------------------------------------------------
-- Claim / finalize. service_role only.
-- ---------------------------------------------------------------------------
create or replace function public.claim_booking_for_charge(
  p_booking_id uuid,
  p_provider_id uuid
) returns public.bookings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.bookings;
begin
  update public.bookings
  set
    payment_status = 'processing',
    charge_attempts = case
      when payment_status = 'failed' then coalesce(charge_attempts, 0) + 1
      else coalesce(charge_attempts, 0)
    end,
    charge_error = null,
    updated_at = now()
  where id = p_booking_id
    and provider_user_id = p_provider_id
    and status = 'approved'
    and (
      payment_status in ('unpaid', 'failed')
      or (
        payment_status = 'processing'
        and coalesce(updated_at, '-infinity'::timestamptz) < now() - interval '2 minutes'
      )
    )
  returning * into v_row;

  return v_row;
end;
$fn$;

create or replace function public.finalize_booking_charge(
  p_booking_id uuid,
  p_success boolean,
  p_payment_intent_id text default null,
  p_amount_cents integer default null,
  p_livemode boolean default null,
  p_destination text default null,
  p_error text default null
) returns public.bookings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.bookings;
begin
  if p_success then
    if p_payment_intent_id is null or btrim(p_payment_intent_id) = '' then
      raise exception 'payment_intent_id required';
    end if;

    update public.bookings
    set
      status = 'completed',
      payment_status = 'succeeded',
      payment_intent_id = p_payment_intent_id,
      charge_amount_cents = p_amount_cents,
      charge_livemode = p_livemode,
      charge_destination = p_destination,
      charge_error = null,
      charged_at = coalesce(charged_at, now()),
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
    where id = p_booking_id
      and status in ('approved', 'completed')
    returning * into v_row;
  else
    update public.bookings
    set
      payment_status = 'failed',
      payment_intent_id = coalesce(nullif(btrim(p_payment_intent_id), ''), payment_intent_id),
      charge_amount_cents = coalesce(p_amount_cents, charge_amount_cents),
      charge_livemode = coalesce(p_livemode, charge_livemode),
      charge_destination = coalesce(p_destination, charge_destination),
      charge_error = left(coalesce(nullif(btrim(p_error), ''), 'Payment failed'), 500),
      updated_at = now()
    where id = p_booking_id
      and status = 'approved'
    returning * into v_row;
  end if;

  return v_row;
end;
$fn$;

revoke all on function public.booking_price_cents(text) from public, anon, authenticated;
grant execute on function public.booking_price_cents(text) to service_role;

revoke all on function public.guard_booking_charge_update() from public;
grant execute on function public.guard_booking_charge_update() to anon, authenticated, service_role;

revoke all on function public.claim_booking_for_charge(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_booking_for_charge(uuid, uuid) to service_role;

revoke all on function public.finalize_booking_charge(uuid, boolean, text, integer, boolean, text, text) from public, anon, authenticated;
grant execute on function public.finalize_booking_charge(uuid, boolean, text, integer, boolean, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Notify the client and admins when a charged visit is completed.
-- Every previous branch is unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.notify_on_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_summary text;
  v_target uuid;
  v_title text;
  v_body text;
  v_type text;
begin
  if tg_op = 'DELETE' then
    v_summary := public.booking_shift_summary(
      OLD.service, OLD.scheduled_date::text, OLD.start_time, OLD.end_time
    );
    perform public.insert_notification(
      OLD.provider_user_id,
      'Shift deleted',
      v_summary || '. This shift was deleted.',
      'booking_deleted',
      OLD.id,
      OLD.client_zip_code
    );
    perform public.notify_admins(
      'Shift deleted',
      v_summary || '. This shift was deleted.',
      'booking_deleted',
      OLD.id,
      OLD.client_zip_code,
      OLD.provider_user_id
    );
    return OLD;
  end if;

  v_summary := public.booking_shift_summary(
    NEW.service, NEW.scheduled_date::text, NEW.start_time, NEW.end_time
  );

  if tg_op = 'INSERT' then
    if NEW.status = 'upcoming' then
      perform public.notify_upcoming_booking(NEW.id, NEW.client_zip_code, v_summary);
    end if;
    return NEW;
  end if;

  -- UPDATE OF status, or a zip edit on an open (upcoming) request.
  if old.status is distinct from new.status then
    if old.status = 'upcoming' and new.status = 'pending_client' then
      perform public.insert_notification(
        NEW.client_user_id,
        'A provider confirmed your shift',
        v_summary || '. Please review and approve.',
        'provider_confirmed',
        NEW.id,
        NEW.client_zip_code
      );
    elsif old.status = 'pending_client' and new.status = 'approved' then
      perform public.insert_notification(
        NEW.provider_user_id,
        'Client approved your shift',
        v_summary || '. The session is booked.',
        'client_approved',
        NEW.id,
        NEW.client_zip_code
      );
      perform public.notify_admins(
        'Client approved a shift',
        v_summary || '. The client approved this shift.',
        'client_approved',
        NEW.id,
        NEW.client_zip_code,
        NEW.provider_user_id
      );
    elsif old.status = 'approved' and new.status = 'completed' then
      declare
        v_paid_cents integer := coalesce(NEW.charge_amount_cents, NEW.price_cents);
        v_paid_amount text := case
          when v_paid_cents is null then null
          else '$' || to_char(v_paid_cents / 100.0, 'FM999999990.00')
        end;
        v_paid_title text := case
          when v_paid_amount is null then 'Visit completed'
          else 'Visit completed, ' || v_paid_amount || ' charged'
        end;
        v_paid_body text := case
          when v_paid_amount is null then v_summary || '. This visit was completed.'
          else v_summary || '. ' || v_paid_amount || ' charged.'
        end;
      begin
        perform public.insert_notification(
          NEW.client_user_id,
          v_paid_title,
          v_paid_body,
          'visit_completed',
          NEW.id,
          NEW.client_zip_code
        );
        perform public.notify_admins(
          v_paid_title,
          v_paid_body,
          'visit_completed',
          NEW.id,
          NEW.client_zip_code,
          NEW.provider_user_id
        );
      end;
    elsif old.status = 'pending_client' and new.status = 'upcoming' then
      -- Client asked for another time. provider_user_id is cleared in the same update,
      -- so the previous provider is OLD.provider_user_id.
      perform public.insert_notification(
        OLD.provider_user_id,
        'Client asked for another time',
        v_summary || '. The shift is back in available jobs.',
        'client_requested_time',
        NEW.id,
        NEW.client_zip_code
      );
    elsif new.status in ('cancelled', 'deleted') then
      v_target := coalesce(NEW.provider_user_id, OLD.provider_user_id);
      v_title := case when new.status = 'deleted' then 'Shift deleted' else 'Shift cancelled' end;
      v_body := v_summary || case
        when new.status = 'deleted' then '. This shift was deleted.'
        else '. This shift was cancelled.'
      end;
      v_type := case when new.status = 'deleted' then 'booking_deleted' else 'booking_cancelled' end;
      perform public.insert_notification(
        v_target, v_title, v_body, v_type, NEW.id, NEW.client_zip_code
      );
      perform public.notify_admins(
        v_title, v_body, v_type, NEW.id, NEW.client_zip_code, v_target
      );
    end if;
  elsif new.status = 'upcoming'
    and btrim(coalesce(old.client_zip_code, '')) is distinct from btrim(coalesce(new.client_zip_code, ''))
  then
    -- Admin set or corrected the zip on an open request. Fan out like a new upcoming booking.
    perform public.notify_upcoming_booking(NEW.id, NEW.client_zip_code, v_summary);
  end if;

  return NEW;
end;
$fn$;


-- ---------------------------------------------------------------------------
-- Test-mode Stripe ids. RLS on, no policies, service_role only.
-- Do not copy these ids into profiles or provider_profiles.
-- ---------------------------------------------------------------------------
create table if not exists public.stripe_test_fixtures (
  user_id uuid primary key,
  stripe_customer_id text,
  stripe_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_test_fixtures_customer_prefix
    check (stripe_customer_id is null or stripe_customer_id like 'cus_%'),
  constraint stripe_test_fixtures_account_prefix
    check (stripe_account_id is null or stripe_account_id like 'acct_%')
);

comment on table public.stripe_test_fixtures is
  'QA Stripe test customer and Connect account ids. Service role only.';

alter table public.stripe_test_fixtures enable row level security;

revoke all on table public.stripe_test_fixtures from public, anon, authenticated;
grant all on table public.stripe_test_fixtures to service_role;
