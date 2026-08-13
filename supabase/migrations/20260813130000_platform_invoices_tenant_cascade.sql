-- Fix: platform.invoices.tenant_id war urspruenglich mit `on delete restrict`
-- angelegt (siehe 20260812081218_platform_layer_and_subscriptions.sql). Der
-- tenant-column-integrity-Test besteht zu Recht auf `on delete cascade`:
-- Tenants sind die Wurzel ihres Datenbaums, und `restrict` macht das Loeschen
-- praktisch unmoeglich, sobald der Tenant seine erste Plattform-Rechnung
-- akkumuliert hat. Die urspruengliche Migration wurde nachtraeglich auf
-- `cascade` korrigiert (damit frische DBs den Endzustand direkt bekommen);
-- diese Fixup-Migration bringt bereits deployte Prod-DBs auf denselben
-- Stand.
--
-- Wichtig fuer die Buchhaltung: DSGVO Art. 17 (Loeschung) darf keine
-- steuerlich relevante Rechnungsdokumente zerstoeren. Das wird nicht ueber
-- diesen FK abgebildet, sondern ueber den Ablauf "Tenant-Deletion" selbst
-- (siehe src/app/platform/tenants/actions.ts::deleteTenantAction): die
-- Rechnungs-PDFs liegen ausserhalb der DB im Storage und werden nicht
-- automatisch mit-kaskadiert; die Metadaten in platform.invoices verlieren
-- wir bewusst, wenn der Vertrag endet — die aufbewahrungspflichtige Form
-- ist das PDF.
--
-- Idempotent auf frischer DB: `drop constraint if exists` toleriert den
-- Fall, in dem die urspruengliche Migration bereits `cascade` deklariert
-- hatte (kein Constraint mit `restrict`-Semantik da), das anschliessende
-- ADD CONSTRAINT reproduziert nur die gewuenschte Endform.
alter table platform.invoices
  drop constraint if exists invoices_tenant_id_fkey;

alter table platform.invoices
  add constraint invoices_tenant_id_fkey
  foreign key (tenant_id)
  references public.tenants(id)
  on delete cascade;
