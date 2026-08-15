-- Sprint 55: Portal-Bewohner darf Documents zu seinen eigenen defect_reports lesen.
--
-- Bisher: documents_select_own (uploaded_by = auth.uid()) und
-- documents_select_permitted (is_tenant_member + documents.view-Permission)
-- greifen beide nicht fuer Bewohner (weder Uploader noch Tenant-Member).
--
-- Portal-Zweig: Bewohner sieht alle Documents (auch die von Staff angehaengten),
-- die an eine defect_report gebunden sind, deren reporter_user_id = auth.uid().
-- Damit werden Vorher/Nachher-Fotos, Belege etc., die die Hausverwaltung an
-- die Meldung anhaengt, im Bewohner-Portal sichtbar.
--
-- Storage-RLS: separate Policy attachments_resident_select, weil die
-- attachments_authenticated_select-Policy tenant-member-only ist. Der
-- tenant-match ueber storage.foldername(name)[1] reicht als Grob-Guard —
-- die per-file Sichtbarkeit filtert weiter documents_select_resident_own_defect.

create policy "documents_select_resident_own_defect" on public.documents
  for select to authenticated
  using (
    entity_type = 'defect_report'
    and app_auth.is_resident_of_tenant(tenant_id)
    and exists (
      select 1 from public.defect_reports dr
      where dr.id = documents.entity_id
        and dr.reporter_user_id = (select auth.uid())
    )
  );

create policy "attachments_resident_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and app_auth.is_resident_of_tenant(
      ((storage.foldername(name))[1])::uuid
    )
  );
