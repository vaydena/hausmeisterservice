-- Sprint 124 · Melde-Links: Maengel melden, ohne vorher jemand zu sein
--
-- Bisher braucht jede Maengelmeldung ein Konto. Bewohner haben eins (Portal),
-- Mitarbeiter haben eins. Eigentuemer, Vermieter und Hausverwaltungen haben
-- keins — und genau die sind es, die ein Objekt besitzen, aber nicht darin
-- wohnen. Ihr Weg war bisher: anrufen. Damit landet die Meldung in einem
-- Telefonat und nicht in der Software.
--
-- Ein Melde-Link ist ein Aufkleber-taugliches Stueck Papier: ein QR-Code, der
-- auf /melden/<token> zeigt. Wer ihn scannt, sieht das Objekt und ein
-- Formular. Kein Login, kein Konto, kein Passwort.
--
-- Warum ein Zufallstoken in der Datenbank und keine HMAC-Signatur:
--   1. Widerrufbar. Ein Aufkleber im oeffentlichen Treppenhaus ist per
--      Definition abfotografierbar. Wer ihn missbraucht, wird mit `active =
--      false` abgeschaltet — ein signiertes Token dagegen gilt, bis der
--      geheime Schluessel rotiert, und der haengt an ALLEN Objekten.
--   2. Kein neues ENV-Geheimnis. Ein HMAC-Key muesste vom Betreiber von Hand
--      im Hosting-Panel eingetragen werden. Es steht ohnehin schon ein
--      manueller Betreiber-Schritt offen; ein zweiter waere ein zweiter Weg,
--      auf dem die Funktion lautlos tot bleibt.
--
-- Der Token ist bewusst KEIN Geheimnis im kryptografischen Sinn — er haengt
-- an einer Hauswand. Er ist eine Adresse, keine Berechtigung: er erlaubt
-- ausschliesslich das Anlegen einer Meldung zu genau diesem Objekt. Lesen
-- kann ueber ihn niemand etwas.

-- ============================================================================
-- Tabelle
-- ============================================================================

create table if not exists public.property_report_links (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  property_id  uuid not null references public.properties(id) on delete cascade,
  building_id  uuid references public.buildings(id) on delete set null,
  token        text not null,
  label        text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null,
  revoked_at   timestamptz,
  revoked_by   uuid references auth.users(id) on delete set null,
  constraint property_report_links_token_key unique (token),
  constraint property_report_links_token_length_check
    check (char_length(token) between 22 and 64)
);

comment on table public.property_report_links is
  'Oeffentlich scannbare Melde-Einstiege pro Objekt (QR-Aufkleber). Der Token ist kein Geheimnis, sondern eine widerrufbare Adresse: er erlaubt ausschliesslich INSERT einer defect_report zu genau diesem Objekt, niemals Lesezugriff.';

comment on column public.property_report_links.active is
  'false = Aufkleber ist tot. Zeile bleibt stehen, damit nachvollziehbar bleibt, welcher Link welche Meldungen erzeugt hat (defect_reports.report_link_id).';

comment on column public.property_report_links.building_id is
  'Optional. Gesetzt, wenn der Aufkleber an einem bestimmten Gebaeude haengt — dann muss der Melder das Gebaeude nicht selbst benennen.';

create index if not exists property_report_links_tenant_id_idx
  on public.property_report_links (tenant_id);
create index if not exists property_report_links_property_id_idx
  on public.property_report_links (property_id);
create index if not exists property_report_links_building_id_idx
  on public.property_report_links (building_id);

drop trigger if exists property_report_links_set_updated_at on public.property_report_links;
create trigger property_report_links_set_updated_at
  before update on public.property_report_links
  for each row execute function app_auth.set_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
--
-- Kein `to anon`, keine Policy fuer anonyme Aufrufer: die oeffentliche
-- Meldestrecke liest den Token NICHT ueber PostgREST, sondern serverseitig
-- ueber den Service-Client (src/lib/report-links/resolve.ts). Waere die
-- Tabelle fuer anon lesbar, koennte jeder die Tokenliste aller Mandanten
-- abziehen und haette damit den Schluessel zu jedem Objekt der Plattform.
--
-- Wer einen Melde-Link anlegt, oeffnet einen Schreibpfad in die Datenbank,
-- der ohne Konto benutzbar ist. Das ist eine Entscheidung ueber das Objekt,
-- deshalb haengt sie an `properties.edit` und nicht an einem Meldungsrecht:
-- wer die Stammdaten eines Objekts nicht aendern darf, entscheidet auch
-- nicht darueber, was an dessen Hauswand klebt.

alter table public.property_report_links enable row level security;

drop policy if exists property_report_links_select on public.property_report_links;
create policy property_report_links_select on public.property_report_links
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('properties.view', 'property', property_id)
  );

drop policy if exists property_report_links_insert on public.property_report_links;
create policy property_report_links_insert on public.property_report_links
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('properties.edit', 'property', property_id)
  );

drop policy if exists property_report_links_update on public.property_report_links;
create policy property_report_links_update on public.property_report_links
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('properties.edit', 'property', property_id)
  )
  with check (
    tenant_id = app_auth.current_tenant_id()
    and app_auth.has_permission('properties.edit', 'property', property_id)
  );

-- Kein DELETE: ein geloeschter Link nimmt die Herkunft aller ueber ihn
-- eingegangenen Meldungen mit. Abschalten ist `active = false`.

-- ============================================================================
-- Herkunft an der Meldung
-- ============================================================================
--
-- Ohne diese Spalte ist eine ueber QR eingegangene Meldung von einer manuell
-- erfassten nicht zu unterscheiden. Mit ihr beantwortet die Meldungs-Detail-
-- seite die erste Rueckfrage der Disposition ("wo kam das her?") und die
-- Melde-Link-Verwaltung kann zeigen, welcher Aufkleber tatsaechlich benutzt
-- wird — und welcher nur Papier war.
--
-- `on delete set null` statt cascade: die Meldung ueberlebt ihren Aufkleber.
-- Loeschen kann den Link ohnehin niemand (siehe oben), aber die Regel muss
-- stimmen, falls das je jemand per Hand tut.

alter table public.defect_reports
  add column if not exists report_link_id uuid
    references public.property_report_links(id) on delete set null;

comment on column public.defect_reports.report_link_id is
  'Gesetzt, wenn die Meldung ueber einen oeffentlichen Melde-Link (QR) eingegangen ist. NULL = ueber Portal, App oder Personal erfasst.';

create index if not exists defect_reports_report_link_id_idx
  on public.defect_reports (report_link_id)
  where report_link_id is not null;
