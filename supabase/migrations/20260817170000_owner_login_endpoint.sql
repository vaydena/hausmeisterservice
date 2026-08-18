-- ============================================================================
-- Eigentümerportal — 'owner-login' als Login-Event-Endpoint zulassen
-- ============================================================================
-- auth_login_events.endpoint traegt einen CHECK, der bislang nur
-- 'staff-login' und 'portal-login' erlaubt (20260813200000). Der
-- Eigentuemer-Login (ownerSignInAction) schreibt seinen Anmeldeverlauf als
-- eigene Nutzerklasse 'owner-login' — analog zur getrennten Behandlung von
-- Staff und Bewohner. Ohne diese Erweiterung wuerde log_login_event() beim
-- Eigentuemer-Login an der CHECK scheitern (best-effort verschluckt, aber der
-- Eigentuemer haette keinen Anmeldeverlauf).
--
-- Rein additiv: die erlaubte Wertemenge waechst, bestehende Zeilen (nur
-- staff/portal) bleiben gueltig. Die auth_rate_limits.endpoint-Spalte braucht
-- KEINE Migration — sie ist bewusst constraint-frei (nur TS-typisiert).
-- ============================================================================

alter table public.auth_login_events
  drop constraint if exists auth_login_events_endpoint_check;

alter table public.auth_login_events
  add constraint auth_login_events_endpoint_check
  check (endpoint in ('staff-login', 'portal-login', 'owner-login'));
