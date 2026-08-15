-- Sprint 77: Portal-Bewohner darf work_orders lesen, die aus seinen eigenen
-- defect_reports entstanden sind. Bisher: work_orders_select_assignee (nur
-- Mitarbeiter, denen der Auftrag zugewiesen ist) und work_orders_select_permitted
-- (tenant-member mit work_orders.view-Permission). Beide greifen fuer Bewohner
-- nicht (weder Assignee noch Tenant-Member).
--
-- Portal-Zweig: Bewohner sieht work_orders, deren id in einer defect_report
-- steht, die er selbst gemeldet hat (dr.converted_work_order_id = wo.id und
-- dr.reporter_user_id = auth.uid()). deleted_at bleibt gefiltert, damit
-- geloeschte Auftraege nicht auf einmal fuer Bewohner sichtbar werden.
--
-- Damit kann das Portal-Meldung-Detail den Auftrags-Code + geplante Termine
-- anzeigen. Wichtig: nur SELECT — Bewohner sollen work_orders nicht anlegen,
-- aendern oder loeschen koennen.

create policy "work_orders_select_resident_own_defect" on public.work_orders
  for select to authenticated
  using (
    deleted_at is null
    and app_auth.is_resident_of_tenant(tenant_id)
    and exists (
      select 1 from public.defect_reports dr
      where dr.converted_work_order_id = work_orders.id
        and dr.reporter_user_id = (select auth.uid())
    )
  );
