-- Booking notifications are inserted by the database, not the browser.
-- Cross-user inserts from the client are rejected by notifications RLS
-- (user_id = auth.uid() applies to INSERT as well).
--
-- Do NOT run this against production until the PR is approved.
-- Apply this file BEFORE 20260930210100_admin_bookings_access.sql.
-- Frontend that removes the old browser inserts should ship only after this SQL.
--
-- Run in the Supabase SQL Editor for project uwgfitnpesgdkiwtekcb
-- (Dashboard → SQL Editor → New query → paste → Run).
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- has_role: create only when missing. Live Admin Login already calls
-- has_role(_user_id, _role). Do not replace an existing overload.
-- ---------------------------------------------------------------------------
do $ensure_has_role$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'has_role'
  ) then
    execute $create_has_role$
      create function public.has_role(_user_id uuid, _role public.app_role)
      returns boolean
      language sql
      stable
      security definer
      set search_path = public
      as $body$
        select exists (
          select 1
          from public.user_roles
          where user_id = _user_id
            and role = _role
        );
      $body$;
    $create_has_role$;
  end if;
end
$ensure_has_role$;

do $harden_has_role$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'has_role'
  loop
    execute format('alter function %s security definer set search_path = public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end
$harden_has_role$;

-- ---------------------------------------------------------------------------
-- notifications: optional type + booking_id. Nullable so existing rows stay valid.
-- booking_id is not a foreign key; deleted bookings can keep the id on the notice.
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column if not exists type text,
  add column if not exists booking_id uuid;

comment on column public.notifications.type is
  'Optional category such as new_booking, unmatched_booking, provider_confirmed, client_approved, client_requested_time, booking_cancelled, booking_deleted.';

comment on column public.notifications.booking_id is
  'Booking this notice refers to. Nullable and not a foreign key.';

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_booking_id_idx
  on public.notifications (booking_id);

-- Users can read their own role rows (admin route checks, /notifications routing).
alter table public.user_roles enable row level security;

drop policy if exists "Users can read their own roles" on public.user_roles;

create policy "Users can read their own roles"
  on public.user_roles
  for select
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Internal writers. SECURITY DEFINER so inserts bypass notifications RLS.
-- Not callable by anon/authenticated (revoked below).
-- ---------------------------------------------------------------------------
create or replace function public.insert_notification(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_booking_id uuid,
  p_client_zip_code text
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications (user_id, title, body, read, client_zip_code, type, booking_id)
  values (p_user_id, p_title, p_body, false, p_client_zip_code, p_type, p_booking_id);
end;
$fn$;

create or replace function public.notify_admins(
  p_title text,
  p_body text,
  p_type text,
  p_booking_id uuid,
  p_client_zip_code text,
  p_exclude uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
begin
  for r in
    select distinct ur.user_id
    from public.user_roles ur
    where ur.role = 'admin'
      and (p_exclude is null or ur.user_id is distinct from p_exclude)
  loop
    perform public.insert_notification(
      r.user_id, p_title, p_body, p_type, p_booking_id, p_client_zip_code
    );
  end loop;
end;
$fn$;

create or replace function public.booking_shift_summary(
  p_service text,
  p_scheduled_date text,
  p_start text,
  p_end text
) returns text
language sql
immutable
as $fn$
  select format(
    '%s on %s, %s–%s',
    coalesce(nullif(btrim(p_service), ''), 'Care'),
    coalesce(nullif(btrim(p_scheduled_date), ''), 'unscheduled date'),
    coalesce(nullif(btrim(p_start), ''), '—'),
    coalesce(nullif(btrim(p_end), ''), '—')
  );
$fn$;

-- New upcoming booking: providers who cover the zip, or admins when unmatched.
create or replace function public.notify_upcoming_booking(
  p_booking_id uuid,
  p_zip text,
  p_summary text
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_zip text := nullif(btrim(coalesce(p_zip, '')), '');
  v_count integer;
  r record;
begin
  if v_zip is null then
    perform public.notify_admins(
      'Unmatched booking',
      p_summary || '. No zip code is on file, so no provider can see this shift.',
      'unmatched_booking',
      p_booking_id,
      p_zip
    );
    return;
  end if;

  select count(distinct z.user_id)
    into v_count
  from public.provider_zip_codes z
  where btrim(z.zip_code) = v_zip;

  if coalesce(v_count, 0) = 0 then
    perform public.notify_admins(
      'Unmatched booking',
      p_summary || '. No provider covers zip ' || v_zip || '.',
      'unmatched_booking',
      p_booking_id,
      v_zip
    );
    return;
  end if;

  for r in
    select distinct z.user_id
    from public.provider_zip_codes z
    where btrim(z.zip_code) = v_zip
  loop
    perform public.insert_notification(
      r.user_id,
      'New booking in your area',
      p_summary || ' (zip ' || v_zip || ').',
      'new_booking',
      p_booking_id,
      v_zip
    );
  end loop;
end;
$fn$;

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

drop trigger if exists bookings_notify_on_status on public.bookings;

create trigger bookings_notify_on_status
  after insert or update of status, client_zip_code or delete
  on public.bookings
  for each row
  execute function public.notify_on_booking_change();

-- Provider "I have a problem" — cannot look up admin ids under user_roles RLS.
create or replace function public.report_booking_problem(
  p_booking_id uuid,
  p_message text
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_booking public.bookings%rowtype;
  v_message text := btrim(coalesce(p_message, ''));
  v_summary text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if v_message = '' then
    raise exception 'Message required';
  end if;
  if char_length(v_message) > 500 then
    raise exception 'Message too long';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found';
  end if;

  if not (
    public.has_role(_user_id => auth.uid(), _role => 'admin'::public.app_role)
    or v_booking.client_user_id = auth.uid()
    or v_booking.provider_user_id = auth.uid()
    or exists (
      select 1
      from public.provider_zip_codes z
      where z.user_id = auth.uid()
        and btrim(coalesce(v_booking.client_zip_code, '')) <> ''
        and btrim(z.zip_code) = btrim(v_booking.client_zip_code)
    )
  ) then
    raise exception 'Not allowed';
  end if;

  v_summary := public.booking_shift_summary(
    v_booking.service, v_booking.scheduled_date::text, v_booking.start_time, v_booking.end_time
  );

  perform public.notify_admins(
    'Provider reported a problem',
    v_summary || ': ' || v_message,
    'problem_report',
    v_booking.id,
    v_booking.client_zip_code
  );
end;
$fn$;

-- Client "Decline, please call me" — not a status change, so the trigger does not cover it.
create or replace function public.notify_client_requests_call(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_booking public.bookings%rowtype;
  v_summary text;
  v_phone text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.client_user_id is distinct from auth.uid()
     and not public.has_role(_user_id => auth.uid(), _role => 'admin'::public.app_role)
  then
    raise exception 'Not allowed';
  end if;

  if v_booking.provider_user_id is null then
    return;
  end if;

  v_phone := coalesce(nullif(btrim(v_booking.client_phone), ''), 'the number on file');
  v_summary := public.booking_shift_summary(
    v_booking.service, v_booking.scheduled_date::text, v_booking.start_time, v_booking.end_time
  );

  perform public.insert_notification(
    v_booking.provider_user_id,
    'Client requests a call',
    v_summary || '. Please call the client at ' || v_phone || ' to discuss scheduling.',
    'client_requests_call',
    v_booking.id,
    v_booking.client_zip_code
  );
end;
$fn$;

revoke all on function public.insert_notification(uuid, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.notify_admins(text, text, text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.booking_shift_summary(text, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_upcoming_booking(uuid, text, text) from public, anon, authenticated;
revoke all on function public.notify_on_booking_change() from public, anon, authenticated;

revoke all on function public.report_booking_problem(uuid, text) from public, anon, authenticated;
grant execute on function public.report_booking_problem(uuid, text) to authenticated;

revoke all on function public.notify_client_requests_call(uuid) from public, anon, authenticated;
grant execute on function public.notify_client_requests_call(uuid) to authenticated;

-- Realtime so the notification bell can subscribe. Idempotent.
alter table public.notifications replica identity full;

do $pub$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     )
  then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$pub$;
