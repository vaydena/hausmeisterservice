-- ============================================================================
-- Eigentümerportal — Mängel-Sicht auf owner/management-Meldungen einengen (DSGVO)
-- ============================================================================
-- Nachtrag zu 20260817130000_owner_portal.sql.
--
-- BEFUND: defect_reports_select_owner war OBJEKT-scoped — der Eigentümer sah
-- JEDE Meldung an seinen Objekten, auch die von BEWOHNERN (reporter_kind
-- 'resident') und anonyme Meldungen. Die Detailseite /owner/maengel/[id] zeigt
-- "Gemeldet von: Bewohner (<Name>)" samt voller Beschreibung — dadurch gelangten
-- Bewohner-Klarnamen und wohnungsinterne Angaben an den Eigentümer. Das
-- widerspricht der Portal-Zusage ("von Ihnen oder Ihrer Hausverwaltung
-- gemeldet") und ist datenschutzrechtlich (DSGVO) heikel.
--
-- KORREKTUR eines falschen Kommentars in 130000 ("eigene Meldungen sieht der
-- Eigentümer ohnehin schon über defect_reports_select_permitted"): Sowohl
-- defect_reports_select_own als auch _select_permitted verlangen
-- is_tenant_member(tenant_id) — ein reiner Portal-Eigentümer ist KEIN
-- Tenant-Mitglied. defect_reports_select_owner ist damit die EINZIGE Policy, die
-- einem Eigentümer überhaupt Meldungen zeigt. Ein Einengen auf nur die eigenen
-- (reporter_user_id) würde daher auch Mitarbeiter-Meldungen ausblenden.
--
-- FIX: Sicht auf reporter_kind in ('owner','staff') einengen — nur Eigentümer-
-- und Hausverwaltungs-/Mitarbeiter-Meldungen. Bewohner- und anonyme Meldungen
-- bleiben dem Eigentümer verborgen. Die Objekt-Zugehörigkeit
-- (is_property_owner_of_tenant + property_owner_owns_property) und die additive
-- Strategie bleiben unverändert. Idempotent per drop-if-exists.
-- ============================================================================

drop policy if exists defect_reports_select_owner on public.defect_reports;

create policy defect_reports_select_owner on public.defect_reports
  for select to authenticated
  using (
    app_auth.is_property_owner_of_tenant(tenant_id)
    and app_auth.property_owner_owns_property(property_id)
    and reporter_kind in ('owner', 'staff')
  );
