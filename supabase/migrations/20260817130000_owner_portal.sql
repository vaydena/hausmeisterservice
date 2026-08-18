-- ============================================================================
-- Eigentümerportal (owner_portal) — Portal-Zugang + RLS
-- ============================================================================
-- Spiegelt das Bewohnerportal (20260803001500_resident_portal.sql) auf
-- Eigentümer:
--   residents.user_id            -> owners.user_id  (FK auth.users ON DELETE SET NULL)
--   is_resident_of_tenant()      -> is_property_owner_of_tenant()
--   resident_property_id()       -> property_owner_owns_property()  (M:N via owner_properties)
--
-- NAMENSFALLE: app_auth.is_tenant_owner() existiert bereits und meint den
-- SaaS-Kontoinhaber (memberships.is_owner / Superadmin), NICHT den Immobilien-
-- Eigentümer. Die neuen Helfer heissen deshalb bewusst "property_owner".
--
-- STRATEGIE: rein ADDITIV. Keine bestehende, funktionierende Policy und keine
-- zentrale Funktion (current_tenant_id!) wird veraendert. Die Portal-Sicht
-- kommt ueber zusaetzliche permissive `*_owner`-Policies dazu — Postgres
-- ODER-verknuepft permissive Policies. Genau dieses Muster nutzt das Repo
-- bereits (documents_select_resident_own_defect, work_orders_select_resident_own_defect).
--
-- auth.uid() steht bare nur INNERHALB der SECURITY-DEFINER-Helfer (wie bei den
-- resident-Helfern). In Policy-Qualen wird auth.uid() als (select auth.uid())
-- gewrappt (Perf-Initplan).
-- ============================================================================

-- 1) Portal-Spalten an owners (Spiegel von residents) --------------------------
alter table public.owners
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists portal_invited_at timestamptz,
  add column if not exists portal_activated_at timestamptz,
  add column if not exists portal_onboarding_completed_at timestamptz;

-- Ein Auth-Login gehoert zu hoechstens einem (nicht geloeschten) Eigentümer —
-- global, exakt wie residents_user_id_unique_idx beim Bewohnerportal.
create unique index if not exists owners_user_id_unique_idx
  on public.owners (user_id)
  where user_id is not null and deleted_at is null;

-- 2) RLS-Helfer (SECURITY DEFINER, STABLE, search_path='') --------------------
-- Ist der aktuelle Auth-User ein (aktiver) Portal-Eigentümer dieses Mandanten?
create or replace function app_auth.is_property_owner_of_tenant(p_tenant_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.owners o
    where o.tenant_id = p_tenant_id
      and o.user_id = auth.uid()
      and o.deleted_at is null
  );
$$;

-- Die owners.id des aktuellen Auth-Users in diesem Mandanten (fuer invoices.owner_id).
create or replace function app_auth.current_property_owner_id(p_tenant_id uuid)
returns uuid
language sql
stable security definer
set search_path to ''
as $$
  select o.id from public.owners o
  where o.tenant_id = p_tenant_id
    and o.user_id = auth.uid()
    and o.deleted_at is null
  order by o.created_at asc
  limit 1;
$$;

-- Herzstueck: sieht der aktuelle Portal-Eigentümer dieses Objekt? M:N ueber
-- owner_properties. Nicht mandantengefiltert — property_id ist global eindeutig
-- und gehoert genau einem Mandanten; die Policies klammern zusaetzlich
-- is_property_owner_of_tenant(tenant_id) davor.
create or replace function app_auth.property_owner_owns_property(p_property_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.owner_properties op
    join public.owners o on o.id = op.owner_id
    where op.property_id = p_property_id
      and o.user_id = auth.uid()
      and o.deleted_at is null
  );
$$;

grant execute on function app_auth.is_property_owner_of_tenant(uuid) to authenticated;
grant execute on function app_auth.current_property_owner_id(uuid) to authenticated;
grant execute on function app_auth.property_owner_owns_property(uuid) to authenticated;

-- 3) Portal-SELECT-Policies (rein additiv, permissiv) -------------------------

-- Objekte: der Eigentümer sieht die eigenen Objekte.
create policy properties_select_owner on public.properties
  for select to authenticated
  using (
    deleted_at is null
    and app_auth.is_property_owner_of_tenant(tenant_id)
    and app_auth.property_owner_owns_property(id)
  );

-- Gebaeude / Einheiten der eigenen Objekte.
create policy buildings_select_owner on public.buildings
  for select to authenticated
  using (
    app_auth.is_property_owner_of_tenant(tenant_id)
    and app_auth.property_owner_owns_property(property_id)
  );

create policy units_select_owner on public.units
  for select to authenticated
  using (
    app_auth.is_property_owner_of_tenant(tenant_id)
    and app_auth.property_owner_owns_property(property_id)
  );

-- Auftraege der eigenen Objekte (offene Aufgaben, Statistik).
create policy work_orders_select_owner on public.work_orders
  for select to authenticated
  using (
    deleted_at is null
    and app_auth.is_property_owner_of_tenant(tenant_id)
    and app_auth.property_owner_owns_property(property_id)
  );

-- Wartungen der eigenen Objekte.
create policy maintenance_plans_select_owner on public.maintenance_plans
  for select to authenticated
  using (
    deleted_at is null
    and app_auth.is_property_owner_of_tenant(tenant_id)
    and app_auth.property_owner_owns_property(property_id)
  );

-- Arbeitsberichte: nur FREIGEGEBENE. Entwuerfe sind intern.
create policy work_reports_select_owner on public.work_reports
  for select to authenticated
  using (
    deleted_at is null
    and status = 'approved'
    and app_auth.is_property_owner_of_tenant(tenant_id)
    and app_auth.property_owner_owns_property(property_id)
  );

-- Fotos der eigenen Objekte.
create policy photos_select_owner on public.photos
  for select to authenticated
  using (
    app_auth.is_property_owner_of_tenant(tenant_id)
    and app_auth.property_owner_owns_property(property_id)
  );

-- Dokumente: nur objektgebundene Dokumente der eigenen Objekte.
create policy documents_select_owner on public.documents
  for select to authenticated
  using (
    property_id is not null
    and app_auth.is_property_owner_of_tenant(tenant_id)
    and app_auth.property_owner_owns_property(property_id)
  );

-- Maengel der eigenen Objekte (auch von Mitarbeitern angelegte). Eigene
-- Meldungen sieht der Eigentümer ohnehin schon ueber reporter_user_id
-- (defect_reports_select_permitted).
create policy defect_reports_select_owner on public.defect_reports
  for select to authenticated
  using (
    app_auth.is_property_owner_of_tenant(tenant_id)
    and app_auth.property_owner_owns_property(property_id)
  );

-- 4) Portal-Schreibpfade fuer Eigentümermeldungen -----------------------------

-- Eigentümermeldung anlegen (reporter_kind='owner'). Der CHECK auf
-- defect_reports erlaubt 'owner' bereits. KEIN current_tenant_id():
-- is_property_owner_of_tenant + owns_property legen den Mandanten eindeutig
-- fest (ein Objekt gehoert genau einem Mandanten), und current_tenant_id()
-- liefert fuer reine Portal-Eigentümer ohnehin NULL.
create policy defect_reports_insert_owner on public.defect_reports
  for insert to authenticated
  with check (
    reporter_kind = 'owner'
    and reporter_user_id = (select auth.uid())
    and app_auth.is_property_owner_of_tenant(tenant_id)
    and app_auth.property_owner_owns_property(property_id)
  );

-- Zuruckziehen: eine eigene, noch nicht bearbeitete Meldung (status='new')
-- darf der Eigentümer wieder loeschen.
create policy defect_reports_delete_owner_own on public.defect_reports
  for delete to authenticated
  using (
    reporter_kind = 'owner'
    and reporter_user_id = (select auth.uid())
    and status = 'new'
    and app_auth.is_property_owner_of_tenant(tenant_id)
  );

-- 5) Rechnungen -----------------------------------------------------------------
-- Entweder auf den Eigentümer ausgestellt (owner_id) oder einem eigenen Objekt
-- zugeordnet (property_id).
create policy invoices_select_owner on public.invoices
  for select to authenticated
  using (
    app_auth.is_property_owner_of_tenant(tenant_id)
    and (
      (owner_id is not null and owner_id = app_auth.current_property_owner_id(tenant_id))
      or (property_id is not null and app_auth.property_owner_owns_property(property_id))
    )
  );
