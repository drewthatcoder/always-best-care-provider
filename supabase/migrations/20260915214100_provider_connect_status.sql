-- OPTIONAL — documented, not auto-applied by this PR.
--
-- Run in the Supabase SQL Editor for project uwgfitnpesgdkiwtekcb
-- (Dashboard → SQL Editor) BEFORE enabling the Connect webhook writes.
--
-- Do NOT re-add stripe_account_id. That column already exists on
-- public.provider_profiles in the live database.
--
-- TEST / staging only. These flags are written by stripe-connect-webhook
-- on account.updated. They are not used to charge clients.

alter table public.provider_profiles
  add column if not exists charges_enabled boolean,
  add column if not exists payouts_enabled boolean,
  add column if not exists details_submitted boolean,
  add column if not exists onboarding_complete boolean;

comment on column public.provider_profiles.charges_enabled is
  'Stripe Connect Account.charges_enabled from account.updated (TEST webhook).';
comment on column public.provider_profiles.payouts_enabled is
  'Stripe Connect Account.payouts_enabled from account.updated (TEST webhook).';
comment on column public.provider_profiles.details_submitted is
  'Stripe Connect Account.details_submitted from account.updated (TEST webhook).';
comment on column public.provider_profiles.onboarding_complete is
  'True when details_submitted, charges_enabled, and payouts_enabled are all true.';
