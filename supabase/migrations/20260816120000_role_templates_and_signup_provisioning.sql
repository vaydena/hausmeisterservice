-- Sprint 122 · Rollenvorlagen erreichen endlich den echten Kunden
--
-- Bisher: `app_auth.provision_signup_tenant` legte GENAU EINE Rolle an
-- ("Administrator", alle Rechte). Die 15 durchdachten Vorlagen aus
-- src/lib/permissions/registry.ts (Hausmeister, Disponent, Buchhaltung,
-- Winterdienst, Gaertner, Fahrer, ...) wurden ausschliesslich von
-- supabase/seed/onboarding.ts angewandt — einem lokalen Seed-Skript, das
-- nie auf einem Kundenmandanten laeuft. Nachweis im Ist-Zustand: der
-- geseedete Demo-Mandant hat 15 Rollen, der per Signup entstandene hat 1.
--
-- Ein Hausmeisterbetrieb haette also seine gesamte Rollenstruktur von Hand
-- nachbauen muessen, waehrend die fertigen Vorlagen ungenutzt im Code lagen.
--
-- Diese Migration bringt die Vorlagen dorthin, wo die Provisionierung sie
-- lesen kann: in zwei Referenztabellen, gefuellt aus derselben Code-Registry
-- wie `public.permissions` (supabase/seed/role-templates.ts). Damit bleibt
-- der Code die eine Wahrheit; die DB ist nur ihr Spiegel.
--
-- Warum `is_system` NICHT fuer alle Vorlagen gilt: `is_system` ist laut
-- settings/users/actions.ts die einzige Schranke vor dem Loeschen einer
-- Rolle. Alle 15 als System-Rollen zu markieren wuerde bedeuten, dass ein
-- Betrieb ohne Winterdienst den "Winterdienst-Mitarbeiter" nie wieder
-- loswird. Vorlagen sind Startpunkte, keine Vorschriften — deshalb ist
-- `is_system` genau dann gesetzt, wenn die Vorlage `editable = false` ist,
-- und das ist ausschliesslich `superadmin`.

-- ============================================================================
-- Referenztabellen
-- ============================================================================

create table if not exists public.role_templates (
  key              text primary key,
  name_de          text not null,
  description      text not null,
  editable         boolean not null default true,
  all_permissions  boolean not null default false,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.role_templates is
  'Startvorlagen fuer Mandanten-Rollen. Spiegel von SYSTEM_ROLE_TEMPLATES aus src/lib/permissions/registry.ts, gefuellt via supabase/seed/role-templates.ts. Wird beim Signup einmalig in public.roles kopiert — danach gehoert die Rolle dem Mandanten und ist frei aenderbar.';

comment on column public.role_templates.all_permissions is
  'true = beim Anlegen alle zum Zeitpunkt registrierten Permissions zuweisen (superadmin/admin). Wird NICHT als Zeiger gespeichert: die kopierte Rolle bekommt konkrete role_permissions-Zeilen und bleibt so, auch wenn spaeter neue Permissions dazukommen.';

comment on column public.role_templates.editable is
  'false wird beim Kopieren zu roles.is_system = true und sperrt Loeschen (und bei superadmin auch Bearbeiten). Nur superadmin.';

create table if not exists public.role_template_permissions (
  template_key    text not null references public.role_templates(key) on delete cascade,
  permission_key  text not null references public.permissions(key) on delete cascade,
  primary key (template_key, permission_key)
);

create index if not exists role_template_permissions_permission_key_idx
  on public.role_template_permissions (permission_key);

-- `create trigger`/`create policy` kennen kein `if not exists`. Ohne die
-- drops waere diese Migration die einzige im Repo, die beim zweiten Lauf
-- abbricht — und damit ein Stolperstein bei jedem Neuaufbau der DB.
drop trigger if exists role_templates_set_updated_at on public.role_templates;
create trigger role_templates_set_updated_at
  before update on public.role_templates
  for each row execute function app_auth.set_updated_at();

-- ============================================================================
-- RLS — globale Referenzdaten, analog public.permissions
-- ============================================================================
--
-- Lesbar fuer jeden Angemeldeten (die Rollenverwaltung zeigt spaeter an,
-- welche Vorlagen es gibt), schreibbar ausschliesslich via Service-Role.
-- Kein `to public`: anonym gibt es hier nichts zu holen.

alter table public.role_templates enable row level security;
alter table public.role_template_permissions enable row level security;

drop policy if exists role_templates_select on public.role_templates;
create policy role_templates_select on public.role_templates
  for select to authenticated using (true);

drop policy if exists role_templates_no_write on public.role_templates;
create policy role_templates_no_write on public.role_templates
  for all to authenticated using (false) with check (false);

drop policy if exists role_template_permissions_select on public.role_template_permissions;
create policy role_template_permissions_select on public.role_template_permissions
  for select to authenticated using (true);

drop policy if exists role_template_permissions_no_write on public.role_template_permissions;
create policy role_template_permissions_no_write on public.role_template_permissions
  for all to authenticated using (false) with check (false);

-- ============================================================================
-- Provisionierung: alle Vorlagen statt nur "Administrator"
-- ============================================================================

create or replace function app_auth.provision_signup_tenant(
  p_user_id            uuid,
  p_slug               text,
  p_company_name       text,
  p_terms_accepted_at  timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id     uuid;
  v_role_id       uuid;
  v_admin_role_id uuid;
  v_slug          text := p_slug;
  v_counter       int  := 2;
  v_existing      uuid;
  v_tpl           record;
begin
  -- Idempotenz: Membership schon vorhanden?
  select m.tenant_id into v_existing
  from public.memberships m
  where m.user_id = p_user_id
  limit 1;

  if v_existing is not null then
    select t.slug into v_slug from public.tenants t where t.id = v_existing;
    return jsonb_build_object('tenant_id', v_existing, 'slug', v_slug, 'created', false);
  end if;

  -- Slug-Kollisionshandling
  while exists (select 1 from public.tenants t where t.slug = v_slug) loop
    v_slug := p_slug || '-' || v_counter::text;
    v_counter := v_counter + 1;
    if v_counter > 100 then
      raise exception 'Kein freier Slug für "%" gefunden', p_slug;
    end if;
  end loop;

  -- Tenant
  insert into public.tenants (name, slug)
  values (p_company_name, v_slug)
  returning id into v_tenant_id;

  -- Rollen aus den Vorlagen
  for v_tpl in
    select rt.key, rt.name_de, rt.description, rt.editable, rt.all_permissions
    from public.role_templates rt
    order by rt.sort_order, rt.key
  loop
    insert into public.roles (tenant_id, key, name, description, is_system)
    values (
      v_tenant_id,
      v_tpl.key,
      v_tpl.name_de,
      v_tpl.description,
      not v_tpl.editable
    )
    returning id into v_role_id;

    if v_tpl.all_permissions then
      insert into public.role_permissions (role_id, permission_key)
      select v_role_id, p.key from public.permissions p;
    else
      insert into public.role_permissions (role_id, permission_key)
      select v_role_id, tp.permission_key
      from public.role_template_permissions tp
      where tp.template_key = v_tpl.key;
    end if;

    if v_tpl.key = 'admin' then
      v_admin_role_id := v_role_id;
    end if;
  end loop;

  -- Notausgang. Ohne ihn haette ein nicht synchronisiertes
  -- `role_templates` (Seed-Skript vergessen) einen Mandanten ganz ohne
  -- Rollen erzeugt: der Inhaber koennte sich anmelden, saehe aber eine
  -- Oberflaeche ohne Navigation und ohne Aktionen und muesste annehmen,
  -- die Anwendung sei kaputt. Lieber eine Rolle zu wenig als keine.
  if v_admin_role_id is null then
    insert into public.roles (tenant_id, key, name, description, is_system)
    values (
      v_tenant_id,
      'admin',
      'Administrator',
      'Voller Zugriff auf alle Funktionen des Mandanten.',
      false
    )
    returning id into v_admin_role_id;

    insert into public.role_permissions (role_id, permission_key)
    select v_admin_role_id, p.key from public.permissions p;
  end if;

  -- Owner-Membership + Rollen-Zuweisung
  insert into public.memberships (user_id, tenant_id, status, is_owner, terms_accepted_at)
  values (p_user_id, v_tenant_id, 'active', true, p_terms_accepted_at);

  insert into public.user_roles (user_id, role_id, tenant_id, created_by)
  values (p_user_id, v_admin_role_id, v_tenant_id, p_user_id);

  return jsonb_build_object('tenant_id', v_tenant_id, 'slug', v_slug, 'created', true);
end;
$$;
