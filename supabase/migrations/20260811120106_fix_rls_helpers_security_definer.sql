-- Security-Fix: RLS-Helper-Functions app_auth.is_tenant_member,
-- app_auth.is_tenant_owner und app_auth.has_permission fehlten
-- SECURITY DEFINER, was zu Postgres-Stack-Overflow-Rekursion führte.
--
-- Aufruf-Kette (Beispiel is_tenant_member):
--   1. Server-Client SELECT auf memberships
--   2. RLS-Policy auf memberships ruft app_auth.is_tenant_member(...)
--   3. Function-Body macht ohne SECURITY DEFINER erneut ein SELECT gegen
--      public.memberships MIT den Rechten des aufrufenden Users
--   4. RLS greift wieder → app_auth.is_tenant_member(...) → ...
--   → stack depth limit exceeded (Postgres 54001).
--
-- Live-Symptom (2026-08-11 Prod):
--   * Login erfolgreich, Redirect zu /dashboard
--   * requireTenantContext() → supabase.from('memberships')
--   * RLS → Recursion → 500 im Server-Render → Next.js Error-Boundary
--     redirected im Loop → im Browser sichtbar als
--     ERR_TOO_MANY_REDIRECTS bzw. "This page couldn't load"
--
-- Root Cause:
--   In 20260801095724_init.sql wurden die drei Helper ohne SECURITY DEFINER
--   angelegt. app_auth.current_tenant_id() ist absichtlich INVOKER (liest
--   nur den JWT-Claim + fallback aus memberships; wird aber selbst NICHT
--   in RLS-Policies auf memberships benutzt, daher dort keine Rekursion).
--
-- Fix:
--   SECURITY DEFINER auf die drei Helper. Sie behalten SET search_path TO ''
--   und selektieren nur aus fixen, schema-qualifizierten public.-Tabellen
--   (memberships, user_roles, role_permissions) → kein Search-Path-Hijacking,
--   kein zusätzliches Angriffspotenzial durch den Owner-Wechsel.
--
-- Herkunft dieser Datei:
--   Die Änderung wurde am 2026-08-11 12:01:06 UTC via MCP apply_migration
--   direkt in Prod ausgeführt, um den Live-Ausfall sofort zu beheben. Diese
--   Datei zieht die Änderung ins Repo nach, damit `supabase db reset` und
--   neue Environments den korrekten Zustand herstellen. Der Timestamp im
--   Dateinamen entspricht exakt dem Eintrag in supabase_migrations.schema_migrations,
--   daher wird sie beim nächsten `supabase db push` als "already applied"
--   erkannt und nicht erneut ausgeführt.

create or replace function app_auth.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function app_auth.is_tenant_owner()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = app_auth.current_tenant_id()
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.is_owner = true
  );
$$;

create or replace function app_auth.has_permission(
  p_permission_key text,
  p_scope_type text default null,
  p_scope_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = auth.uid()
      and ur.tenant_id = app_auth.current_tenant_id()
      and rp.permission_key = p_permission_key
      and (
        ur.scope_type is null
        or (p_scope_type is not null and ur.scope_type = p_scope_type and ur.scope_id = p_scope_id)
      )
  );
$$;
