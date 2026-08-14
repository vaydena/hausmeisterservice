-- Sprint 31: Session-Uebersicht mit einzelnem Widerruf.
--
-- Bisher konnte der User auf /settings/account nur "Alle anderen Sitzungen
-- abmelden" — ein Alles-oder-Nichts. Diese Migration liefert zwei RPCs:
--   list_user_sessions(p_user_id) -> JSON-Liste aller aktiven Sessions
--   revoke_user_session(p_user_id, p_session_id) -> 1 bei Loeschung, 0 sonst
--
-- Beide SECURITY DEFINER, weil auth.sessions ein Supabase-internes Schema
-- ist, das aus authenticated-Kontext nicht lesbar/schreibbar waere. Wir
-- fahren das Sprint-21-Lockdown-Muster: kein Grant an anon/authenticated,
-- Aufruf ausschliesslich via service_role (Server-Actions passen p_user_id
-- immer als ctx.userId aus requireTenantContext durch — die Ownership-
-- Bedingung `user_id = p_user_id` in den Functions ist der zweite Guard,
-- falls jemand die service_role je aus einem anderen Kontext missbraucht).

-- ---------------------------------------------------------------------------
-- list_user_sessions(user_id) -> json
--
-- Alle nicht-abgelaufenen Sessions des Users, sortiert nach zuletzt genutzt
-- (updated_at desc). host(ip::inet) macht daraus einen lesbaren String
-- ohne die inet-spezifische Netzmaske. aal wird als text ausgegeben, damit
-- der TS-Layer nicht das interne enum-Symbol kennen muss.
-- ---------------------------------------------------------------------------
create or replace function public.list_user_sessions(p_user_id uuid)
returns json
language sql
security definer
set search_path = public, auth
as $$
  select coalesce(json_agg(row_to_json(s) order by s.updated_at desc nulls last, s.created_at desc), '[]'::json)
  from (
    select
      id,
      created_at,
      updated_at,
      refreshed_at,
      not_after,
      user_agent,
      host(ip) as ip,
      aal::text as aal,
      factor_id
    from auth.sessions
    where user_id = p_user_id
      and (not_after is null or not_after > now())
  ) s;
$$;

comment on function public.list_user_sessions(uuid) is
  'Aktive Sessions eines Users als JSON-Array. Sprint 31. SECURITY DEFINER weil auth.sessions per Default fuer authenticated dicht ist. Grant nur an service_role — der Aufrufer (Server-Action) muss p_user_id aus einem verifizierten Auth-Kontext (ctx.userId) beziehen.';

-- ---------------------------------------------------------------------------
-- revoke_user_session(user_id, session_id) -> integer
--
-- Loescht die Session-Row (kaskadiert auf auth.refresh_tokens; Supabase
-- invalidiert den zugehoerigen Access-Token beim naechsten Refresh). Der
-- Ownership-Check (`user_id = p_user_id`) verhindert, dass ein Aufruf
-- mit falscher p_session_id fremde Sessions killt — selbst mit einem
-- theoretisch entwendeten service_role-Zugang muesste der Angreifer noch
-- die richtige (session_id, user_id)-Kombination raten.
--
-- Rueckgabe: 1 bei Loeschung, 0 wenn keine Session gefunden. Die Server-
-- Action kann daraus eine Fehlermeldung ableiten ("Sitzung nicht mehr
-- aktiv"), ohne Informationen ueber die Existenz fremder Sessions preis-
-- zugeben.
-- ---------------------------------------------------------------------------
create or replace function public.revoke_user_session(
  p_user_id uuid,
  p_session_id uuid
) returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_affected integer;
begin
  delete from auth.sessions
    where id = p_session_id and user_id = p_user_id;
  get diagnostics v_affected = row_count;
  return v_affected;
end;
$$;

comment on function public.revoke_user_session(uuid, uuid) is
  'Beendet eine einzelne Session eines Users. Sprint 31. Rueckgabe: 1 bei Loeschung, 0 wenn Session unbekannt oder nicht dem User gehoert. SECURITY DEFINER; Grant nur an service_role.';

-- Grants: nur service_role. Sprint-21-Lockdown gegen den automatischen
-- anon/authenticated-EXECUTE-Grant, den Postgres/Supabase neuen public-
-- Functions verpasst.
revoke all on function public.list_user_sessions(uuid) from public;
revoke all on function public.revoke_user_session(uuid, uuid) from public;

grant execute on function public.list_user_sessions(uuid) to service_role;
grant execute on function public.revoke_user_session(uuid, uuid) to service_role;

revoke execute on function public.list_user_sessions(uuid) from anon, authenticated;
revoke execute on function public.revoke_user_session(uuid, uuid) from anon, authenticated;
