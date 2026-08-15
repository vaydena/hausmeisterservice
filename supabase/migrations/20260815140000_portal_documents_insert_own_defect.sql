-- Sprint 56: Portal-Bewohner darf Documents zu seinen eigenen defect_reports
-- hochladen. Sprint 55 hat den Read-Pfad geoeffnet, Sprint 56 den Write-Pfad.
--
-- documents.insert: entity_type='defect_report' und die zugehoerige defect_report
-- gehoert dem Bewohner (reporter_user_id = auth.uid()). uploaded_by muss auf
-- den Bewohner selbst zeigen — kein Impersonation-Risiko.
--
-- storage.objects.insert: erlaubt Insert im tenant-eigenen Ordner. Der
-- attachments_authenticated_insert-Zweig verlangt is_tenant_member — Bewohner
-- ist keiner. Neuer Portal-Zweig prueft is_resident_of_tenant. Feingranulare
-- Kontrolle ("Bewohner darf nur zu eigenen Meldungen hochladen") erzwingt die
-- documents.insert-Policy — wenn die kein Match liefert, hat der Blob im
-- Storage keinen documents-Datensatz und wird als Waise durch die Upload-
-- Action per remove() aufgeraeumt.
--
-- Kein Insert auf update-Pfad noetig (documents ist immutable, nur caption
-- ist ueber documents_update_caption anpassbar — Bewohner-Caption-Support
-- kaeme in einem separaten Sprint).

create policy "documents_insert_resident_own_defect" on public.documents
  for insert to authenticated
  with check (
    entity_type = 'defect_report'
    and app_auth.is_resident_of_tenant(tenant_id)
    and uploaded_by = (select auth.uid())
    and exists (
      select 1 from public.defect_reports dr
      where dr.id = documents.entity_id
        and dr.reporter_user_id = (select auth.uid())
    )
  );

create policy "attachments_resident_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and app_auth.is_resident_of_tenant(
      ((storage.foldername(name))[1])::uuid
    )
  );
