-- REQUIRED for a persisted Settings badge (Connected / Restricted).
-- Safe to re-run (IF NOT EXISTS).
--
-- Run in the Supabase SQL Editor for project uwgfitnpesgdkiwtekcb
-- (Dashboard → SQL Editor) if these columns are not already on
-- public.provider_profiles.
--
-- Do NOT re-add stripe_account_id. That column already exists on
-- the live table.
--
-- TEST / staging only. Flags are written by:
--   - stripe-connect-webhook on account.updated
--   - sync-connect-status (Settings load)
--   - create-connected-account / create-account-link when they retrieve
--     the Stripe Account
--
-- Settings still recovers the badge from a live Stripe retrieve even if
-- this migration has not been applied yet. Persist (and the next page
-- load from Postgres) requires these columns.

alter table public.provider_profiles
  add column if not exists charges_enabled boolean,
  add column if not exists payouts_enabled boolean,
  add column if not exists details_submitted boolean,
  add column if not exists onboarding_complete boolean;

comment on column public.provider_profiles.charges_enabled is
  'Stripe Connect Account.charges_enabled from account.updated / sync (TEST).';
comment on column public.provider_profiles.payouts_enabled is
  'Stripe Connect Account.payouts_enabled from account.updated / sync (TEST).';
comment on column public.provider_profiles.details_submitted is
  'Stripe Connect Account.details_submitted from account.updated / sync (TEST).';
comment on column public.provider_profiles.onboarding_complete is
  'True when details_submitted, charges_enabled, and payouts_enabled are all true.';
