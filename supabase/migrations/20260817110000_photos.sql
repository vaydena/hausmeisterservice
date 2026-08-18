-- =============================================================================
-- Photos — Vorher/Nachher-Fotodokumentation (property-scoped)
-- =============================================================================
-- Eigene Tabelle statt der generischen `documents`: das Fotomodul hat sein
-- eigenes Rechtebündel (`photos.view/create/delete`, scopable). Über
-- `documents` liefe die Sichtbarkeit dagegen an `documents.*` — ein Mitarbeiter
-- mit Fotorecht, aber ohne Dokumentenrecht käme sonst nicht an seine Bilder.
--
-- Jede Zeile hängt an einem Objekt (property_id, Pflicht → RLS-Scope) und
-- optional an einem Auftrag. `phase` trägt die Vorher/Nachher-Aussage.
--
-- Der Bytestrom liegt im bereits existierenden privaten Bucket `attachments`
-- (siehe 20260803000000_documents_and_storage.sql). Dessen Storage-RLS prüft
-- den Tenant-Ordner als ersten Pfadteil — unser Pfad beginnt mit tenant_id,
-- passt also ohne neue Storage-Policy. Die feingranulare Sicht regelt diese
-- Tabelle. EXIF-Daten werden vor dem Upload serverseitig entfernt.
-- =============================================================================

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  work_order_id uuid references public.work_orders(id) on delete set null,
  phase text not null default 'general'
    check (phase in ('before', 'during', 'after', 'general')),
  storage_path text not null unique,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 26214400),
  caption text check (caption is null or length(caption) <= 500),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index photos_tenant_id_idx on public.photos(tenant_id);
create index photos_property_idx on public.photos(property_id, created_at desc);
create index photos_work_order_idx on public.photos(work_order_id) where work_order_id is not null;
create index photos_uploaded_by_idx on public.photos(uploaded_by) where uploaded_by is not null;

alter table public.photos enable row level security;

-- Eigener Upload ist immer sichtbar — auch ohne Objektrecht (wer es aufnimmt,
-- soll es wiederfinden). Deckungsgleich mit der documents-Logik.
create policy "photos_select_own" on public.photos
  for select to authenticated
  using (
    uploaded_by = (select auth.uid())
    and app_auth.is_tenant_member(tenant_id)
  );

create policy "photos_select_permitted" on public.photos
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('photos.view', 'property', property_id)
  );

create policy "photos_insert" on public.photos
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('photos.create', 'property', property_id)
  );

create policy "photos_delete_own" on public.photos
  for delete to authenticated
  using (
    uploaded_by = (select auth.uid())
    and app_auth.is_tenant_member(tenant_id)
  );

create policy "photos_delete_permitted" on public.photos
  for delete to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('photos.delete', 'property', property_id)
  );

-- Kein UPDATE: ein Foto ist ein Faktum. Die Bildunterschrift ist beim Upload
-- gesetzt; soll sie sich ändern, wird das Foto ersetzt.
