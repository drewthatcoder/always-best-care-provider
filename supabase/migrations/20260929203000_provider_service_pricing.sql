-- Provider service pricing submissions from the public /pricing-form page.
-- One row per zip code × service. Rows from a single submit share submission_id.
--
-- Written only by the submit-service-pricing Edge Function (service role).
-- Do NOT run this against production until Drew approves.
--
-- Run in the Supabase SQL Editor for project uwgfitnpesgdkiwtekcb
-- (Dashboard → SQL Editor).
--
-- Safe to re-run (IF NOT EXISTS / drop policy if exists).

create table if not exists public.provider_service_pricing (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  provider_name text not null,
  provider_email text not null,
  provider_phone text,
  user_id uuid references auth.users (id) on delete set null,
  zip text not null,
  service text not null,
  price_cents integer not null constraint provider_service_pricing_price_cents_nonnegative check (price_cents >= 0),
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.provider_service_pricing is
  'Provider prices from /pricing-form. Inserts are service-role only (submit-service-pricing).';

create index if not exists provider_service_pricing_submission_id_idx
  on public.provider_service_pricing (submission_id);

create index if not exists provider_service_pricing_zip_idx
  on public.provider_service_pricing (zip);

create index if not exists provider_service_pricing_provider_email_idx
  on public.provider_service_pricing (provider_email);

alter table public.provider_service_pricing enable row level security;

-- No INSERT, UPDATE, or DELETE policies for anon or authenticated.
-- The Edge Function uses the service role, which bypasses RLS.

drop policy if exists "Users can read their own service pricing" on public.provider_service_pricing;

create policy "Users can read their own service pricing"
  on public.provider_service_pricing
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.provider_service_pricing from anon, authenticated;
grant select on table public.provider_service_pricing to authenticated;
grant all on table public.provider_service_pricing to service_role;
