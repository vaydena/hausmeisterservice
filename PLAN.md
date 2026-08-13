# Implementierungsplan — Hausmeisterservice

Dieses Dokument fasst **Phase 1 (Analyse)** und **Phase 2 (Architektur & Datenmodell)** zusammen, wie in `MASTER_PROMPT.md` §47 verlangt.

Es dient als bindende Arbeitsgrundlage für alle folgenden Phasen. Änderungen am Datenmodell, an Modulen oder am Berechtigungskonzept werden hier gepflegt, nicht ad-hoc im Code.

Zugehörige Dokumente:
- `MASTER_PROMPT.md` — Produkt- und UX-Anforderungen (§1–§62)
- `PROJECT_SETUP.md` — Tech-Stack, Konventionen, Deployment

---

## PHASE 1 — ANALYSE

### 1.1 Ausgangslage

- Greenfield-Projekt, leerer Ordner. Kein bestehender Code, keine Migration nötig.
- Tech-Stack ist gesetzt (siehe `PROJECT_SETUP.md`): Next.js 15 App Router + TypeScript + Supabase + Tailwind/shadcn.
- Zielbetrieb: Hostinger Git-Auto-Deploy (analog vaydena.de).
- UI-Sprache Deutsch, Codesprache Englisch, `Europe/Berlin`, EUR, `DD.MM.YYYY`.

### 1.2 Produkt-Klassifizierung

Multi-Tenant-SaaS für Hausmeisterservices. Zielgruppe: kleine bis mittlere Hausmeisterbetriebe (5–200 Mitarbeiter, 10–500 Objekte pro Mandant). Kritische Betriebsart: mobile Feldnutzung + Büro-Verwaltung parallel.

### 1.3 Anforderungscluster

Die 62 Bereiche des MASTER_PROMPT lassen sich zu **11 fachlichen Domänen** bündeln:

| # | Domäne | MASTER_PROMPT §§ | Kritikalität |
|---|---|---|---|
| A | Identität & Zugriff (Auth, Tenants, User, Rollen, Rechte) | §3, §4, §33 | **hart** |
| B | Objektstruktur (Property → Building → Unit → Room) | §6 | **hart** |
| C | Personen (Employee, Resident, Owner, Hausverwaltung) | §4, §24, §25 | hoch |
| D | Aufträge & Workflow (WorkOrder, Task, Meldungen, Notfall) | §7, §8, §9, §41, §51 | **hart** |
| E | Wartung & Prüfung (Maintenance, Checklist, Automatismen) | §10, §11, §12, §39, §42 | hoch |
| F | Zeit & Einsatz (TimeEntry, Schedule, Shift, Route, GPS) | §14, §15, §16, §17 | hoch |
| G | Ressourcen (Key, Meter, Material, Vehicle, Inventory) | §18–§21 | mittel |
| H | Dokumente & Medien (Document, Photo, WorkReport) | §13, §22, §23 | mittel |
| I | Kommunikation & Benachrichtigung (Message, Notification, Announcement) | §10, §26, §27 | hoch |
| J | Finanzen & Reporting (Invoice, Cost, Reporting, Kalender, Suche) | §28, §29, §30, §31 | mittel |
| K | Plattform (Audit-Log, Admin-Settings, QR, Offline, Automations, i18n) | §32, §35, §38, §39, §40 | **hart** |

**„Hart"** heißt: die Domäne muss vor allen anderen stehen bzw. sie durchdringt alle anderen (Multi-Tenancy, Berechtigungen, Auftragskette).

### 1.4 Nicht-funktionale Anforderungen (hart)

- **Multi-Tenant-Isolation** via `tenant_id` + RLS auf jeder Tabelle. Es darf keine einzige Tabelle ohne RLS geben. (§3, §33)
- **Freikonfigurierbare Rollen**, keine Hardcoded-Rollen. Granulare Permissions pro Modul/Funktion/Objekt-Scope. (§4)
- **Modul-Schalter** — deaktivierte Module dürfen weder im Menü noch als leere Route sichtbar sein. (§2, §50)
- **Mobile-first + Offline-first** mit Konfliktbehandlung bei Sync. (§34, §35)
- **Dark Mode** überall, inkl. PDF-Vorschauen. (§37)
- **Audit-Log** für kritische Änderungen (User, Rollen, Aufträge, Rechnungen, Dokumente, Zeit). (§32)
- **DSGVO**: GPS opt-in mit Retention-Frist, EXIF-Stripping bei Uploads, per-Tenant-Storage, verständliche Fehlermeldungen ohne technische Details. (§33, §45)
- **Keine „Coming Soon"-Bereiche** — was im UI erscheint, funktioniert. (§50)

### 1.5 Kritische Datenflüsse (aus §-ABSCHLIESSENDE ANWEISUNG)

Die App muss diesen End-to-End-Fluss durchgängig darstellen können:

```
Bewohner meldet Mangel
 → Objekt automatisch erkannt (Bewohner ist einer Unit zugeordnet)
 → zuständige Mitarbeiter ermittelt (Property/Building-Zuständigkeit)
 → WorkOrder erzeugt (Status = Neu)
 → Mitarbeiter erhält Notification (Push + In-App)
 → Mitarbeiter startet Fahrt (optional GPS)
 → Arbeitszeit wird gestartet (TimeEntry offen)
 → Checkliste wird abgearbeitet (ChecklistInstance)
 → Fotos aufgenommen (vorher/nachher)
 → Material entnommen (MaterialTransaction ↔ WorkOrder)
 → WorkReport erstellt (mit Unterschrift)
 → WorkOrder abgeschlossen (Status = Erledigt)
 → Bewohner wird informiert (Notification + Portal-Status)
 → Eigentümer sieht den Vorgang im Eigentümerportal
 → Kosten dem Objekt zugeordnet (Cost)
 → Vorgang erscheint im Reporting
```

Jede der 15 Stationen muss durch das Datenmodell und die Berechtigungen abgedeckt sein.

### 1.6 Risiken und Design-Herausforderungen

| Risiko | Auswirkung | Gegenmaßnahme |
|---|---|---|
| RLS-Löcher durch fehlende Policies auf neuen Tabellen | Datenleck zwischen Tenants | RLS ist Migrations-Pflicht; CI-Check verifiziert alle Tabellen haben `tenant_id` + Policies |
| Konfigurierbare Rollen führen zu Permission-Explosion | UI unübersichtlich, Bugs | Zwei-Stufen: (1) globale Permission-Registry, (2) Rolle bündelt Permissions; Objekt-Scopes sind Assignment-Attribut, nicht eigene Permission |
| Offline-Sync-Konflikte bei parallel bearbeitetem WorkOrder | Datenverlust, Frust | Server-authoritativ mit Client-Versionsnummern; Konflikt-UI zeigt beide Stände; nur additive Aktionen (Fotos, Kommentare, TimeEntries) sind konfliktfrei |
| Multi-Property-Zuständigkeit + GPS + große Datenmengen | Performance auf Mobile | Sichten pro Rolle statt Vollzugriff auf alle Tabellen; Pagination Pflicht; keine `SELECT *` |
| Notification-Storm bei Automatisierungen | User schaltet Push ab | Notification-Präferenzen pro User + Rate Limiting pro Empfänger + Batching-Fenster |
| Dokumente/Fotos in Storage ohne EXIF-Stripping | GPS/PII-Leak | Edge-Function beim Upload strippt EXIF; Storage-Policy verweigert Zugriff ohne RLS-Match |
| „Was im UI ist, funktioniert" vs. 62 Anforderungen | Scope-Overload | Modul-Schalter default *aus* außer Kern; Module werden phasenweise scharfgeschaltet, Rest bleibt versteckt statt halbfertig sichtbar |

---

## PHASE 2 — ARCHITEKTUR & DATENMODELL

### 2.1 Ordnerstruktur (Next.js App Router)

```
hausmeisterservice/
├── src/
│   ├── app/
│   │   ├── (auth)/               login, register, reset-password, invite
│   │   ├── (app)/                Haupt-App (Sidebar + Layout)
│   │   │   ├── dashboard/
│   │   │   ├── work-orders/
│   │   │   ├── properties/
│   │   │   ├── people/           employees, residents, owners
│   │   │   ├── maintenance/
│   │   │   ├── checklists/
│   │   │   ├── time/
│   │   │   ├── schedule/
│   │   │   ├── tours/
│   │   │   ├── map/
│   │   │   ├── keys/
│   │   │   ├── meters/
│   │   │   ├── materials/
│   │   │   ├── vehicles/
│   │   │   ├── documents/
│   │   │   ├── messages/
│   │   │   ├── billing/
│   │   │   ├── reports/
│   │   │   └── settings/          tenant, modules, roles, users, automations
│   │   ├── (portal-resident)/    Bewohnerportal, eigenes Layout
│   │   ├── (portal-owner)/       Eigentümerportal, eigenes Layout
│   │   └── api/                  Route Handler für Webhooks, Cron, PDF, Push
│   ├── components/
│   │   ├── ui/                   shadcn primitives
│   │   ├── layout/               sidebar, mobile-nav, header
│   │   ├── forms/                wiederverwendbare Formulare
│   │   ├── data/                 tables, filters, empty-states
│   │   ├── maps/                 MapLibre-Wrapper
│   │   └── domain/               work-order-card, property-tree, etc.
│   ├── lib/
│   │   ├── supabase/             browser-, server-, service-client
│   │   ├── auth/                 session helpers, guards
│   │   ├── permissions/          permission registry + resolver
│   │   ├── modules/              module registry + guards
│   │   ├── i18n/                 de-DE (default), Struktur i18n-fähig
│   │   ├── offline/              sync engine, conflict handler, idb wrapper
│   │   ├── notifications/        channel dispatcher, VAPID push
│   │   ├── automations/          rule engine + scheduler adapter
│   │   ├── pdf/                  @react-pdf/renderer templates
│   │   ├── audit/                audit-log service
│   │   └── validation/           zod schemas, shared
│   ├── server/
│   │   ├── actions/              Server Actions pro Domäne
│   │   ├── services/             Business-Logik (permission-checked)
│   │   └── jobs/                 wiederkehrende Jobs, Edge-Function-Handler
│   ├── styles/                   globals.css, tokens
│   └── types/                    generated (supabase), shared
├── supabase/
│   ├── migrations/               *.sql, chronologisch
│   ├── functions/                Edge Functions (exif-strip, push-dispatch, …)
│   └── seed/                     Demo-Daten
├── public/                       Icons, PWA-Manifest, VAPID public key
├── tests/                        Vitest + Playwright
└── docs/                         Architektur, API, Runbooks
```

### 2.2 Datenmodell — Kernentitäten

Alle Tabellen haben:
- `id uuid primary key default gen_random_uuid()`
- `tenant_id uuid not null references tenants(id) on delete cascade` (außer `tenants`, `platform_users`)
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `created_by uuid references users(id)`
- Trigger `updated_at` + Trigger für Audit-Log auf sensible Tabellen

Namenskonvention: `snake_case`, Plural.

#### 2.2.1 Identität & Multi-Tenancy

- `tenants` — id, name, slug, logo_url, address, invoice_data, timezone, currency, locale, status
- `tenant_modules` — tenant_id, module_key, enabled, config (jsonb) — steuert §2
- `users` — Supabase-`auth.users`-Spiegel mit Profil (display_name, avatar, phone, locale, notification_prefs)
- `memberships` — user_id, tenant_id, status (active/invited/suspended), is_owner
- `roles` — tenant_id, key, name, description, is_system (bool)
- `permissions` — globale Registry (kein tenant_id), key (z.B. `work_orders.create`), module_key, description
- `role_permissions` — role_id, permission_key
- `user_roles` — user_id, role_id, scope_type (null | property | building), scope_id (nullable) — §4 Objekt-/Standort-Rechte via Scope
- `user_groups` — tenant_id, name (optional Layer über Rollen, §4)
- `user_group_members` — user_group_id, user_id

#### 2.2.2 Objektstruktur (§6)

- `properties` — Liegenschaft: id, tenant_id, name, code, address, gps_lat/lng, property_type, owner_id, hausverwaltung_id, notes, access_notes, emergency_notes
- `buildings` — property_id, name, code, year_built, floor_count
- `entrances` — building_id, name, gps_lat/lng
- `floors` — building_id, level (int), label
- `units` — building_id, entrance_id (nullable), floor_id (nullable), unit_no, unit_type, area_m2, room_count, status
- `rooms` — unit_id, name (optional feingranular)
- `assets` — technische Anlage; tenant_id, parent_type (property/building/unit/room), parent_id, name, category, manufacturer, model, serial_no, install_date, warranty_until, qr_code

#### 2.2.3 Personen

- `employees` — user_id, tenant_id, employment_status, hire_date, hourly_rate, skills (jsonb), primary_vehicle_id
- `owners` — tenant_id, name, contact_data, is_person (bool)
- `property_managers` — Hausverwaltungen; tenant_id, name, contact_data
- `residents` — tenant_id, user_id (nullable, falls Portal-Zugang), unit_id, name, contact_data, move_in, move_out
- `contact_persons` — polymorph: parent_type, parent_id, name, role, phone, email

#### 2.2.4 Aufträge & Meldungen (§7–§9, §41)

- `work_orders` — tenant_id, code, title, description, category, priority, status, property_id, building_id (nullable), unit_id (nullable), reporter_type (employee/resident/owner/system), reporter_id, assignee_id (nullable), team_id (nullable), planned_start, planned_end, deadline, estimated_minutes, actual_minutes, is_emergency (§41), source_defect_report_id
- `work_order_tasks` — WorkOrder-Unteraufgaben (§8): work_order_id, title, done, order_no
- `work_order_status_history` — work_order_id, from_status, to_status, changed_by, changed_at, note
- `defect_reports` — Meldungen (§9): tenant_id, reporter_id, unit_id, category, title, description, priority_wish, reachability, preferred_time, status, converted_work_order_id
- `announcements` — Ankündigungen (§10): tenant_id, title, body, property_id, building_id (nullable), affected_units (uuid[] nullable), start_at, end_at, contact_person_id, channels (jsonb), sent_at

#### 2.2.5 Wartung, Checklisten, Berichte

- `maintenance_plans` (§11) — tenant_id, name, asset_id (nullable) / property_id, category, interval (cron-like), next_due, last_done, lead_days, assignee_id (nullable)
- `maintenance_instances` — plan_id, due_date, work_order_id (nullable, wird bei Fälligkeit erzeugt), status
- `checklist_templates` (§12) — tenant_id, name, category, items (jsonb: type, label, required, options)
- `checklist_instances` — template_id, work_order_id (nullable), maintenance_instance_id (nullable), completed_at, completed_by, answers (jsonb)
- `work_reports` (§13) — work_order_id, employee_id, start_at, end_at, description, material_summary, remarks, signature_url, pdf_url

#### 2.2.6 Zeit, Planung, GPS

- `time_entries` (§14) — tenant_id, employee_id, work_order_id (nullable), start_at, end_at (nullable = laufend), type (arbeit/pause/fahrt/dienstgang), source (manual/timer/geofence), notes
- `time_corrections` — time_entry_id, requested_change, reason, status, approver_id
- `schedules` (§15) — tenant_id, employee_id, date, shift_id (nullable), start_at, end_at, work_order_id (nullable), notes
- `shifts` — tenant_id, name, start_time, end_time, color
- `absences` — employee_id, type (urlaub/krank/frei), start_date, end_date, status
- `tours` (§16) — tenant_id, employee_id, date, name, optimization_status
- `tour_stops` — tour_id, order_no, property_id, planned_arrival, actual_arrival (nullable), status
- `gps_logs` (§17) — tenant_id, employee_id, recorded_at, lat, lng, accuracy_m, source (checkin/checkout/track), work_order_id (nullable), retention_until

#### 2.2.7 Ressourcen

- `keys` (§18) — tenant_id, code, property_id, building_id (nullable), unit_id (nullable), lock_system, status (im_kasten/ausgegeben/…), qr_code
- `key_transactions` — key_id, employee_id, action (issued/returned/lost), at, note
- `meters` (§19) — tenant_id, meter_no, property_id, building_id (nullable), unit_id (nullable), meter_type, unit_of_measure, location_note
- `meter_readings` — meter_id, reading, read_at, read_by, photo_url
- `materials` (§20) — tenant_id, sku, name, category, unit, price_cents, supplier_id
- `inventory` — material_id, storage_location_id, quantity, min_quantity
- `storage_locations` — tenant_id, name, address (nullable)
- `material_transactions` — material_id, storage_location_id, work_order_id (nullable), quantity, direction (in/out), at, employee_id
- `vehicles` (§21) — tenant_id, plate, type, driver_id (nullable), km, tuev_due, inspection_due, insurance_due
- `vehicle_maintenances` — vehicle_id, type, done_at, next_due, cost_cents, notes
- `vehicle_trips` — vehicle_id, driver_id, start_at, end_at, km_start, km_end, purpose, work_order_id (nullable)

#### 2.2.8 Dokumente & Medien

- `documents` (§22) — tenant_id, parent_type (property/building/unit/work_order/employee/…), parent_id, category, name, storage_path, size_bytes, mime, version, previous_version_id
- `photos` (§23) — tenant_id, parent_type, parent_id, storage_path, taken_at, taken_by, gps_lat/lng (nullable, nach EXIF-Strip), work_order_id (nullable), phase (before/after/damage/doku)

#### 2.2.9 Kommunikation & Benachrichtigung

- `message_threads` (§26) — tenant_id, subject, parent_type (nullable, z.B. work_order), parent_id (nullable), created_by
- `message_thread_members` — thread_id, user_id, last_read_at
- `messages` — thread_id, sender_id, body, attachments (jsonb), sent_at
- `notifications` (§27) — tenant_id, recipient_id, kind, title, body, link, read_at, sent_via (jsonb: inapp/push/email)
- `notification_preferences` — user_id, kind, channels (inapp/push/email/sms — Bool je)
- `push_subscriptions` — user_id, endpoint, keys (jsonb) für Web Push (VAPID)

#### 2.2.10 Finanzen & Reporting

- `costs` (§28) — tenant_id, work_order_id (nullable), property_id (nullable), category (arbeitszeit/material/fahrt/fremd/pauschale), amount_cents, at, description
- `invoices` (§28) — tenant_id, number, recipient_type (owner/property_manager), recipient_id, issue_date, due_date, status, total_net_cents, total_gross_cents, pdf_url
- `invoice_items` — invoice_id, description, quantity, unit_price_cents, cost_id (nullable)
- `saved_filters` (§52) — user_id, entity, name, params (jsonb)

#### 2.2.11 Plattform-Querschnitt

- `audit_logs` (§32) — tenant_id, user_id, action, entity, entity_id, before (jsonb), after (jsonb), at, ip
- `automation_rules` (§39) — tenant_id, name, trigger (jsonb), condition (jsonb), actions (jsonb), enabled
- `automation_runs` — rule_id, triggered_at, status, log
- `qr_codes` (§40) — tenant_id, code, target_type, target_id
- `sync_conflicts` (§35) — tenant_id, user_id, entity, entity_id, local (jsonb), server (jsonb), resolved_at, resolution

### 2.3 Modul-Registry (§2)

Statisch im Code definiert (`src/lib/modules/registry.ts`), pro Tenant in `tenant_modules` an/aus.

| Module Key | Kern (immer an) | Standard-Menüpfad |
|---|---|---|
| `core.auth` | ✔ | — |
| `core.tenants` | ✔ | `/settings/tenant` |
| `core.users_roles` | ✔ | `/settings/users` |
| `core.dashboard` | ✔ | `/dashboard` |
| `properties` | ✔ | `/properties` |
| `employees` | ✔ | `/people/employees` |
| `work_orders` | ✔ | `/work-orders` |
| `defect_reports` | | `/work-orders?tab=reports` |
| `residents` | | `/people/residents` |
| `owners` | | `/people/owners` |
| `resident_portal` | | Portal-Route |
| `owner_portal` | | Portal-Route |
| `maintenance` | | `/maintenance` |
| `checklists` | | `/checklists` |
| `work_reports` | | `/work-orders/*/report` |
| `documents` | | `/documents` |
| `photos` | | eingebettet |
| `time_tracking` | | `/time` |
| `scheduling` | | `/schedule` |
| `shifts` | | `/schedule?view=shifts` |
| `tours` | | `/tours` |
| `gps` | | `/map` |
| `keys` | | `/keys` |
| `meters` | | `/meters` |
| `materials` | | `/materials` |
| `vehicles` | | `/vehicles` |
| `messaging` | | `/messages` |
| `notifications` | ✔ | Header-Glocke |
| `announcements` | | `/announcements` |
| `billing` | | `/billing` |
| `reporting` | | `/reports` |
| `automations` | | `/settings/automations` |
| `qr_codes` | | eingebettet |
| `audit_log` | ✔ | `/settings/audit` |

Guards:
- Server: `assertModuleEnabled(module_key)` in Server Actions
- Client: `useModule(module_key)` hided Menüpunkte
- Router: Middleware wirft 404 (nicht 403), wenn ein Modul aus ist — Bewohner sollen nicht wissen, welche Module es gibt

### 2.4 Berechtigungssystem (§4)

**Zwei-Ebenen-Ansatz:**

1. **Permission-Registry** (global, code-definiert):
   - Format: `<module>.<action>` — z. B. `work_orders.create`, `work_orders.assign`, `work_orders.close`, `residents.delete`, `invoices.approve`, `gps.view_others`, `roles.manage`.
   - Aufgeteilt nach Modulen aus 2.3; Actions folgen einem festen Verb-Set (`view`, `create`, `edit`, `delete`, `assign`, `close`, `approve`, `download`, `manage`).

2. **Rollen** (pro Tenant, konfigurierbar):
   - System-Rollen als Startvorlagen (§4): `superadmin`, `admin`, `objektleiter`, `disponent`, `hausmeister`, `technik`, `reinigung`, `winterdienst`, `gaertner`, `fahrer`, `buchhaltung`, `eigentuemer`, `hausverwaltung`, `bewohner`, `externer_dienstleister`.
   - Diese sind editierbar außer `superadmin`.
   - Admin kann eigene Rollen anlegen und beliebige Permissions ankreuzen.

3. **Scopes** (Objekt-/Standort-Rechte, §4):
   - Ein `user_roles`-Eintrag kann eine Rolle mandantenweit vergeben (`scope_type=null`) oder auf eine `property`/`building` beschränken.
   - Permission-Check zieht immer Scope hinzu: „Hausmeister für Property X" darf `work_orders.edit` **nur** auf WorkOrders lesen/schreiben, deren `property_id` in seinen Scopes liegt.
   - Objekt-Zugriff wird zusätzlich über RLS erzwungen — Client-Logik ist kein Sicherheits-Layer.

**Permission-Resolver** (`src/lib/permissions/`): berechnet die effektive Permission-Menge eines Users im aktuellen Tenant + Kontextentität. Wird sowohl in Server Actions als auch in UI-Guards genutzt (die UI-Version läuft gegen die vom Server gelieferte Permission-Snapshot, nicht gegen Roh-Datenbank).

### 2.5 Row Level Security — Grundprinzip

Für jede Tabelle:

```sql
alter table <t> enable row level security;

-- Lese-Zugriff: gleiche tenant_id + gültige Membership + Permission-Match
create policy <t>_select on <t> for select
  using (
    tenant_id = auth_tenant_id()
    and has_permission('<module>.view', row_scope_ref(...))
  );

-- Analog: insert / update / delete
```

Helferfunktionen (SECURITY DEFINER, im Schema `app_auth`):
- `auth_tenant_id()` — aktueller Tenant aus JWT/Session-Kontext
- `has_permission(perm_key text, scope jsonb)` — konsultiert `user_roles` + `role_permissions` + Scopes
- `is_tenant_member()` — Basiskontrolle

Test-Regel: Für jede neue Tabelle gehört zur Migration **auch** ein Set RLS-Tests (Playwright oder pgTAP). Ohne grüne RLS-Tests kein Merge.

### 2.6 Navigation (§53)

**Desktop:** Sidebar links (kollabierbar), Header oben (Suche, Notifications-Glocke, Tenant-Switcher, Avatar).

Sidebar-Gruppen (nur sichtbar, wenn mindestens ein Item erlaubt):
- Übersicht — Dashboard, Kalender, Suche
- Aufgaben — Aufträge, Meldungen, Wartungen, Checklisten
- Objekte — Objekte, Räume, Anlagen, Schlüssel, Zähler
- Personen — Mitarbeiter, Bewohner, Eigentümer, Hausverwaltungen
- Einsatz — Zeiterfassung, Planung, Schichten, Touren, Karte
- Ressourcen — Material, Fahrzeuge, Dokumente
- Kommunikation — Nachrichten, Ankündigungen, Benachrichtigungen
- Finanzen — Abrechnung, Reporting
- Einstellungen — Tenant, Module, Rollen & Rechte, Automatisierungen, Audit-Log

**Mobile:** Bottom-Nav mit 5 Slots (Home, Aufgaben, +Neu, Zeit, Mehr). „+Neu" öffnet Quick-Action-Sheet (§51). Andere Bereiche via „Mehr"-Drawer.

**Portale:** Eigene, drastisch reduzierte Layouts. Bewohnerportal (§54) und Eigentümerportal (§25) sind separate Route-Groups mit anderer Sidebar.

### 2.7 Datenfluss-Architektur

- **Reads:** Server Components lesen via Supabase Server Client (RLS greift). Für Listen mit Filtern zusätzlich TanStack Query im Client für Optimistic Updates / Refetch.
- **Writes:** Server Actions ausschließlich. Jede Action:
  1. Session prüfen
  2. Modul-Enabled prüfen
  3. Permission + Scope prüfen
  4. Zod-Validation
  5. Service-Layer aufrufen (Business-Logik)
  6. Audit-Log-Eintrag schreiben
  7. Notification/Automation triggern
  8. Response mit next Client-Cache-Invalidation
- **Realtime:** Supabase Realtime nur für ausgewählte Kanäle: `notifications`, `messages`, `time_entries` (Status), `work_orders` (Statuswechsel für Dispatcher-Sicht).
- **Offline (§35):** Service Worker + IndexedDB. Offline-fähige Entitäten: `work_orders` (read), `checklist_instances` (write), `photos` (write, queue), `time_entries` (write, queue), `work_reports` (write). Sync-Engine läuft bei Wiederherstellung der Verbindung, schreibt sequenziell, öffnet `sync_conflicts`-Datensatz wenn Server einen Konflikt meldet.

### 2.8 Sicherheitskonzept (§33)

- Auth via Supabase Auth (E-Mail + Passwort; später optional OAuth). Passwörter niemals im App-Code.
- Sessions als sichere HttpOnly-Cookies (SameSite=Lax), CSRF via Server-Action-Origin-Check.
- Service-Role-Key nur in Server-only-Umgebungen; niemals in Client-Bundle. Eslint-Regel gegen Import.
- Rate Limiting via Next.js Middleware + Upstash (falls verfügbar) — sensitive Endpoints: `/api/auth/*`, Defect-Report-Submit, Foto-Upload, Message-Send.
- Content Security Policy: strict, `default-src 'self'`, `img-src 'self' data: https://<supabase-storage>`, kein `unsafe-inline`.
- Storage: pro Tenant ein Ordner-Präfix; RLS-Policy erzwingt `tenant_id`-Match. Uploads werden Edge-Function-vermittelt (EXIF-Strip, MIME-Check, Größe).
- GPS-Retention: `gps_logs.retention_until = now() + 90 days`; nightly Job löscht Rohdaten, aggregiert vorher zu Kilometer/Tag.
- Audit-Log: DB-Trigger auf `work_orders`, `invoices`, `roles`, `role_permissions`, `user_roles`, `documents` (delete), `residents`, `keys`. Payload: `before`/`after` als jsonb.
- Backup: Supabase Point-in-Time Recovery aktivieren (Setting im Dashboard, dokumentiert im Runbook).
- DSGVO: Data-Export je User (`/settings/privacy/export`), Löschanfrage-Workflow (Soft-Delete + Anonymisierung).

### 2.9 Fehlerbehandlung (§45)

- Server Actions werfen typisierte `AppError` (`code`, `userMessage`, `internalMessage`, `httpLike`).
- UI zeigt nur `userMessage` (deutsch, freundlich); `internalMessage` geht nur ins Log.
- Sentry oder Supabase-Logs für Server-Fehler; Client-Fehler ins gleiche Sink über Edge-Function.
- Kein `throw new Error("500…")` in Richtung User.

### 2.10 Tests (§48)

- **Unit (Vitest):** Permission-Resolver, Automations-Engine, Sync-Engine, Rechnungs-Kalkulation, Wartungs-Fälligkeitsberechnung.
- **DB (pgTAP oder SQL-Tests via Node):** RLS-Policies pro Tabelle (mind. 3 Fälle: eigener Tenant, fremder Tenant, ohne Permission).
- **E2E (Playwright):** Login/Logout, Auftrags-End-to-End (Melden → Zuweisen → Abschließen), Mängelmeldung durch Bewohner, Zeit-Start/Stopp, Mandantentrennung (Login als Tenant A, kein Zugriff auf Tenant-B-Daten).
- **Visual/Mobile:** Playwright mobile Emulation für Bottom-Nav, Quick-Actions, Kamera-Trigger.
- **Dark-Mode-Regression:** Storybook + Chromatic optional, andernfalls Playwright-Screenshots.

### 2.11 Deployment- und Migrations-Regeln

- Jede Schema-Änderung: neue Datei in `supabase/migrations/YYYYMMDDHHMMSS_<slug>.sql`. Kein Studio-Direct-Edit auf `prod`.
- CI-Pipeline: install → typecheck → lint → build → unit-tests → migration-dry-run → E2E gegen preview.
- Hostinger Git-Deploy zieht `main`; `staging`-Branch für Vorabtests (falls Environment vorhanden).
- Env-Variablen dokumentiert in `.env.example`; live-Secrets in Hostinger + Supabase Dashboard.

### 2.12 Startdaten (§49)

Seed „Muster Objektservice GmbH" mit:
- 1 Tenant, 5 Mitarbeiter (verschiedene Rollen), 12 Bewohner, 3 Eigentümer, 1 Hausverwaltung
- 3 Properties mit je 1–3 Gebäuden und 6–20 Units
- 8 offene Work-Orders unterschiedlicher Status/Prioritäten, 4 aktive Wartungspläne
- 3 Fahrzeuge, 40 Materialien, 25 Schlüssel, 60 Zähler
- 20 Dokumente, 30 Fotos, 15 Nachrichten
- Realistische Zeiterfassung der letzten 30 Tage

Seed läuft nur, wenn Tenant leer ist; produziert deterministische UUIDs pro Umgebung.

---

## PHASE 3 — VORBEREITUNG

Diese Phase startet **nicht** bevor drei Punkte mit dem Nutzer geklärt sind (siehe unten). Reihenfolge in Phase 3:

1. Repo initialisieren (Next.js + TS + Tailwind + shadcn) und Basiskonfiguration
2. Supabase-Projekt anlegen, Env-Verbindung, Basis-Migration (Extensions, `app_auth`-Helper, `tenants`, `users`, `memberships`, `roles`, `permissions`, `role_permissions`, `user_roles`, `tenant_modules`)
3. Permission-Registry (Code) + System-Rollen-Seed
4. Auth-Flows (Login, Logout, Passwort-Reset, Invite)
5. App-Shell (Sidebar, Mobile-Nav, Tenant-Switcher, Header)
6. Dashboard-Skeleton pro Rolle (Admin, Mitarbeiter, Bewohner, Eigentümer)
7. Objekte-Modul (Properties/Buildings/Units-Editor + Baum-Ansicht)
8. Mitarbeiter-Modul (Einladung, Zuweisung von Rollen/Scopes)
9. WorkOrders-Modul (Liste, Detail, Statuswechsel, Zuweisung, Kommentare, Fotos)
10. Audit-Log-Grundgerüst + Notifications-Grundgerüst (nur In-App)
11. Demo-Seed
12. Playwright-Grundtests

Ende von Phase 3 = ein Admin kann Tenant einrichten, Rollen konfigurieren, Objekte anlegen, Mitarbeiter einladen und Aufträge erstellen/zuweisen/abschließen.

---

## OFFENE PUNKTE — vor Phase 3 klären

1. **Demo-Tenant-Name & Branding** — Vorschlag: „Muster Objektservice GmbH", einfaches Farbschema (Primär: Slate/Blue). Kann später ersetzt werden.
2. **Hostinger-Paket** — nutzen wir den bestehenden Account (wo auch vaydena läuft) oder ein neues Paket? Entscheidet Ressourcen-Isolation und Domain-Verwaltung.
3. **Zieldomain** — z.B. `hausmeisterservice.de`, Sub-Domain oder erst später? Beeinflusst Auth-Callback-URLs und Cookie-Domain früh im Setup.

Diese drei Antworten reichen, um Phase 3 zu starten. Alles Weitere (Farbfeinschliff, Logo, konkrete Rollen-Presets) wird während Phase 3 iteriert.
