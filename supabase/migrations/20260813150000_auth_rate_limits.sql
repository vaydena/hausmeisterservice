-- Sprint 20: Rate-Limiting fuer Auth-Endpoints (login, signup, reset-password,
-- portal-login). Verhindert Brute-Force gegen Login/Portal-Login und
-- E-Mail-Enumeration-Angriffe gegen Signup/Reset-Password bevor der erste
-- Beta-Kunde live geht (PLAN.md §2.8 nennt Rate-Limiting explizit als
-- Anforderung, war bis jetzt aber nirgends implementiert).
--
-- Warum DB-basiert und nicht Redis/Upstash:
--   * Kein weiterer Vendor. Der Stack ist ohnehin Supabase-only, Hostinger
--     hat keine Redis-Instance und wir wollen keinen zusaetzlichen Betrieb
--     einfuehren, bevor er wirklich noetig ist.
--   * Ein Auth-Endpoint wird pro erlaubtem Versuch genau einmal getroffen —
--     also 3-5 mal pro 15 Minuten pro IP. Selbst 10.000 Angreifer erzeugen
--     nur ein paar hundert Writes pro Sekunde, was Postgres locker packt.
--   * SECURITY DEFINER + Row-Lock verhindern Race-Conditions ohne dass
--     die Applikations-Ebene atomicity garantieren muss.
--
-- Warum public schema und nicht auth: das auth-Schema wird von Supabase
-- verwaltet (Migrationen von aussen werden bei Version-Upgrades ueberschrieben
-- und koennen zu Konflikten fuehren). public gehoert uns.

create table if not exists public.auth_rate_limits (
  -- Identitaet ist (identifier, endpoint) — pro IP und Endpoint ein Zaehler.
  -- Der Primary Key ist ein Surrogatschluessel, damit FOR UPDATE Row-Locks
  -- (siehe check_and_consume_auth_rate_limit) klar an einer Zeile haengen
  -- und nicht am Key-Tuple.
  id uuid primary key default gen_random_uuid(),

  -- Best-effort Client-Identifier. In der Regel eine IP-Adresse (aus
  -- x-forwarded-for / x-real-ip); wenn das Fehlt, ein Fallback-String
  -- (siehe src/lib/security/client-ip.ts). Text statt inet, damit auch
  -- der Fallback-Wert reingeht und wir Fingerprinting (z.B. IP+Endpoint-Hash)
  -- spaeter erweitern koennen ohne Schema-Aenderung.
  identifier text not null,

  -- Welcher Auth-Endpoint. 'login' | 'signup' | 'reset-password' |
  -- 'portal-login'. Wird als text gefuehrt (statt enum), damit spaetere
  -- neue Endpoints keine ALTER TYPE-Migration brauchen; die zulaessigen
  -- Werte werden im TS-Layer typisiert (AuthRateLimitEndpoint-Union).
  endpoint text not null,

  -- Anzahl Fehlversuche im aktuellen Fenster.
  attempts integer not null default 0,

  -- Beginn des aktuellen Zaehl-Fensters. Wenn window_start + windowSec
  -- verstrichen ist, wird der Zaehler von der Function auf 1 resettet.
  window_start timestamptz not null default now(),

  -- Wenn gesetzt und in der Zukunft: der Identifier ist bis zu diesem
  -- Zeitpunkt gesperrt. Wird bei jedem Ueberschreiten des Limits neu
  -- gesetzt (blockSec ins Futur).
  blocked_until timestamptz,

  updated_at timestamptz not null default now(),

  constraint auth_rate_limits_identifier_endpoint_key unique (identifier, endpoint)
);

comment on table public.auth_rate_limits is
  'Pro-IP+Endpoint Sliding-Window Rate-Limit-Zaehler fuer Auth-Actions. Nur ueber die SECURITY DEFINER Functions check_and_consume_auth_rate_limit / reset_auth_rate_limit ansprechbar; direktes SELECT/UPDATE ist per RLS gesperrt und wird von den Applikations-Actions nicht benoetigt.';

-- Index fuer das Cleanup-Job (Range-Scan ueber alte Fenster).
create index if not exists auth_rate_limits_window_start_idx
  on public.auth_rate_limits (window_start);

-- RLS: dicht. Es gibt keine Policy — nur Service-Role (bypasst RLS)
-- kann direkt lesen/schreiben. Die Functions unten sind SECURITY DEFINER
-- und laufen als Owner, umgehen also RLS ebenfalls; der ausfuehrende
-- Rolle (authenticated, anon, service_role) bekommt keine direkten
-- Table-Grants.
alter table public.auth_rate_limits enable row level security;

-- ---------------------------------------------------------------------------
-- check_and_consume_auth_rate_limit(identifier, endpoint, limit, window_sec,
--                                    block_sec) -> (allowed, retry_after_sec)
--
-- Atomarer Sliding-Window-Check-and-Consume. Ein Aufruf pro Auth-Attempt:
--   * Existiert kein Eintrag: legt einen an (attempts=1), allowed=true.
--   * Ist blocked_until in der Zukunft: allowed=false, retry_after_sec =
--     Sekunden bis blocked_until.
--   * Ist das Fenster (window_start + window_sec) abgelaufen: resettet
--     attempts=1, window_start=now(), blocked_until=null, allowed=true.
--   * Sonst: attempts += 1. Erreicht attempts das Limit, wird blocked_until
--     auf now() + block_sec gesetzt und allowed=false zurueckgegeben; sonst
--     allowed=true.
--
-- FOR UPDATE serialisiert konkurrierende Aufrufe fuer dieselbe (identifier,
-- endpoint)-Zeile, damit zwei parallele Requests derselben IP nicht beide
-- als "unter Limit" durchgehen. Bei einem Miss (kein Row) waere ein
-- ON CONFLICT (identifier, endpoint) DO UPDATE ... noetig; wir loesen das
-- ueber eine INSERT ... ON CONFLICT DO NOTHING mit anschliessender
-- Retry-Logik, damit der Contention-Fall (zwei erste Aufrufe gleichzeitig)
-- korrekt funktioniert.
-- ---------------------------------------------------------------------------
create or replace function public.check_and_consume_auth_rate_limit(
  p_identifier text,
  p_endpoint text,
  p_limit integer,
  p_window_sec integer,
  p_block_sec integer
) returns table (allowed boolean, retry_after_sec integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.auth_rate_limits;
  v_now timestamptz := now();
  v_new_attempts integer;
  v_created boolean := false;
begin
  -- Erst versuchen einen neuen Zaehler anzulegen. ON CONFLICT DO NOTHING
  -- kollidiert wenn schon einer existiert; dann fallen wir in den
  -- Update-Pfad. Wichtig: attempts=1 beim Insert, weil das der Erst-
  -- Versuch selbst ist.
  insert into public.auth_rate_limits (identifier, endpoint, attempts, window_start)
  values (p_identifier, p_endpoint, 1, v_now)
  on conflict (identifier, endpoint) do nothing;

  -- FOUND ist genau dann true wenn der INSERT eine Zeile eingefuegt hat
  -- (kein Konflikt). Das ist das einzige eindeutige Signal "ich habe die
  -- Zeile gerade angelegt". Ein Timing-basierter Check ueber window_start
  -- ist unsicher: mehrere Aufrufe innerhalb weniger Millisekunden wuerden
  -- alle als "frisch angelegt" durchgehen und den Zaehler nie erhoehen.
  if FOUND then
    v_created := true;
  end if;

  -- Zeile jetzt garantiert vorhanden. Row-Lock verhindert dass parallele
  -- Aufrufe gleichzeitig UPDATE machen und der Zaehler zu niedrig endet.
  select * into v_row
  from public.auth_rate_limits
  where identifier = p_identifier and endpoint = p_endpoint
  for update;

  -- Wenn wir gerade selbst angelegt haben: attempts=1 gilt schon, wir
  -- sind erlaubt und muessen nichts updaten.
  if v_created then
    return query select true, 0;
    return;
  end if;

  -- Aktiv gesperrt?
  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    return query select false, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer;
    return;
  end if;

  -- Fenster abgelaufen? Dann Zaehler resetten und diesen Versuch als
  -- erster im neuen Fenster zaehlen.
  if v_row.window_start + make_interval(secs => p_window_sec) < v_now then
    update public.auth_rate_limits
    set attempts = 1,
        window_start = v_now,
        blocked_until = null,
        updated_at = v_now
    where id = v_row.id;
    return query select true, 0;
    return;
  end if;

  -- Innerhalb des Fensters: erhoehen. Wenn wir damit das Limit erreichen,
  -- ab jetzt gesperrt fuer block_sec Sekunden.
  v_new_attempts := v_row.attempts + 1;
  if v_new_attempts >= p_limit then
    update public.auth_rate_limits
    set attempts = v_new_attempts,
        blocked_until = v_now + make_interval(secs => p_block_sec),
        updated_at = v_now
    where id = v_row.id;
    return query select false, p_block_sec;
    return;
  end if;

  update public.auth_rate_limits
  set attempts = v_new_attempts,
      updated_at = v_now
  where id = v_row.id;
  return query select true, 0;
end;
$$;

comment on function public.check_and_consume_auth_rate_limit is
  'Atomarer Rate-Limit-Check fuer Auth-Endpoints. Gibt (allowed, retry_after_sec) zurueck. Bei allowed=false ist der Aufrufer fuer retry_after_sec Sekunden gesperrt. Race-condition-frei via FOR UPDATE Row-Lock. Aufruf ausschliesslich aus Server-Actions via Service-Role-RPC.';

-- ---------------------------------------------------------------------------
-- reset_auth_rate_limit(identifier, endpoint)
--
-- Loescht den Zaehler fuer (identifier, endpoint). Wird nach erfolgreichem
-- Login/Portal-Login aufgerufen, damit ein legitimes Passwort nicht durch
-- vergangene Fehlversuche gesperrt bleibt. Fuer signup/reset-password NICHT
-- aufrufen — dort gilt das Limit auch bei Erfolg (E-Mail-Enumeration-Schutz).
-- ---------------------------------------------------------------------------
create or replace function public.reset_auth_rate_limit(
  p_identifier text,
  p_endpoint text
) returns void
language sql
security definer
set search_path = public
as $$
  delete from public.auth_rate_limits
  where identifier = p_identifier and endpoint = p_endpoint;
$$;

comment on function public.reset_auth_rate_limit is
  'Loescht den Rate-Limit-Zaehler fuer (identifier, endpoint). Nach erfolgreichem Login aufrufen, damit vergangene Fehlversuche den Zugang nicht mehr blockieren.';

-- ---------------------------------------------------------------------------
-- cleanup_expired_auth_rate_limits() -> count
--
-- Loescht Eintraege deren Fenster laenger als 1 Tag zurueckliegt und die
-- nicht mehr gesperrt sind. Verhindert unbegrenztes Wachstum der Tabelle.
-- Kann via /api/cron/run-automations oder manuell aufgerufen werden;
-- muss nicht sekundengenau laufen.
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_expired_auth_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  with deleted as (
    delete from public.auth_rate_limits
    where (blocked_until is null and window_start < now() - interval '1 day')
       or (blocked_until is not null and blocked_until < now() - interval '1 day')
    returning 1
  )
  select count(*)::integer into v_deleted from deleted;
  return v_deleted;
end;
$$;

comment on function public.cleanup_expired_auth_rate_limits is
  'Loescht alle Rate-Limit-Eintraege deren Fenster/Sperre laenger als 1 Tag verstrichen ist. Rueckgabe: Anzahl geloeschter Zeilen.';

-- Grants: nur service_role darf die Functions aufrufen. authenticated und
-- anon bekommen KEIN EXECUTE — das gesamte Rate-Limiting laeuft im Kontext
-- des Service-Client aus src/lib/supabase/service.ts. Wenn eine Anon-Rolle
-- die Function direkt aufrufen koennte, koennte sie mit p_limit=1000000
-- den Rate-Limit-Check umgehen.
revoke all on function public.check_and_consume_auth_rate_limit(text, text, integer, integer, integer) from public;
revoke all on function public.reset_auth_rate_limit(text, text) from public;
revoke all on function public.cleanup_expired_auth_rate_limits() from public;

grant execute on function public.check_and_consume_auth_rate_limit(text, text, integer, integer, integer) to service_role;
grant execute on function public.reset_auth_rate_limit(text, text) to service_role;
grant execute on function public.cleanup_expired_auth_rate_limits() to service_role;
