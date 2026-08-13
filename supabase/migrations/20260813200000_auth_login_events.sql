-- Sprint 29: Login-Activity-Log.
--
-- Ziel: Owner (und langfristig alle User) sollen im Konto-Bereich ihre
-- letzten erfolgreichen Logins einsehen koennen — Zeit, IP, User-Agent,
-- Endpoint. Damit sind ungewoehnliche Zugriffe (Login aus fremden Land,
-- unbekannter Browser) frueh sichtbar, ohne dass wir Sentry-Details oder
-- Server-Logs an den User geben muessten.
--
-- Wir loggen bewusst NUR erfolgreiche Logins:
--  - Failure-Events wuerden entweder Enumeration ermoeglichen (welche
--    E-Mails existieren) oder ohne user_id auskommen und dann keinem
--    Konto zugeordnet werden koennen.
--  - Der Nutzen fuer den User liegt in "wo war ich zuletzt eingeloggt" —
--    Fehlversuche gegen sein Konto sieht er nicht als "seine" Aktivitaet.
--  - Brute-Force-Schutz macht bereits das auth_rate_limits (Sprint 20).
--
-- Speichern-Muster analog Sprint 21: Tabelle mit RLS deny-write, Zugriff
-- ausschliesslich ueber SECURITY DEFINER Function, execute-Grant nur an
-- service_role. SELECT-Policy erlaubt jedem User seine eigenen Events.

create table if not exists public.auth_login_events (
  id uuid primary key default gen_random_uuid(),

  -- Owner. on delete cascade: Wenn der User geloescht wird, verschwindet
  -- der Verlauf mit. auth.users ist die Supabase-verwaltete User-Tabelle.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Zeitpunkt des Login-Events.
  at timestamptz not null default now(),

  -- Absender-IP (best-effort, aus x-forwarded-for/CF-Connecting-IP).
  -- text statt inet, damit IPv4/IPv6/Fallback ('unknown') alle passen.
  ip text,

  -- User-Agent aus dem Request-Header, ungetrimmt. Die UI kuerzt.
  user_agent text,

  -- 'staff-login' | 'portal-login'. CHECK-Constraint haerte werten das
  -- Feld gegen typos in TS-Aufrufern.
  endpoint text not null,
  constraint auth_login_events_endpoint_check
    check (endpoint in ('staff-login', 'portal-login'))
);

comment on table public.auth_login_events is
  'Erfolgreiche Login-Events fuer den User-sichtbaren Anmeldeverlauf. Sprint 29. RLS SELECT nur auf eigene Rows; INSERT ausschliesslich ueber SECURITY DEFINER log_login_event(), grants nur an service_role.';

-- Index fuer den Query-Pattern "letzte N Events fuer einen User":
create index if not exists auth_login_events_user_id_at_idx
  on public.auth_login_events(user_id, at desc);

-- RLS: User darf seinen eigenen Verlauf sehen; keine Write-Policy.
alter table public.auth_login_events enable row level security;

create policy auth_login_events_select_own
  on public.auth_login_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- log_login_event(user_id, ip, user_agent, endpoint) -> void
--
-- Wird von Server-Actions nach erfolgreichem sign-in gerufen. SECURITY
-- DEFINER, damit der Aufruf ohne RLS-Insert-Policy trotzdem schreiben
-- kann. Grants nur an service_role — der anon/authenticated Client soll
-- nie in der Lage sein, Fake-Events fuer beliebige User zu erzeugen.
-- ---------------------------------------------------------------------------
create or replace function public.log_login_event(
  p_user_id uuid,
  p_ip text,
  p_user_agent text,
  p_endpoint text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.auth_login_events (user_id, ip, user_agent, endpoint)
  values (p_user_id, p_ip, p_user_agent, p_endpoint);
end;
$$;

comment on function public.log_login_event is
  'Schreibt einen erfolgreichen Login als Zeile in auth_login_events. Wird von /login-Server-Actions nach signInWithPassword aufgerufen.';

-- Grants: nur service_role darf die Function aufrufen.
revoke all on function public.log_login_event(uuid, text, text, text) from public;
grant execute on function public.log_login_event(uuid, text, text, text) to service_role;

-- Lockdown gegen den automatischen anon/authenticated-EXECUTE-Grant.
revoke execute on function public.log_login_event(uuid, text, text, text) from anon, authenticated;
