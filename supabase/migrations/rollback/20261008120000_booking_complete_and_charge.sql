-- Rolls back 20261008120000_booking_complete_and_charge.sql.
-- Restores notify_on_booking_change to the previous body, then drops the
-- charge columns, guard, claim/finalize functions, and stripe_test_fixtures.
-- Do not run this against production unless the feature is being removed.

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


drop trigger if exists bookings_guard_charge_update on public.bookings;

drop function if exists public.guard_booking_charge_update();
drop function if exists public.claim_booking_for_charge(uuid, uuid);
drop function if exists public.finalize_booking_charge(uuid, boolean, text, integer, boolean, text, text);
drop function if exists public.booking_price_cents(text);

drop table if exists public.stripe_test_fixtures;

drop index if exists public.bookings_payment_intent_id_unique;

alter table public.bookings drop constraint if exists bookings_payment_status_check;

alter table public.bookings
  drop column if exists price_cents,
  drop column if exists payment_status,
  drop column if exists payment_intent_id,
  drop column if exists charge_attempts,
  drop column if exists charge_amount_cents,
  drop column if exists charge_livemode,
  drop column if exists charge_destination,
  drop column if exists charge_error,
  drop column if exists charged_at,
  drop column if exists completed_at;
