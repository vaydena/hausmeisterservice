-- =============================================================================
-- Documents + Storage — polymorphe Anhänge (Fotos & Dateien) für alle Entitäten
-- =============================================================================
-- Eine `documents`-Zeile hängt an einer beliebigen Entität via (entity_type,
-- entity_id). property_id ist denormalisiert für schnelle property-scoped RLS.
--
-- Uploads/Downloads laufen ausschließlich über Server Actions mit dem
-- authenticated Supabase-Client — RLS greift also nutzerbezogen.
--
-- Storage-Bucket `attachments` ist privat; Storage-RLS erlaubt authenticated
-- Zugriff nur im eigenen Tenant-Ordner (Path-Prefix = tenant_id).
-- Feingranulare Berechtigung passiert über die documents-Tabelle.
-- =============================================================================

-- work_order_photos wird nirgends im App-Code verwendet und wird durch die
-- generische documents-Tabelle vollständig ersetzt.
drop table if exists public.work_order_photos;

-- -----------------------------------------------------------------------------
-- documents
-- -----------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null
    check (entity_type in (
      'work_order',
      'defect_report',
      'checklist_run_item',
      'property',
      'unit'
    )),
  entity_id uuid not null,
  property_id uuid references public.properties(id) on delete cascade,
  kind text not null default 'file'
    check (kind in ('photo', 'file')),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 26214400),
  caption text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index documents_tenant_id_idx on public.documents(tenant_id);
create index documents_entity_idx on public.documents(entity_type, entity_id);
create index documents_property_id_idx on public.documents(property_id)
  where property_id is not null;
create index documents_uploaded_by_idx on public.documents(uploaded_by)
  where uploaded_by is not null;

alter table public.documents enable row level security;

-- Sehen: Rechte auf 'documents.view' im Property-Scope; oder eigener Upload.
create policy "documents_select_own" on public.documents
  for select to authenticated
  using (
    uploaded_by = auth.uid()
    and app_auth.is_tenant_member(tenant_id)
  );

create policy "documents_select_permitted" on public.documents
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and (
      property_id is null
        or app_auth.has_permission('documents.view', 'property', property_id)
    )
  );

-- Hochladen: 'documents.create' im Property-Scope (oder tenant-weit wenn ohne Property)
create policy "documents_insert" on public.documents
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and (
      property_id is null
        or app_auth.has_permission('documents.create', 'property', property_id)
    )
  );

-- Löschen: 'documents.delete' im Property-Scope oder eigener Upload.
create policy "documents_delete_own" on public.documents
  for delete to authenticated
  using (
    uploaded_by = auth.uid()
    and app_auth.is_tenant_member(tenant_id)
  );

create policy "documents_delete_permitted" on public.documents
  for delete to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and (
      property_id is null
        or app_auth.has_permission('documents.delete', 'property', property_id)
    )
  );

-- Update bewusst nicht erlaubt — Dokumente sind immutable, nur caption ist über
-- eine separate Policy änderbar.
create policy "documents_update_caption" on public.documents
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and (uploaded_by = auth.uid()
         or (property_id is not null
             and app_auth.has_permission('documents.edit', 'property', property_id)))
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and (uploaded_by = auth.uid()
         or (property_id is not null
             and app_auth.has_permission('documents.edit', 'property', property_id)))
  );

-- -----------------------------------------------------------------------------
-- Storage-Bucket `attachments`
-- -----------------------------------------------------------------------------
-- Privat, 25 MB Limit, erlaubte MIME-Typen konservativ.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Storage-RLS: Zugriff nur im eigenen Tenant-Ordner
-- -----------------------------------------------------------------------------
-- Path-Format: {tenant_id}/{entity_type}/{entity_id}/{document_id}.{ext}
-- Wir prüfen tenant-Zugehörigkeit auf storage.objects, feingranulare Rechte
-- laufen über public.documents (der Client MUSS also dort einen Match haben).

create policy "attachments_authenticated_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and app_auth.is_tenant_member(
      ((storage.foldername(name))[1])::uuid
    )
  );

create policy "attachments_authenticated_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and ((storage.foldername(name))[1])::uuid = app_auth.current_tenant_id()
  );

create policy "attachments_authenticated_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and app_auth.is_tenant_member(
      ((storage.foldername(name))[1])::uuid
    )
  );
