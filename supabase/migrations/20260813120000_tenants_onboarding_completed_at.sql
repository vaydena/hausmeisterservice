-- Sprint 13.1 · Willkommens-Overlay: Merker, ob der Owner die Einführung
-- gesehen und abgehakt hat. NULL = noch nicht gesehen, Timestamp = dismissed.
-- Wird nur einmal pro Tenant gesetzt und nicht mehr zurückgenommen.

alter table public.tenants
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.tenants.onboarding_completed_at is
  'Timestamp, wann der Owner das Willkommens-Overlay geschlossen hat. NULL = noch anzeigen.';
