-- Admin access to every booking (including null client_zip_code rows that
-- providers cannot see) plus contact lookup for the /admin/bookings page.
--
-- user_roles.role is text. Calls has_role(_user_id uuid, _role text).
-- Re-run 20260930210000 first so its RPCs pass a text role, then run this file.
--
-- Run in the Supabase SQL Editor for project uwgfitnpesgdkiwtekcb.
-- Safe to re-run.

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
      create function public.has_role(_user_id uuid, _role text)
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

-- Admins can read, correct, and remove any booking. Existing client/provider
-- policies stay in place (permissive policies are OR'd).
drop policy if exists "Admins can select bookings" on public.bookings;
create policy "Admins can select bookings"
  on public.bookings
  for select
  to authenticated
  using (public.has_role(_user_id => auth.uid(), _role => 'admin'));

drop policy if exists "Admins can update bookings" on public.bookings;
create policy "Admins can update bookings"
  on public.bookings
  for update
  to authenticated
  using (public.has_role(_user_id => auth.uid(), _role => 'admin'))
  with check (public.has_role(_user_id => auth.uid(), _role => 'admin'));

drop policy if exists "Admins can delete bookings" on public.bookings;
create policy "Admins can delete bookings"
  on public.bookings
  for delete
  to authenticated
  using (public.has_role(_user_id => auth.uid(), _role => 'admin'));

-- Extra SELECT only. Does not enable RLS and does not replace existing policies.
-- If RLS is already on, admins can read rows. If RLS is off, these policies are inert.
drop policy if exists "Admins can read profiles" on public.profiles;
create policy "Admins can read profiles"
  on public.profiles
  for select
  to authenticated
  using (public.has_role(_user_id => auth.uid(), _role => 'admin'));

drop policy if exists "Admins can read provider zip codes" on public.provider_zip_codes;
create policy "Admins can read provider zip codes"
  on public.provider_zip_codes
  for select
  to authenticated
  using (public.has_role(_user_id => auth.uid(), _role => 'admin'));

-- Email lives on auth.users, which the browser cannot read. Admins only.
create or replace function public.admin_user_contacts(p_user_ids uuid[])
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null
     or not public.has_role(_user_id => auth.uid(), _role => 'admin')
  then
    raise exception 'Not allowed';
  end if;

  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return;
  end if;

  if cardinality(p_user_ids) > 500 then
    raise exception 'Too many ids';
  end if;

  return query
  select u.id, u.email::text, p.first_name, p.last_name
  from auth.users u
  left join public.profiles p on p.user_id = u.id
  where u.id = any (p_user_ids);
end;
$fn$;

revoke all on function public.admin_user_contacts(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_user_contacts(uuid[]) to authenticated;
