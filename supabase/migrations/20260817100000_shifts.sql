-- =============================================================================
-- Shifts — Schichtmodelle (tenant-weite Konfiguration)
-- =============================================================================
-- Eine `shifts`-Zeile ist eine wiederverwendbare Schicht-Vorlage: Name, Lage
-- (Beginn/Ende), Pausenzeit, Farbe fuer die Kalenderdarstellung. Sie gehoert
-- dem Mandanten als Ganzes, nicht einem Objekt — deshalb kein property_id und
-- kein Property-Scope in der RLS.
--
-- Das einzige Recht ist `shifts.manage` (scopable = false, siehe
-- permissions/registry.ts). Wer es hat, sieht und pflegt die Schichtmodelle;
-- wer es nicht hat, hat mit der Konfiguration nichts zu tun. Alle vier Policies
-- pruefen deshalb dasselbe Recht in seiner tenant-weiten Form (ein Argument).
--
-- Ueber Mitternacht: end_time <= start_time bedeutet eine Nachtschicht, die am
-- Folgetag endet (22:00–06:00). Es gibt bewusst KEINE gespeicherte Spalte
-- dafuer — sie ergibt sich aus den beiden Zeiten und kann nicht mit ihnen
-- auseinanderlaufen. Die Dauer rechnet die Anwendung entsprechend.
-- =============================================================================

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  short_code text check (short_code is null or length(short_code) between 1 and 10),
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0 check (break_minutes between 0 and 1440),
  color text not null default '#2563eb' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  active boolean not null default true,
  notes text check (notes is null or length(notes) <= 2000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index shifts_tenant_id_idx on public.shifts(tenant_id);
create index shifts_active_idx on public.shifts(tenant_id, sort_order) where deleted_at is null;
create index shifts_created_by_idx on public.shifts(created_by);
create index shifts_updated_by_idx on public.shifts(updated_by);

create trigger shifts_set_updated_at
  before update on public.shifts
  for each row execute function app_auth.set_updated_at();

alter table public.shifts enable row level security;

create policy "shifts_select" on public.shifts
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('shifts.manage')
  );

create policy "shifts_insert" on public.shifts
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('shifts.manage')
  );

create policy "shifts_update" on public.shifts
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('shifts.manage')
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('shifts.manage')
  );

-- Loeschen laeuft wie bei keys/meters ueber Soft-Delete (deleted_at via update).
-- Kein DELETE-Policy: eine geloeschte Schicht bleibt als Zeile erhalten, damit
-- spaetere Verweise (Planung) ihren Namen noch aufloesen koennen.
