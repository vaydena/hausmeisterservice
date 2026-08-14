-- Sprint 40.1 · Portal-Willkommens-Overlay: Merker pro Resident, ob der
-- Bewohner den Erstbesuchs-Rundgang gesehen und geschlossen hat. Analog
-- zu tenants.onboarding_completed_at (Sprint 13.1) fuer die Staff-Seite,
-- aber pro Resident-Datensatz (nicht pro Tenant), damit jeder Bewohner
-- den Rundgang genau einmal sieht. NULL = noch anzeigen, Timestamp =
-- dismissed. Wird nicht mehr zurueckgenommen.

alter table public.residents
  add column if not exists portal_onboarding_completed_at timestamptz;

comment on column public.residents.portal_onboarding_completed_at is
  'Timestamp, wann der Resident das Portal-Willkommens-Overlay geschlossen hat. NULL = beim naechsten Dashboard-Aufruf anzeigen.';
