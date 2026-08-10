# Hausmeister App

Multi-Tenant-SaaS für Hausmeisterservice- und Objektmanagement.

Tech-Stack: Next.js 16 (App Router) + TypeScript + Supabase + Tailwind CSS 4 + shadcn/ui + TanStack Query + MapLibre + Playwright.

## Dokumente in dieser Reihenfolge lesen

1. `MASTER_PROMPT.md` — 62 Produkt- und UX-Anforderungen (bindend).
2. `PROJECT_SETUP.md` — Tech-Stack, Konventionen, Sicherheits-/DSGVO-Leitplanken, Deployment.
3. `PLAN.md` — Phase 1 (Analyse) + Phase 2 (Architektur, Datenmodell, RLS, Module, Permissions). **Bindende Arbeitsgrundlage.**

Wer neu einsteigt, liest diese drei Dokumente vollständig, bevor Code angefasst wird. Änderungen am Datenmodell oder Berechtigungssystem gehen in `PLAN.md`, nicht in Ad-hoc-Commits.

## Was bereits liegt

- Vollständige Basis-Konfiguration (`package.json`, `tsconfig.json`, `next.config.mjs`, Tailwind 4, PostCSS, `.gitignore`, `.env.example`, `.nvmrc`)
- App-Skeleton (`src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx` mit Redirect auf `/dashboard`)
- Supabase-Clients (`src/lib/supabase/{browser,server,service}.ts`) für die drei Kontexte
- Env-Validator (`src/lib/env.ts`) mit zod
- Modul-Registry (`src/lib/modules/registry.ts`) mit allen 30+ Modulen
- Permission-Registry (`src/lib/permissions/registry.ts`) mit allen Permissions + System-Rollen-Templates
- Basis-Migration (`supabase/migrations/20260801000000_init.sql`): `app_auth`-Helper, `tenants`, `tenant_modules`, `users`, `memberships`, `roles`, `permissions`, `role_permissions`, `user_roles`, `user_groups`, `user_group_members`, RLS-Policies

## Nächste Schritte (Phase 3 fortsetzen)

### 3.a Repo lauffähig machen

```bash
pnpm install
```

`.env.local` aus `.env.example` erstellen, sobald das Supabase-Projekt existiert.

### 3.b Supabase-Projekt anlegen

Neues, eigenständiges Projekt in Region **Frankfurt** (nicht mit vaydena teilen). Per Supabase MCP oder Dashboard:

- Projekt-Name: `hausmeister-app` (oder analog)
- Region: `eu-central-1`
- Postgres-Passwort sicher ablegen

Anschließend lokal verlinken und Migration ausführen:

```bash
pnpm supabase login
pnpm supabase link --project-ref <ref>
pnpm supabase db push
```

Danach TypeScript-Types generieren:

```bash
pnpm db:types
```

### 3.c Permission-Registry in die DB syncen

Ein Sync-Skript schreibt alle Einträge aus `src/lib/permissions/registry.ts` in `public.permissions` (idempotent, upsert). Datei: `supabase/seed/permissions.ts`. Läuft auch in CI vor `db push` in prod.

### 3.d Auth-Flows

`(auth)/login`, `(auth)/reset-password`, `(auth)/invite/[token]`. Server Actions rufen Supabase Auth; nach Login setzt eine Server-Aktion den Tenant-Claim (`app_tenant_id` im JWT), damit `app_auth.current_tenant_id()` greift.

### 3.e App-Shell

Sidebar + Mobile-Bottom-Nav gemäß `PLAN.md` §2.6. Menüpunkte werden dynamisch aus der Modul-Registry + `tenant_modules` gerendert. Deaktivierte Module = kein Menüpunkt, Route liefert 404.

### 3.f Dashboards

Rollenspezifisch: Admin (KPIs, §56), Mitarbeiter (§55), Bewohner (§54), Eigentümer (§25). Erst Skeletons mit echten Daten-Slots, keine Fake-Zahlen.

### 3.g Objekte + Mitarbeiter + Aufträge

Migrationen `20260801100000_objects.sql`, `20260801110000_people.sql`, `20260801120000_work_orders.sql` in der Reihenfolge. Jeweils inkl. RLS + Server Actions + UI.

### 3.h Audit-Log + In-App-Notifications (Grundgerüst)

Migration + Trigger + einfacher Notification-Feed.

### 3.i Demo-Seed

`supabase/seed/run.ts` erzeugt „Hausmeisterservice" mit realistischen Daten (siehe `PLAN.md` §2.12).

### 3.j Tests

Vitest für Unit-/Contract-Tests (schnell, ohne Server). Playwright für Login,
Auftrags-End-to-End, Mandantentrennung.

**Vitest ausführen:**

```bash
pnpm test           # einmalig
pnpm test:watch     # Watch-Mode
```

Aktuell abgedeckt:

- `tests/notification-deep-links.test.ts` — jede Notification-URL (aus
  `notificationHref()` + statische `url:`-Overrides in Server-Actions und der
  Automation-Engine) muss auf eine echte `page.tsx` unter `src/app/(app)/`
  zeigen. Verhindert „404 nach Klick auf die Glocke". Neuen URL-Override in
  Notification-Code? Auch in die `overrides`-Liste des Tests eintragen.
- `tests/portal-deep-links.test.ts` — jeder Bewohner-seitige Link (Portal-Nav,
  Dashboard-Panels, dynamische Row-Links `/portal/announcements/[id]`,
  `/portal/defects/[id]`, `/portal/messages/[id]`, Post-Login-Redirects aus
  `(auth)/login` und `(app)/layout`) muss auf eine echte `page.tsx` unter
  `src/app/(portal)/` zeigen. Neue Portal-Route oder neuer Link? Auch in die
  `staticLinks`/`dynamicLinks`-Listen des Tests eintragen.
- `tests/automations-registry-coverage.test.ts` — jeder `TriggerKey` aus
  `src/lib/automations/registry.ts` muss einen `case`-Zweig in
  `evaluateTrigger` haben, jeder `ActionKey` einen `=== '…'`-Branch in
  `runRule`/`resolveRecipients`. Sichert außerdem, dass `TRIGGERS`/`ACTIONS`
  vollständige Definitions-Arrays für alle Keys liefern. Verhindert „Regel
  läuft still, weil vergessener Evaluator/Dispatcher".
- `tests/notification-kinds-consistency.test.ts` — drei-Achsen-Guard:
  jedes `notification_kind`/`entity_type`-Literal in
  `src/lib/automations/engine.ts` muss in `NOTIFICATION_KINDS` bzw.
  `NOTIFICATION_ENTITY_TYPES` (`src/lib/schemas/notifications.ts`) deklariert
  sein; die letzte `notifications_kind_check`/`notifications_entity_type_check`-
  Migration muss exakt dieselben Werte erlauben (bidirektional). Verhindert
  „Automation läuft, INSERT scheitert am DB-CHECK, Nutzer bekommt nichts".
  Neuen Kind eingeführt? → `NOTIFICATION_KINDS` erweitern **und** neue
  Migration schreiben, die den CHECK dropt + neu setzt.
- `tests/permission-registry-coverage.test.ts` — jeder `permissions.has('x.y')`-
  Aufruf im ganzen `src/`-Baum, jedes `permission:`-Feld in
  `components/layout/nav-config.ts` und jede Permission in
  `SYSTEM_ROLE_TEMPLATES` muss in `PERMISSIONS`
  (`src/lib/permissions/registry.ts`) existieren. `PermissionKey` ist ein
  String-Alias — TypeScript prüft die Zeichenkette nicht. Tippfehler in einer
  Guard-Check-Zeile heißt sonst „Nutzer wird stumm abgewiesen" oder „Nav-Link
  erscheint nie". Neuen Nav-Eintrag oder neuen Guard? Zuerst Key in
  `PERMISSIONS` deklarieren.
- `tests/rls-coverage.test.ts` — jede Tabelle, die eine Migration unter
  `supabase/migrations/` per `create table [public.]<name>` anlegt, muss
  spätestens am Ende der Migrations-Kette ein `alter table … enable row level
  security` haben, und keine Migration darf RLS wieder abschalten. Migrationen
  werden lexicographisch sortiert durchlaufen (= chronologisch), das jeweils
  letzte enable/disable pro Tabelle gewinnt — analog zum echten Postgres-Lauf.
  Verhindert das schlimmste Multi-Tenant-Leak: „neue Tabelle vergessen zu
  schützen, jeder Mandant liest alles". Neue Tabelle? In derselben Migration
  direkt `enable row level security` + Policies mitliefern.
- `tests/nav-module-coverage.test.ts` — dreifacher Konsistenz-Check zwischen
  `components/layout/nav-config.ts` und `lib/modules/registry.ts`:
  jeder `NavItem.module` (nicht null) muss ein deklarierter `ModuleKey` sein
  (Runtime-Guard zusätzlich zur TS-Typprüfung, fängt `as`-Casts);
  jeder statische `NavItem.href` muss auf eine `page.tsx` unter
  `src/app/(app)/` zeigen (Allowlist `KNOWN_MISSING_PAGES` für bewusst
  ungebaute Routen wie `/map` und `/documents` — Einträge in der Allowlist
  werden automatisch als stale markiert, sobald die `page.tsx` existiert);
  jedes Modul mit `menuPath` muss von mindestens einem NavItem via
  `module: <key>` referenziert werden (verhindert „menuPath ist tote
  Registry-Konfiguration"). Verhindert stumme Sidebar-Ausfälle (Item
  verschwindet weil `enabledModules.has(module)` false wird) und tote
  Sidebar-Links (User klickt → 404). Neue Sidebar-Route? Nav-Eintrag +
  `menuPath` im passenden Modul + echte `page.tsx`.
- `tests/storage-bucket-policy-coverage.test.ts` — jeder in einer Migration
  per `insert into storage.buckets` deklarierte Bucket muss `public=false`
  sein und mindestens eine SELECT- und INSERT-Policy auf `storage.objects`
  besitzen, die per `bucket_id = '<id>'` an ihn gebunden ist. Zusätzlich
  darf keine Storage-Policy `to public`/`to anon` gewährt sein, jede muss
  einen `bucket_id`-Filter und einen Tenant-Scope-Check
  (`app_auth.is_tenant_member(...)` oder `app_auth.current_tenant_id()`)
  im Body enthalten, und jede darf sich nur auf einen deklarierten Bucket
  beziehen. Verhindert den ekligsten Storage-Bug: „Upload klappt, aber
  Nutzer aus Tenant B können die Datei von Tenant A laden". Neuer Bucket?
  Zusammen mit Bucket-INSERT auch SELECT/INSERT-Policies + Tenant-Check
  in derselben Migration mitliefern.
- `tests/rls-policy-existence.test.ts` — Ergänzung zur RLS-Coverage:
  jede in einer Migration per `create table public.<name>` angelegte
  Tabelle, deren finaler RLS-Zustand `enabled` ist, muss mindestens eine
  `create policy … on <name>` in irgendeiner Migration besitzen (quoted
  und unquoted Policy-Namen werden akzeptiert). RLS aktiviert + null
  Policies = deny-all — jeder Nutzer bekommt eine leere Ergebnismenge,
  das Modul „funktioniert" ohne Fehlermeldung und niemand merkt was.
  Für Tabellen, bei denen deny-all Absicht ist (Service-Role-only via
  Trigger/Cron), gibt es die Allowlist `INTENTIONALLY_DENY_ALL` mit
  Stale-Sanity-Check (sobald doch eine Policy hinzukommt, muss der
  Eintrag entfernt werden). Neue Tabelle mit RLS? Policies in derselben
  Migration mitliefern.
- `tests/rls-permission-key-coverage.test.ts` — jeder Permission-Key,
  den eine RLS-Policy per `app_auth.has_permission('<key>', ...)`
  abfragt, muss in `src/lib/permissions/registry.ts` (`PERMISSIONS`)
  registriert sein. `app_auth.has_permission` liefert für unbekannte
  Keys `false` zurück — ein Tippfehler wie `documents.viw` sperrt jeden
  Nutzer stumm aus, ohne Fehlermeldung. Zusätzlich prüft der Guard,
  dass jeder `has_permission(...)`-Aufruf schema-qualifiziert mit
  `app_auth.` erfolgt (unqualifizierte Calls resolven über `search_path`
  und können auf eine unbeabsichtigte Funktion treffen). Neue Permission
  in RLS-Policy? Vorher in `PERMISSIONS` eintragen, dann Migration.
- `tests/function-search-path-coverage.test.ts` — jede Funktion in
  `app_auth.*` oder `public.*`, die per `create or replace function`
  angelegt wird, muss im Header (zwischen `returns` und `as $$`) einen
  fixen `set search_path` pinnen. Prüft den finalen Zustand pro
  `schema.name` (last-write-wins), damit eine spätere Härtungs-Migration
  (siehe `20260801000100_harden_functions.sql`) eine frühere Definition
  ohne Pin reparieren kann. Fehlender `search_path` auf einer
  `security definer`-Funktion ist eine Privilege-Escalation-Fläche
  (bekannter Supabase-Advisor `function_search_path_mutable`): ein
  Angreifer kann per `create ... in pg_temp` eine gleich benannte
  Funktion einschleusen, die dann mit den Rechten des Definers läuft.
  Ausnahmen kommen in `INTENTIONALLY_MUTABLE` (Stale-Sanity-Check
  inklusive). Neue Funktion? Header `set search_path = ''` und alle
  Referenzen inside body voll-qualifizieren.
- `tests/migration-table-existence.test.ts` — jede Tabelle im
  `public`-Schema, auf die eine Migration ein `alter table`,
  `create policy on`, `create trigger ... on` oder `create index on`
  ausführt, muss vorher (oder in derselben Migration) per
  `create table` deklariert sein. Ohne diesen Guard bricht ein frisches
  `supabase db reset` mit `relation "…" does not exist` ab, ohne dass
  der Advisor es fängt (Remote-DB hat die Tabelle bereits).
  Ausnahmen: Tabellen, die beim Bootstrap remote via Supabase-MCP
  `apply_migration` angelegt wurden (aktuell nur `residents`), landen
  in `INTENTIONALLY_EXTERNAL` mit Rationale — der Test wird rot, sobald
  ein `create table` dafür in den SQL-Migrations erscheint, und zwingt
  Cleanup.
- `tests/portal-nav-route-coverage.test.ts` — bidirektionale
  Konsistenz zwischen `src/app/(portal)/portal/_components/portal-nav.tsx`
  und den Portal-Routen unter `src/app/(portal)/portal/*/page.tsx`.
  (a) Jeder `href` im Portal-Nav zeigt auf eine existierende `page.tsx`
  (sonst Sidebar-Klick → 404 für jeden Bewohner). (b) Jedes Top-Level-
  Segment mit eigener `page.tsx` (z.B. `dashboard`, `announcements`,
  `defects`, `messages`) ist im Nav referenziert (sonst Orphan-Route:
  URL funktioniert, aber Bewohner können sie nur finden wenn sie den
  Pfad kennen). Ausnahmen (z.B. `login`) kommen in
  `INTENTIONALLY_NAV_HIDDEN` mit Stale-Sanity-Check. Ergänzt
  `portal-deep-links.test.ts` (das nur hardcodierte URLs → Page prüft,
  keine Orphan-Detection).
- `tests/route-handler-method-coverage.test.ts` — jede
  `src/app/**/route.ts` (App-Router-Handler) exportiert (a) keinen
  `default`-Export (Next-Silent-Ignore: der Handler wird nicht
  registriert, alle Requests → 404/405), (b) mindestens einen
  case-sensitiv gültigen HTTP-Method-Handler (`GET`, `POST`, `PUT`,
  `PATCH`, `DELETE`, `OPTIONS`, `HEAD`), und (c) keinen lowercase-Typo
  (`get`, `post`, …), den Next stumm ignorieren würde. Nicht-Handler-
  Exports wie `runtime`, `dynamic`, `revalidate` etc. sind erlaubt. Kein
  Allowlist nötig — die drei Regeln sind absolute Anforderungen des
  Next-App-Routers.
- `tests/server-action-auth-coverage.test.ts` — jede Datei mit
  Top-Level `'use server'` ruft mindestens einmal einen der beiden
  Auth-Helper: `requireTenantContext()` (App-Actions, Staff/Admin) oder
  `requireResidentContext()` (Portal-Actions, Bewohner). Ohne Aufruf
  laufen die exportierten Server Actions auch für anonyme Requests am
  `/_next/action`-Endpunkt — Multi-Tenant-Leak über Bypass der
  Application-Layer, RLS ist die letzte Verteidigungslinie (bricht,
  sobald irgendeine Query den Service-Role-Client verwendet). Pre-
  Session-Bootstrap (Login, Reset-Password, Portal-Login) ist in
  `INTENTIONALLY_UNAUTHENTICATED` allowlisted; Stale-Sanity-Check
  entfernt den Eintrag automatisch, sobald die Datei einen Helper
  bekommt. Guard ist datei-weit (nicht per-function) — Absicherung
  einzelner exportierter Funktionen bleibt Code-Review-Aufgabe.
- `tests/formdata-zod-parse-coverage.test.ts` — jede Datei, die
  irgendwo `formData.get(...)` aufruft, muss auch mindestens einmal
  ein Zod-Schema per `.safeParse(...)` prüfen. Roh-`FormData`-Werte
  sind vom Client kontrollierte Strings (bzw. `File | null`) — sie
  ohne Zod-Validierung in `.insert/.update/.eq` weiterzureichen
  bedeutet unvalidierter User-Input direkt an Postgres. Ausnahme
  aktuell: `src/app/(app)/checklist-runs/actions.ts` validiert jedes
  Feld manuell (Whitelist-`kind`, `.slice(2000)` für Freitext,
  `Number()`+`Number.isNaN` für Zahlen, UUID-via-`.single()` für
  Foreign-Keys) — semantisch äquivalent, aber konventionsfremd; in
  `INTENTIONALLY_MANUALLY_VALIDATED` mit Refactor-TODO. Stale-Sanity-
  Check: sobald die Datei `.safeParse()` bekommt, wird der Eintrag
  Fehler. Guard-Muster ist absichtlich eng auf `.safeParse(`
  beschränkt (nicht `.parse(`), damit `JSON.parse`/`Date.parse` etc.
  keine False-Positives auslösen.
- `tests/server-secret-leak-coverage.test.ts` — jede Datei, die
  ein Server-Secret liest (`SUPABASE_SERVICE_ROLE_KEY`,
  `AUTOMATION_CRON_SECRET`, `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`,
  `SUPABASE_JWT_SECRET`), muss vom Bundler zwangsweise auf den
  Server beschränkt sein — entweder Route-Handler unter
  `src/app/api/**`, `import 'server-only'` als erster Statement
  (Next.js wirft dann bei Client-Import einen Build-Error), oder
  `'use server'` als File-Direktive. Zusätzlich darf kein
  Secret-Consumer `'use client'` tragen. Guard-Muster ist eng auf
  `.SECRETNAME`-Property-Access (nicht bloß bare String), damit
  Kommentare mit dem Namen keine False-Positives auslösen. Ausnahme
  aktuell: `src/lib/env.ts` ist die Zod-Schema-Definition selbst und
  MUSS ohne `server-only`-Marker bleiben, weil `clientEnv` daneben
  legitim von Client-Components importiert wird — `serverEnv()`
  gated sich stattdessen zur Laufzeit via `typeof window !==
  'undefined'`-Throw. In `INTENTIONALLY_UNGUARDED_SECRET_FILES` mit
  Stale-Sanity-Check: sobald env.ts einen `server-only`-Import
  bekommt, wird der Eintrag Fehler.
- `tests/rls-policy-tenant-scope-coverage.test.ts` — jede
  `CREATE POLICY`-Definition in `supabase/migrations/**` muss im
  USING/WITH-CHECK-Body mindestens einmal eine Scope-Fn referenzieren
  (`app_auth.current_tenant_id`, `app_auth.is_tenant_member`,
  `app_auth.has_permission`, `is_resident_of_tenant`, `auth.uid`).
  Eine Policy ohne Scope-Fn ist effektiv public — jeder mit Session
  (oder bei `to public` sogar anonym) erfüllt das Prädikat, die
  Mandanten-Isolation ist raus. Ausnahmen aktuell (2 von 177):
  `tenants_insert` mit `with check (false)` (Hard-Lockdown, stärker
  als jeder Auth-Check — Tenants werden nur vom Service-Role-Client
  provisioniert) und `permissions_select` mit `using (true)` (globales
  Permission-Enum-Registry, nicht tenant-scoped). Beide in
  `INTENTIONALLY_UNSCOPED_POLICIES` mit `file::name::table`-Key und
  Stale-Sanity-Check: sobald einer der Einträge eine Auth-Fn bekommt,
  wird der Eintrag Fehler und forciert Re-Review.
- `tests/migration-enum-consistency-coverage.test.ts` — jeder
  `CREATE TYPE ... AS ENUM (...)` in `supabase/migrations/**` (inkl.
  aller nachfolgenden `ALTER TYPE ... ADD VALUE`) muss einen exakt
  passenden Values-Set in `Constants.public.Enums` in
  `src/types/database.ts` haben. Prüft in beide Richtungen: Namen-Set
  muss identisch sein (fängt umbenannte oder gelöschte Enums), und für
  jeden Namen muss der sortierte Values-Set übereinstimmen. Verhindert
  den klassischen Drift: jemand fügt `ALTER TYPE ... ADD VALUE 'foo'`
  hinzu, vergisst `pnpm gen:types` zu laufen, danach akzeptiert die DB
  den neuen Wert, aber `Database["public"]["Enums"][…]` in TypeScript
  weiß nichts davon — Supabase-Query-Aufrufe filtern silent auf einen
  zu engen Typ, oder Inserts mit dem neuen Wert scheitern erst zur
  Laufzeit an einer Postgres-Fehlermeldung statt am TypeScript-Compiler.
- `tests/rls-policy-explicit-for-op-coverage.test.ts` — jede
  `CREATE POLICY` in `supabase/migrations/**` muss im Header eine
  explizite `for select|insert|update|delete|all`-Klausel haben.
  Postgres behandelt fehlende Klausel als `FOR ALL`: dieselbe
  Prädikate-Formel bindet dann SELECT + INSERT + UPDATE + DELETE
  gleichzeitig — meist eine Read-Policy die versehentlich auch Write
  öffnet. Zweite Schicht: `for all` selbst muss explizit whitelistet
  werden (`INTENTIONALLY_FOR_ALL_POLICIES` mit `file::name::table`-Key
  + Rationale). Aktuell 7 legitime `for all`-Policies (alle
  Tenant-Config-Write-Policies in `20260801000000_init.sql`, die für
  Admins C/U/D auf `tenant_modules`, `memberships`, `roles`,
  `role_permissions`, `user_roles`, `user_groups`,
  `user_group_members` bündeln — mit paralleler `_select`-Policy die
  breiter fasst). Bidirektionaler Stale-Sanity-Check: jeder Allowlist-
  Eintrag muss noch existieren UND noch `for all` verwenden — sonst
  bricht der Test und forciert Re-Review.
- `tests/env-var-client-bundle-coverage.test.ts` — jeder
  `process.env.<NAME>`-Zugriff in `src/**` außer `NEXT_PUBLIC_*` nur
  in Files mit Server-Only-Marker (api-route, `'use server'`,
  `import 'server-only'`) oder auf expliziter Whitelist. Ist die
  strukturelle Verallgemeinerung des Server-Secret-Guards (Batch 17):
  der prüft nur 5 namentliche Secrets, dieser fängt jeden **neuen**
  privaten env-Zugriff sofort. Failure-Mode: jemand fügt
  `process.env.MY_NEW_API_KEY` in einer Utility-Datei ein, die
  Utility wird versehentlich in eine Client-Komponente importiert —
  der Env-Name landet dann im Browser-Bundle (Wert bleibt undefined,
  weil Next.js nur `NEXT_PUBLIC_*` inlint, aber der übliche
  „Fix" ist Umbenennung nach `NEXT_PUBLIC_MY_NEW_API_KEY`, wodurch
  auch der Wert leakt). Whitelist enthält `src/lib/env.ts` (Schema-
  Definition mit `serverEnv()`/`clientEnv()`-Split, darf keinen
  server-only-Marker haben weil `clientEnv` legitim von
  Client-Komponenten importiert wird). Sekundärer Test: kein
  private-env-File darf `'use client'` haben.
- `tests/server-action-service-client-coverage.test.ts` — jede
  Server-Actions-Datei (`'use server'` at file scope) darf
  `createSupabaseServiceClient` (Service-Role-JWT, umgeht RLS) nur
  importieren/aufrufen, wenn sie auf einer expliziten Whitelist steht.
  Fängt genau den Failure-Mode ab, in dem eine an sich gewollte
  Server-Action als Nebenprodukt Root-DB-Rechte für den Rest ihres
  Bodies bekommt (Zeile zu viel: `const supabase =
  createSupabaseServiceClient();` statt `await createSupabaseServerClient();`).
  Aktuell 3 legitime Whitelist-Einträge: `employees/actions.ts` +
  `residents/actions.ts` (beide brauchen `auth.admin.inviteUserByEmail`
  / `listUsers`, die per Supabase-Auth-Admin-Design den Service-Key
  verlangen) und `settings/automations/actions.ts` (DELETE auf
  engine-eigener `automation_dispatches`, INSERT in `sent_emails` und
  manual-trigger `runRule(service, ...)` — jeweils gated durch
  Permission-Check plus Tenant-ID-Match vor dem Service-Client-Call).
  Bidirektionaler Stale-Sanity-Check: jeder Whitelist-Eintrag muss
  noch existieren, noch `'use server'` haben UND noch den Service-
  Client importieren/aufrufen — sonst bricht der Test.
- `tests/rls-enable-statement-coverage.test.ts` — jede Table, auf der
  eine Migration eine Policy erstellt, muss in *irgendeiner* Migration
  ein `alter table <t> enable row level security` bekommen (oder auf
  der externen-RLS-Whitelist stehen). Fängt den lautlosesten aller
  RLS-Bugs: policies werden akzeptiert, es gibt keinen Fehler und
  keine Warnung, aber ohne ENABLE ist die Table fail-open und jede
  Predicate wird ignoriert. Whitelist hat 2 Einträge:
  `storage.objects` (Supabase-Storage-owned, RLS ist per Default vom
  System aktiviert) und `residents` (per Supabase-MCP-`apply_migration`
  out-of-band angelegt — die Tabelle existiert nur in der Remote-
  Migration-Historie, nicht als File; siehe analoges Whitelisting in
  `migration-table-existence.test.ts`). Bidirektionaler Stale-Check:
  wenn ein Whitelist-Eintrag doch ein lokales ENABLE bekommt oder
  seine letzten Policies verliert, bricht der Test und forciert
  Removal.
- `tests/migration-filename-timestamp-order-coverage.test.ts` — jede
  Datei in `supabase/migrations/` muss dem Format
  `YYYYMMDDHHMMSS_<lower_snake_slug>.sql` folgen, einen kalendarisch
  plausiblen Timestamp haben (Monat 01-12, Tag 01-31, Stunde 00-23
  etc.), und der 14-stellige Prefix muss projektweit unique sein.
  Zusätzlich: lexikographischer Filename-Sort muss auf jeder Position
  mit dem numerischen Timestamp-Sort übereinstimmen (invariant, das
  Supabase-CLI-Order matcht das, was ein Dev beim Betrachten des
  Directory-Listings erwartet). Fängt drei Klassen von Bugs, die
  bisher nur beim Deploy sichtbar wurden: (1) zwei parallel entwickelte
  Migrations mit identischem Timestamp (Order zwischen ihnen undefined,
  bricht auf Remote nachdem lokales `db reset` grün war); (2) einen
  Timestamp-Tippfehler wie `20261301...` (Monat 13) oder `20260832...`
  (Tag 32), der zwar von Postgres akzeptiert wird aber die Migration
  in einen Bogus-Sort-Slot einordnet; (3) einen abweichenden Filename
  wie `20260801_foo.sql` (nur 8-stelliger Prefix) oder
  `20260801000000_MyMig.sql` (uppercase Slug), der entweder falsch
  sortiert oder Tooling bricht. Aktuell 29 well-formed Files ohne
  Kollisionen — Test hat keine Whitelist, weil das Format ohne
  Ausnahme gelten soll.
- `tests/rls-policy-schema-qualification-coverage.test.ts` — jede
  `create policy ... on <target>` verweist auf eine Table in einem
  erlaubten Schema: implizit (via search_path resolved zu `public`),
  `public.` explizit oder `storage.` explizit. Alles andere ist
  verboten — insbesondere `auth.*` (Supabase-managed, unsere Policies
  hätten dort keine Autorität) und `pg_catalog.*` /
  `information_schema.*` (System-Schemas, Policies dort sind meistens
  Copy-Paste-Bugs). Zusätzlich: kein Target darf 3+ dot-separated
  Parts haben (`db.schema.table` in einer Migration deutet auf
  Foreign-Data-Wrapper-Copy-Paste oder Cross-DB-Reference-Bug hin —
  die Migration läuft nur gegen die lokale DB, ein DB-Prefix ist
  strukturell falsch). Aktuell 177 Policy-Targets über 3 Schemas
  (`<implicit>` 28, `public.` 146, `storage.` 3), 52 distinct raw
  Targets. Guard fängt hauptsächlich Schema-Tippfehler (`publci.foo`,
  `storaage.objects`) und disallowed-schema-Additions, die Postgres
  bei Migration-Zeit anstandslos akzeptieren aber später zu subtilen
  Rechteproblemen führen.
- `tests/rls-policy-non-trivial-clause-coverage.test.ts` — jede
  `create policy` muss (a) mindestens eine explizite Clause haben
  (USING oder WITH CHECK, kein Verlass auf Postgres-Defaults, die per
  FOR-Op variieren) und (b) darf keine trivial-true Clause haben
  (`USING (true)` / `WITH CHECK (true)`), außer sie steht auf einer
  expliziten Whitelist mit dokumentierter Rationale. Fängt den
  schwersten aller RLS-Fehler: eine Policy ist "da", sie steht im
  Migration-File, sie greift auch — aber `USING (true)` legt keine
  per-Row-Restriction fest, kombiniert mit dem üblichen Grant an
  `authenticated` sieht jeder eingeloggte Caller jede Row jeder
  Tenant-Instanz. In Supabase Studio als Admin nicht sichtbar (weil
  Admin ohnehin alles sieht), im normalen App-Traffic auch nicht (weil
  eigener Tenant sowieso den Erwartungswert liefert), aber ein
  cross-tenant-Test würde alles retournieren. Aktuell 177 Policies, 0
  ohne Clause, 1 einziger legitimer Trivial-Fall auf Whitelist:
  `permissions_select` auf `public.permissions` (statischer
  Permission-Katalog, global lesbar für alle authentifizierten Caller,
  kein Tenant-Scope). Bidirektionaler Stale-Check: wird die Whitelist-
  Policy jemals tightend oder umbenannt, forciert der Test Removal
  bzw. Update des Eintrags.
- `tests/route-handler-auth-coverage.test.ts` — jede `src/app/**/route.ts`
  bzw. `route.tsx` muss entweder einen bekannten Auth-Marker im Source
  enthalten oder auf einer expliziten "public"-Whitelist stehen.
  Marker-Set: `requireTenantContext(` (App-Side-Auth-Helper),
  `requireResidentContext(` (Portal-Side), `loadBillingDocumentData(`
  (transitiver Auth via PDF-Loader, der intern `requireTenantContext()`
  ruft), `.auth.signOut(` (Logout-Routen, no session needed) und
  `AUTOMATION_CRON_SECRET` (Bearer-Token-Pattern für Cron). Parallel-
  Guard zu `server-action-auth-coverage.test.ts` — Server-Actions und
  Route-Handler sind die zwei parallel-existierenden HTTP-Einstiegs-
  punkte, beide brauchen den gleichen Auth-Guard. Aktuell 12 Route-
  Handler: 10 auth-gated, 2 auf Public-Whitelist. Whitelist-Einträge
  mit dokumentierter Rationale: `api/push/vapid-key/route.ts` (VAPID
  public key ist per Design kein Secret und muss vor Login abrufbar
  sein) und `api/qr/[type]/[id]/route.ts` (QR-Scan von Papier-
  Ausdrucken muss unauthentifiziert funktionieren; Deep-Link-URL
  redirected dann in die auth-geschützte App). Failure-Mode fängt den
  klassischen "Ich-habe-eine-API-Route-vergessen-zu-authen"-Bug —
  z.B. ein `/api/some-thing/route.ts` ohne `requireTenantContext()`
  wäre ein offener Endpoint auf jeder Deploy-URL, RLS würde nichts
  helfen weil ohne Auth-Context kein `auth.uid()` gesetzt ist.
- `tests/function-security-definer-scope-coverage.test.ts` — jede
  `create [or replace] function` mit `security definer` muss im
  `app_auth.*` Schema liegen (der konventionelle Namespace für
  privileged Helpers: Trigger-Support, Code-Generatoren, Notification-
  Enqueue etc.) oder auf einer expliziten Whitelist mit dokumentierter
  Rationale stehen. Extraktor parst 42 Funktionen via dollar-quoted
  Body-Terminator-Matching (kein simpler Semikolon-Split, weil ein
  `security definer` innerhalb eines Function-Bodys sonst in die
  nächste Funktion "spillen" würde). Aktuell 27 definer-Funktionen,
  alle in `app_auth.*`, Whitelist ist leer. Failure-Mode: eine
  `security definer` Funktion im `public.*` Schema ist doppelt
  gefährlich — sie wird von PostgREST automatisch als RPC exposed und
  ist damit für jeden authentifizierten Caller aufrufbar, UND sie
  läuft mit den Rechten des Owner-Roles (typischerweise `postgres`,
  bypasses jede RLS). Ohne eigenen `auth.uid()`-Filter im Body ist
  das eine cross-tenant read/write primitive. Der Guard fängt den
  Fall zur PR-Review-Zeit, bevor die Migration deployed wird.
  Bidirektionaler Stale-Check auf Whitelist-Einträge: sowohl Existenz
  als auch Schema-Zuordnung werden geprüft.
- `tests/migration-destructive-statement-coverage.test.ts` — jede
  Migration wird gegen zwei Klassen destruktiver Statements gescannt.
  Klasse 1 (Prohibited, keine Whitelist, 13 Patterns): `truncate`,
  `create [unique] index concurrently`, `drop index concurrently`,
  `drop database/schema/role/user/owned`, `alter system`,
  `set role` / `reset role`, `copy ... from program`. Diese sind
  entweder irreversible Datenverlust-Primitives (`truncate` copy-paste
  aus Dev-Reset-Script leert die Produktions-Tabelle bei Migration-
  Apply lautlos), transaction-brechende DDLs (`CONCURRENTLY` erhebt
  25001 innerhalb des transaktionalen Migration-Wrappers und lässt
  das Schema halbmigriert zurück), Cluster-weite Config-Änderungen
  (`alter system` persistiert cluster-weit, requires superuser) oder
  Session-Role-Escalations (`set role` lässt alle nachfolgenden
  Statements als anderer Role laufen). Klasse 2 (Requires-IF-EXISTS,
  mit Whitelist, 6 Patterns): `drop table/function/trigger/policy/
  view/type` ohne `if exists`. Grund: idempotente Re-Apply-Safety
  bei partiell migrierten DBs (Recovery, Dev-Reseed, Staging-
  Refresh) — die naked-Variante wirft error und bricht das File in
  der Mitte ab. Aktuell 0 Prohibited-Hits (grüne Baseline) und
  3 Naked-Drops auf Whitelist, alle im `notifications_perf_polish`-
  Rewrite (bewusst grandfathered, weil das File bereits in Prod
  applied ist und ein Rewrite Ledger-Checksum-Mismatch riskieren
  würde). Bidirektionaler Stale-Check (missing/stale) plus per-
  Entry-Existence-Check.
- `tests/tenant-column-naming-consistency-coverage.test.ts` — jede
  Column in einer `create table (...)`-Body, die auf
  `public.tenants(id)` oder `tenants(id)` (implicit schema) verweist,
  MUSS exakt `tenant_id` heißen. Zusätzlich (belt-and-suspenders):
  jede Column, deren Name den Substring "tenant" enthält, muss
  ebenfalls exakt `tenant_id` sein (kein `tenantid`, kein `tenant`,
  kein `owner_tenant`, kein `resident_tenant_id`). Extraktor isoliert
  Table-Bodies vom PL/pgSQL-Body-Kontext (Postgres-Functions
  deklarieren regelmäßig `v_tenant_id`, `p_tenant_id` als Locals —
  die dürfen nicht mit dem Column-Guard kollidieren). Aktuell 41
  Tenant-FK-Columns über 33 distinct Tables, alle kanonisch benannt.
  Guard ohne Whitelist — der Name ist load-bearing für andere Guards:
  `rls-policy-tenant-scope-coverage` (Batch 18) grept `tenant_id = ...`
  in Policy-Bodies, ein abweichender Column-Name würde silent nicht
  detektiert und cross-tenant RLS könnte kaputt sein während der
  Scope-Guard trotzdem grün wäre. Bidirektionaler Test: jede
  tenant-namige Column ist auch tenant-FK, jede tenant-FK ist auch
  tenant-namig — verhindert einerseits soft-typed `tenant_id uuid`
  ohne FK (was bei Tenant-Deletion zu dangling references führt),
  andererseits anonyme FKs auf Tenants unter unrelated Namen (was
  Grep-basierte Audits umgeht).
- `tests/tenant-column-integrity-coverage.test.ts` — jede Tenant-FK-
  Column (identifiziert via `references [public.]tenants(id)`)
  MUSS zwei Constraints tragen: (a) `not null` (oder Teil eines
  PRIMARY KEY, was implizit NOT NULL bedeutet) und (b)
  `on delete cascade`. Extraktor erkennt sowohl inline `primary key`
  auf Column-Ebene als auch composite `primary key (col1, col2)` auf
  Table-Ebene (letzteres deckt `tenant_modules(tenant_id, module_key)`
  ab). Aktuell 41/41 Columns explizit `not null` + `on delete cascade`
  — grüne Baseline, keine Whitelist. Failure-Modi: (1) nullable
  `tenant_id` ist RLS-Bypass-Primitive via SQL-Three-Valued-Logic
  (`NULL = current_tenant_id()` evaluiert zu NULL, nicht TRUE oder
  FALSE — die Row ist damit für keinen Tenant sichtbar, existiert aber
  und kann via service-role oder cross-tenant-Admin-Views leaken); (2)
  fehlende Cascade blockiert Tenant-Löschung permanent (child rows
  existieren immer sofort nach Onboarding) oder erzeugt bei `set null`
  genau das Nullable-Problem aus (1). Load-bearing für Data-Lifecycle-
  Integrität — ein neuer Domain-Table ohne diese beiden Constraints
  wäre eine schleichende cross-tenant-Kompromittierung, die weder das
  Type-System noch RLS-Tests fangen.
- `tests/migration-non-tenant-fk-on-delete-explicit-coverage.test.ts` —
  jede Non-Tenant-FK-Column (also alles außer `references
  [public.]tenants(id)`, das Batch 31 abdeckt) MUSS eine explizite
  `on delete <action>` Clause tragen — eine der fünf gültigen Actions
  `cascade`, `restrict`, `no action`, `set null`, `set default`. Der
  Guard sagt NICHT welche — das ist eine semantische Wahl pro Column
  — sondern nur DASS eine gewählt und deklariert sein muss. Postgres-
  Default ist `on delete no action` (deferred restrict): stumm
  blockierend, aber ohne dass irgendetwas in der Column-Definition
  darauf hinweist. Reader, die aufgrund der umgebenden Tabellen
  `cascade` erwartet hatten (weil Sibling-Tables kaskadieren) oder
  `set null` (weil das nach einer Audit-Column aussieht), raten falsch
  und schleppen subtile Bugs ein — Orphan-Rows die hätten kaskadieren
  sollen, oder blockierte Löschungen die hätten nullen sollen. Der
  Regex-Extraktor scannt jede `create table (...)` bodies, skippt
  Constraint-Zeilen ohne `references`, filtert tenant-FKs heraus und
  matcht `on delete (cascade|restrict|no action|set null|set default)`
  case-insensitive im Column-Entry. Aktuell 131 non-tenant FKs
  gescannt: 85× `set null`, 38× `cascade`, 7× `restrict`, 1× implicit
  (grandfathered, siehe unten). Grandfathering-Whitelist mit 1 Eintrag
  (`user_roles.created_by` in der Init-Migration), weil Rewrite bereits
  applied Migrations die Supabase-Ledger-Checksum invalidieren würde.
  Bidirektionaler Stale-Check: jeder Allowlist-Eintrag zeigt auf einen
  existierenden FK UND ist immer noch ohne explizite Action — sonst ist
  der Eintrag tot und wird als Fehler geflagt. Failure-Mode: eine neue
  FK ohne on-delete-Clause führt zu einem tacit Postgres-Default, der
  bei parent-Deletion überraschend blockiert; im schlimmeren Fall
  entdeckt das Team es erst wenn ein Support-Ticket eine Kunden-
  Löschung fordert und die Cascade nirgends aufgesetzt ist.
- `tests/migration-check-constraint-naming-coverage.test.ts` — jeder
  `CHECK`-Constraint auf **Table-Ebene** (`check (...)` als eigener
  Top-Level-Eintrag im `create table` body) und jeder **ALTER TABLE
  ADD CHECK** MUSS via `constraint <snake_case_name> check (...)`
  benannt sein. Column-inline anonyme Checks (`col text check (col in
  (...))`) sind absichtlich out-of-scope — Postgres nennt sie
  `<table>_<col>_check`, was in Error-Toasts noch diagnostizierbar
  bleibt. Die zwei geschützten Kontexte sind gefährlicher: Postgres
  vergibt bei anonymen table-level und alter-add Checks positionale
  Namen (`<table>_check1`, `<table>_check2` …), die den Reader eines
  Fehlermessages null Information über die verletzte Invariante geben
  und beim Reorder von Migrationen mutieren — dieselbe Regel kann in
  Staging und Prod unterschiedliche Auto-Namen bekommen (weil die
  Numerierung apply-Reihenfolge-abhängig ist), was Monitoring-Regeln
  bricht. Extractor: 3-Kategorien-Scan (table-level named, table-level
  anon, alter-add named/anon) mit paren-depth-aware Body-Extraktion und
  string-literal-skip. Aktuelle Baseline: 36 named table-level Checks
  (z. B. `time_entries_end_after_start`,
  `notifications_entity_pair_ck`, `stock_movements_signed_by_kind`) +
  3 named alter-add + 0 anon in beiden Kategorien — grüne Baseline,
  keine Whitelist. Failure-Mode: eine neue Migration mit
  `check (start_at < end_at)` als eigenständigem Body-Entry führt zu
  einem `<table>_check1` Auto-Namen, den ein Support-Mitarbeiter beim
  Debuggen einer User-Fehler-Meldung nicht interpretieren kann; der
  Guard blockt das an der Source und zwingt einen sprechenden Namen.
- `tests/migration-unique-constraint-naming-coverage.test.ts` — jede
  table-level `unique (...)`, jede `alter table … add unique (...)`
  und jede `create unique index` MUSS explizit benannt sein. Column-
  inline uniques (`col type unique`) bleiben out-of-scope, weil
  Postgres sie mit `<table>_<col>_key` benennt — diagnostisch OK.
  Bei table-level anon vergibt Postgres zwar `<table>_<col1>_<col2>
  _key` (immerhin nicht positional wie bei CHECK), aber (a) die
  Column-Reihenfolge im Tupel ist load-bearing für den Namen —
  Reorder ändert die Constraint-Identität und bricht jedes daran
  hängende Monitoring, (b) mit langen Column-Namen kann der
  Auto-Name das Postgres-63-Zeichen-Identifier-Limit reißen und wird
  dann TRUNKIERT (namensverwirrend, Kollisionsrisiko), (c) ein
  Folge-Migration kann das Tupel unbemerkt umbauen und die Constraint
  bekommt lautlos einen anderen Namen. Extractor: 3-Kategorien-Scan
  (table-level named/anon, alter-add named/anon, create-unique-index)
  mit paren-depth-aware Body-Extraktion. Grandfathering-Whitelist mit
  19 Einträgen (alle vor diesem Guard geschrieben, in applied
  Migrations — Rewrite würde Supabase-Ledger-Checksum brechen). Neue
  Einträge dürfen NICHT auf die Whitelist wandern — der `it`-loop
  scannt anon UND named, für alles außerhalb der Whitelist gilt
  `expect(name).not.toBeNull()`. Bidirektionaler Stale-Check:
  Whitelist-Einträge, die inzwischen benannt wurden oder gelöscht
  sind, werden als orphan geflagt. Zusätzliche Sanity-Checks: jeder
  Constraint-Name matcht `/^[a-z_][a-z0-9_]*$/` UND hält das
  63-Zeichen-Postgres-Identifier-Limit ein. Aktuelle Baseline: 2
  table-level named (offers/invoices, die neuesten), 19 table-level
  anon (whitelisted), 2 named unique-indexes, 0 alter-add. Failure-
  Mode: eine neue Migration mit `unique (foo, bar)` als anonymer
  table-level Constraint würde einen positional-brittle Auto-Namen
  ziehen; der Guard blockt das an der Source.
- `tests/migration-foreign-key-naming-coverage.test.ts` — Convention-
  Lock für Foreign-Keys. Der Codebase-weite Konsens ist column-inline
  (`col type ... references other(id)`), Postgres benennt diese als
  `<shortTable>_<col>_fkey` — semantisch aussagekräftig. Der Guard
  verankert das dreifach: (a) jeder der aktuell 172 column-inline
  FKs bekommt einen `it`-Test, der prüft ob `<shortTable>_<col>_fkey`
  ≤ 63 Zeichen bleibt — Postgres TRUNKIERT längere Namen lautlos,
  wodurch die FK-Identität in Logs verloren geht und im Extremfall
  zwei FKs auf denselben truncated Namen kollidieren; aktueller Max
  ist 50 Zeichen (`time_entry_corrections_proposed_work_order_id_fkey`),
  13 Zeichen Headroom. (b) Aggregate-Invariant: zero anonymous
  table-level FKs (`foreign key (col) references ...`) — falls je
  jemand eine multi-column FK hinzufügt, muss sie `constraint <n>
  foreign key (...)` sein, sonst zieht Postgres den positional-
  brittleren `<table>_fkey<N>` Auto-Namen der bei Reorder oder
  Schema-Modifikation umnummeriert. (c) Aggregate-Invariant: zero
  anonymous ALTER-TABLE-ADD FKs — hier wäre der Auto-Name sogar
  apply-order-abhängig (staging vs. prod können divergieren). Da
  aktuell 0 table-level und 0 alter-add existieren, laufen die
  Baseline-Marker-Tests „nothing here yet" statt einem per-item
  Loop; die Loops aktivieren sich automatisch sobald jemand den
  ersten Vertreter dieser Kategorien hinzufügt. Sanity: alle
  explizit benannten FKs matchen `/^[a-z_][a-z0-9_]*$/` UND halten
  63 Zeichen. Failure-Mode: eine neue column-inline FK mit
  überlangem Table+Column-Namen (`this_is_a_very_long_table_name.
  another_very_long_reference_column_id`) würde einen truncated
  Auto-Namen erzeugen; der Guard blockt vor Migration-Apply.

**E2E-Setup (einmalig):**

```bash
# Chromium-Binaries installieren
pnpm exec playwright install chromium

# Credentials-Datei anlegen (gitignored)
cp .env.test.local.example .env.test.local
# → E2E_TEST_EMAIL und E2E_TEST_PASSWORD des Demo-Owners eintragen
```

**Tests ausführen:**

```bash
pnpm test:e2e                       # alle Tests
pnpm test:e2e smoke.spec.ts         # nur Smoke-Tests
pnpm test:e2e --ui                  # interaktiver Mode
```

Der Dev-Server startet automatisch auf Port 3001 (siehe `playwright.config.ts`), oder es wird eine laufende Instanz genutzt. Tests hängen an einer echten Supabase-DB gegen den Demo-Tenant — vorher `pnpm tsx supabase/seed/demo-data.ts` laufen lassen.

## Bewohner-Portal

Externe Ansicht unter `/portal/*`. Bewohner ohne Mitarbeiter-Rolle sehen eine
schlanke Oberfläche mit:

- Dashboard (Objekt, Einheit, offene Ankündigungen/Meldungen)
- Ankündigungen (mit Lese-/Quittierungs-Status)
- Eigene Mängelmeldungen (`Neue Meldung`-Formular)
- Nachrichten (Antworten auf bestehende Threads der Verwaltung)

Portal-Zugang einladen (Mitarbeiter-Sicht): in `/people/residents/[id]` unter
„Bewohner-Portal" auf **Portal-Zugang einladen** klicken. Es wird eine
Einladungs-E-Mail versendet, der Bewohner setzt sich selbst ein Passwort und
meldet sich unter `/portal` an. Das Verknüpfen kann jederzeit über **Portal-Zugang
entkoppeln** gelöst werden.

Demo-Bewohner mit Portal-Zugang seeden (optional):

```bash
SEED_RESIDENT_PASSWORD='<gewaehltes-passwort>' pnpm tsx supabase/seed/demo-data.ts
```

Ohne `SEED_RESIDENT_PASSWORD` werden keine auth-User für Bewohner angelegt (der
Seed läuft aber weiterhin fehlerfrei durch).

Zugriffskontrolle:

- `src/proxy.ts` erkennt `/portal/login` und `/portal/reset-password` als
  öffentliche Portal-Pfade und leitet unauthentifizierte Portal-Requests dorthin
  (statt zum Mitarbeiter-Login).
- RLS: `app_auth.is_resident_of_tenant()` öffnet residents/properties/units/
  buildings, announcements, defect_reports und messages punktuell für Bewohner.
  Bewohner sehen ausschließlich ihre eigene Einheit, ihr Objekt sowie an sie
  gerichtete Ankündigungen und eigene Meldungen.

## PDF-Rechnungen und -Angebote

Rechnungen (`/billing/invoices/[id]`) und Angebote (`/billing/offers/[id]`) haben
oben rechts einen **PDF öffnen**-Button, der eine on-the-fly generierte PDF-Datei
liefert:

- `GET /api/invoices/[id]/pdf` — DIN-A4-Rechnung
- `GET /api/offers/[id]/pdf` — DIN-A4-Angebot

Beide Routen sind über `proxy.ts` auth-geschützt (307 zu `/login` ohne Session)
und laden die Absenderdaten aus dem Mandanten. Zugriff erfolgt via RLS, d.h. es
werden nur Belege des eigenen Mandanten zurückgegeben.

### Absenderdaten pflegen

Unter `Einstellungen → Mandant` steht eine Sektion „Firmen- & Rechnungsdaten":

- Anschrift (Straße, PLZ, Ort, Land)
- Firmenname (rechtlich), Steuernummer, USt-IdNr.
- Kontakt (E-Mail, Telefon, Website)
- Bankverbindung (Bank, IBAN, BIC)
- Zahlungsziel (Tage) und Fußnote

Nur Inhaber:innen (Owner-Membership) dürfen diese Daten ändern (RLS).

### Smoke-Test

```bash
pnpm tsx scripts/pdf-smoke.ts
```

Rendert eine Beispielrechnung ohne DB-Anfrage und prüft, dass der Renderer ein
gültiges PDF (Magic-Bytes `%PDF-`) produziert.

## E-Mail-Versand

Rechnungen und Angebote lassen sich als PDF-Anhang direkt aus der Detail-Seite
per E-Mail versenden. Der Button **Per E-Mail senden** öffnet einen Dialog mit
Empfängerfeld (`An`, mehrere Adressen komma-separiert), optionalem CC, Betreff
und einer vorbelegten Nachricht. Beim Absenden wird:

1. das PDF frisch gerendert und als Anhang angehängt,
2. die E-Mail über den konfigurierten Provider versandt,
3. ein Eintrag in `sent_emails` (Audit-Log) angelegt,
4. bei Belegen im Status *Entwurf* der Status automatisch auf *Verschickt*
   gehoben (mit heutigem Ausstellungsdatum).

### Provider konfigurieren

Zwei Provider stehen zur Wahl (`src/lib/email/`):

- **Resend** — Produktions-Provider. Gesetzt, sobald `RESEND_API_KEY` in der
  Env liegt. Absenderdomain muss in Resend verifiziert sein.
- **Log-Provider** — Fallback für Dev/Test. Aktiv, wenn `RESEND_API_KEY` fehlt.
  Die E-Mail wird nur in der Server-Konsole ausgegeben und im Audit-Log
  hinterlegt; es geht **kein** echter Versand raus.

Env-Variablen in `.env.local` / hPanel:

```
RESEND_API_KEY=re_...
EMAIL_FROM_ADDRESS=rechnungen@hausmeisterservice.example.de
EMAIL_FROM_NAME=Hausmeisterservice Musterstadt
EMAIL_REPLY_TO=  # optional, fällt sonst auf FROM_ADDRESS zurück
```

Absender-Adresse in der Mail: Wenn im Mandanten unter `Einstellungen → Mandant`
eine E-Mail hinterlegt ist, wird sie als Absender verwendet; sonst `EMAIL_FROM_ADDRESS`.

### Audit-Log

Alle Sendevorgänge landen in `sent_emails` (RLS: nur Tenant-Mitglieder mit
`billing.view`). Gespeichert werden Metadaten (Empfänger, Betreff, Provider,
Status, Anhang-Namen, Provider-Message-ID, ggf. Fehler) sowie ein Hash des
HTML-Bodys — der Inhalt selbst wird aus DSGVO-Gründen nicht persistiert.
`DELETE` ist per RLS-Policy ausgeschlossen.

### Smoke-Test

```bash
pnpm tsx scripts/email-smoke.ts
```

Rendert PDF + E-Mail-Template und ruft den Log-Provider auf, ohne Netz-Zugriff
oder DB-Anbindung. Kein echter Versand.

## Automatisierungen

Unter `Einstellungen → Automatisierungen` lassen sich Regeln anlegen, die auf
Ereignisse reagieren und Aktionen auslösen. Registry im Code:
`src/lib/automations/registry.ts`.

**Trigger**

- `invoice.overdue` — Rechnung im Status *Verschickt* hat das Zahlungsziel überschritten.
- `invoice.due_soon` — Rechnung wird in X Tagen fällig.
- `maintenance.due_soon` — Aktiver Wartungsplan wird in X Tagen fällig.
- `defect_report.created` — Eine neue Mängelmeldung wurde erfasst. Meldungen, die vor Anlegen der Regel entstanden sind, werden ignoriert (`created_at`-Cutoff); jede Meldung wird nur einmal ausgelöst (`dispatch_key='created'`).
- `defect_report.status_changed` — Eine Mängelmeldung ist in einen der wichtigen Zustände gewechselt: `reviewing`, `converted`, `rejected` (`new` wird ignoriert, weil es mit `defect_report.created` überlappt). Dispatch-Key `status:<value>` — jeder Zielzustand triggert pro Meldung genau einmal. `updated_at`-Cutoff verhindert Historie-Flood. Da Mängelmeldungen kein Assignee-Feld haben, ist `notify_assignee` bei diesem Trigger nicht sinnvoll (durch das Schema-Guard blockiert); typische Zielgruppen sind `notify_users` (z. B. Owner) oder `notify_role`. Bekannte Grenze analog zu `work_order.status_changed`: Zustands-Zyklen (z. B. `reviewing` → `new` → `reviewing`) triggern das zweite `reviewing` nicht erneut.
- `work_order.assigned` — Ein Auftrag wurde einem Mitarbeiter zugewiesen. Zuweisungen vor Anlegen der Regel werden ignoriert (`updated_at`-Cutoff). Der Dispatch-Key kodiert die Assignee-ID (`assigned:<user_id>`), sodass ein späterer Zuweisungs-Wechsel neu triggert, mehrfaches Speichern derselben Zuweisung aber nicht.
- `work_order.status_changed` — Ein Auftrag ist in einen der wichtigen Zustände gewechselt: `in_progress`, `blocked`, `done`, `cancelled` (`new` und `planned` werden ignoriert, um Rauschen zu vermeiden). Dispatch-Key `status:<value>` — jeder Zielzustand triggert pro Auftrag genau einmal. Bekannte Grenze: ein späterer Zyklus (z. B. `done` → `new` → `done`) triggert das zweite `done` nicht erneut; für eine echte Zustandshistorie wäre ein `work_order_events`-Log der saubere Weg.

**Aktionen**

- `notify_users` — In-App-Notification an ausgewählte Benutzer (dank Push-Integration auch als System-Push, wenn ein Gerät angemeldet ist).
- `notify_role` — dito, aber an alle Träger:innen einer Rolle.
- `notify_assignee` — In-App + Push an genau den Benutzer, den der Trigger mitliefert (aktuell nur `work_order.assigned`). Wird durch das `superRefine` im Zod-Schema auf passende Trigger begrenzt.
- `send_email` — E-Mail mit Betreff/Body/CTA-Deep-Link an drei mögliche Empfänger-Typen:
  - `users` — auth-User-Emails
  - `role` — auth-User-Emails aller Träger:innen einer Rolle
  - `addresses` — freie E-Mail-Adressen (kommagetrennt), z. B. `buchhaltung@…`

Absender kommt aus `tenants.invoice_data.email` (Fallback: `EMAIL_FROM_ADDRESS`);
Rendering via `renderAutomationEmail` in `src/lib/email/automation-templates.ts`.
Jeder Versand landet als Zeile in `sent_emails` (Body-Hash statt Klartext, DSGVO).

Dedup: Pro Regel + Entität + Dispatch-Key (z. B. Fälligkeitsdatum) wird nur
einmal ausgelöst. Bei einer neuen Fälligkeit (nächster Wartungstermin) startet
ein neuer Dispatch. Läufe landen in `automation_runs`, ausgelöste Dispatches in
`automation_dispatches` — beide sind aus dem UI per Detail-Seite einsehbar.

### Cron einrichten

Regeln laufen nicht von selbst. Ein externer Scheduler ruft die Route auf:

```
POST /api/cron/run-automations
Authorization: Bearer <AUTOMATION_CRON_SECRET>
```

Die Route verlangt einen Bearer-Token, der als Env-Variable in der App gesetzt
ist (`AUTOMATION_CRON_SECRET`, mindestens 16 Zeichen). Ohne Konfiguration
liefert der Endpoint 401.

Beispiele:

- Hostinger Cron-Job (einmal täglich um 07:00):
  `curl -X POST -H "Authorization: Bearer $AUTOMATION_CRON_SECRET" https://hausmeisterservice.vaydena.de/api/cron/run-automations`
- `cron-job.org` mit Custom-Header

### Testlauf per UI

In der Detail-Ansicht einer Regel gibt es **Jetzt ausführen (Testlauf)** — führt
die Regel sofort für den eigenen Tenant aus (echte Aktionen, Dispatches
verhindern Doppel-Versand).

### Run-Detail (welche Entities wurden getroffen?)

Ein Klick auf den Zeitpunkt in „Letzte Läufe" öffnet
`/settings/automations/[id]/runs/[runId]`: neben den Aggregatzahlen (Treffer,
OK, Fehler) ist dort jeder von diesem Lauf ausgelöste Dispatch aufgelistet —
mit Verlinkung zum betroffenen Vorgang (Rechnung, Angebot, Auftrag, Meldung,
Wartungsplan), Dispatch-Key und Zeitstempel.

Ermöglicht wird das durch die Spalte `automation_dispatches.run_id`, die seit
Migration `20260810000000_automation_dispatches_run_id.sql` bei jedem
neuen Dispatch mitgeschrieben wird (`on delete set null`, damit ein gelöschter
Run die Dedup-Historie nicht verliert). Läufe vor der Migration haben keine
Verknüpfung und zeigen in der Detail-Ansicht einen entsprechenden Hinweis.

### Dispatches zurücksetzen

**Dispatches zurücksetzen** in der Admin-Leiste löscht alle
`automation_dispatches` einer Regel. Beim nächsten Lauf triggern damit alle
noch passenden Vorgänge wieder — nützlich für:

- **Zustands-Zyklen** — z. B. wenn ein Auftrag `done → new → done` durchlief
  und der zweite `done`-Übergang erneut benachrichtigen soll.
- **Regel-Tests** — nach einem Testlauf einer `send_email`-Regel die Historie
  leeren, um erneut testen zu können.
- **Fehlerhafte erste Läufe** — wenn eine Regel im ersten Lauf falsche
  Empfänger hatte und man nach der Korrektur die betroffenen Matches erneut
  auslösen möchte.

Achtung: Es können Doppel-Benachrichtigungen entstehen, wenn Empfänger die
ursprüngliche Notification schon erhalten haben. Die Detail-Seite zeigt die
aktuelle Dispatch-Zahl an; der Button ist deaktiviert, solange sie 0 ist.
Erfordert die Permission `automations.manage`.

### Testmail an mich senden

Für Regeln mit Aktion **`send_email`** erscheint in der Admin-Leiste zusätzlich
**Testmail an mich senden**. Der Button verschickt eine Beispiel-Mail an die
E-Mail-Adresse des aktuell angemeldeten Nutzers. Er umgeht Trigger-Evaluation,
Cutoff und `automation_dispatches` und schreibt keinen `automation_runs`-Eintrag
— die Mail landet aber in `sent_emails`, damit der Versand nachvollziehbar
bleibt. Absender-Adresse, Reply-To und der Regel-Rückverweis werden identisch
zum Produktivpfad aufgebaut; unterschiedlich ist nur der Betreff (`[Testmail]`-
Prefix) und der Empfänger.

Ohne konfigurierten `RESEND_API_KEY` läuft alles über den `log`-Provider — die
Mail wird nicht wirklich zugestellt, aber `sent_emails.provider = 'log'` und die
Server-Konsole zeigt die vollständigen Metadaten. Ein `sent`-Status im Log
bedeutet dann „an den Provider übergeben", nicht „im Postfach angekommen".
Erfordert die Permission `automations.manage`.

### E-Mail-Log

`/settings/emails` zeigt die letzten 100 ausgehenden Transaktions-Mails des
Mandanten. Aufgeführt sind Rechnungs- und Angebots-Mails (Bereich verlinkt zurück
auf den Beleg) sowie Automatisierungs-Mails inklusive der manuellen Testsends.
Filter für Status (`queued` / `sent` / `failed`) und Bereich (Rechnung / Angebot /
Automatisierung) helfen beim Nachvollziehen von Zustellproblemen.

Zugriff hat, wer **`billing.view`** oder **`automations.manage`** besitzt — die
Route greift per Service-Client auf `sent_emails` zu und deckt so beide Nutzer-
gruppen ab, obwohl die RLS-Policy der Tabelle nur `billing.view` kennt (siehe
`supabase/migrations/20260803001600_sent_emails.sql`). Nav-Sichtbarkeit ist an
`billing.view` gebunden; Automations-Manager ohne Billing-Rechte erreichen die
Seite über den Direktlink.

Aus Datenschutzgründen wird kein Nachrichteninhalt gespeichert — nur Metadaten
(Empfänger, Betreff, Provider, `body_hash`, Status). `DELETE` auf `sent_emails`
ist per Policy verboten, das Log ist immutable.

Ein Klick auf den Zeitstempel öffnet `/settings/emails/[id]` mit der Vollansicht
eines Vorgangs: alle Empfänger (inkl. CC), Anhänge-Namen, Provider-Message-ID
(für Zustell-Tracking), `body_hash` (Integritätsnachweis) sowie bei `failed`-
Status die komplette Fehlermeldung im Klartext. Zugriffsregeln identisch zur
Log-Übersicht.

## Push-Benachrichtigungen

Web-Push (VAPID) zusätzlich zu In-App-Bell und E-Mail. Jede über
`createNotification` oder die Rules-Engine erzeugte Notification löst
best-effort einen Push an alle Geräte des Empfängers aus — ungültige
Subscriptions (HTTP 404/410) werden automatisch aus der DB entfernt.

### Setup

VAPID-Schlüssel einmalig erzeugen und in `.env.local` eintragen (analog Prod):

```bash
node -e "const w=require('web-push');const k=w.generateVAPIDKeys();console.log('NEXT_PUBLIC_VAPID_PUBLIC_KEY='+k.publicKey);console.log('VAPID_PRIVATE_KEY='+k.privateKey);"
```

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — im Client-Bundle sichtbar, dient dem Browser als Application-Server-Key.
- `VAPID_PRIVATE_KEY` — nur serverseitig, signiert den Push-Payload.
- `VAPID_SUBJECT` — `mailto:<admin@…>` (Provider-Vorgabe).

Ohne diese drei Variablen zeigt `/settings/notifications` einen entsprechenden
Hinweis; die App bleibt lauffähig.

### Nutzung

Jeder eingeloggte User öffnet **Einstellungen → Benachrichtigungen**, klickt
**Aktivieren** und bestätigt die Browser-Nachfrage. Ab da erscheinen alle
Notifications zusätzlich als System-Push. Pro Gerät ist eine eigene
Registrierung nötig; die Übersicht zeigt alle angemeldeten Geräte inkl.
letztem Zustellzeitpunkt und Fehlern.

- Service Worker: `public/sw.js` — zeigt Notification, öffnet auf Klick den `url`-Deep-Link.
- Server-Routes: `GET /api/push/vapid-key`, `POST /api/push/subscribe`, `DELETE /api/push/unsubscribe`.
- iOS/Safari: nur mit als PWA installierter App.

### Smoke-Test

```bash
node -r dotenv/config node_modules/tsx/dist/cli.mjs scripts/push-smoke.ts dotenv_config_path=.env.local
```

Prüft VAPID-Setup und den Cleanup-Pfad bei ungültigen Endpoints — hilft, ein
kaputtes Env vor dem ersten echten Push zu erkennen.

## QR-Codes für Objekte

Objekte, Schlüssel, Zähler, Fahrzeuge usw. bekommen einen QR-Code, den Hausmeister
am Objekt anbringen. Ein Scan öffnet auf dem Handy direkt die Detail-Seite
(nach Login).

- **Bild-Endpoint** (SVG, cache 1 h): `GET /api/qr/{type}/{id}` — Types:
  `property`, `unit`, `building`, `key`, `meter`, `vehicle`, `material`,
  `defect-report`, `work-order`.
- **Druck-Seite**: `/qr/{type}/{id}` — Titel + QR + Deep-Link, mit „Drucken"-Button
  und Print-freundlichen `@media print`-Styles.
- **Sammel-Druck**: `/qr/print?type={type}&ids={uuid,uuid,…}` — A4-Bogen mit
  15 Aufklebern pro Seite (3×5). Types: `property`, `key`, `meter`, `vehicle`.
  Cap: 60 IDs pro URL (≈ 4 Seiten). Fehlende oder gelöschte IDs werden übersprungen
  und oben rot ausgewiesen. Einstieg: „QR-Sammel-Druck"-Button in den Listen von
  Objekten, Schlüsseln und Zählern — nimmt die aktuell gefilterten ersten 60 IDs.
- **Einstiegs-Buttons**: „QR-Code" auf Detail-Seiten von Properties, Keys und
  Meters (weitere folgen bei Bedarf).

Die Deep-URL enthält `?src=qr` — nützlich für spätere Auswertungen, wo Nutzer
aus dem Feld auf die App zugreifen. Kein neuer DB-Layer nötig, keine
Migrationen — QR wird pro Request aus der Entity-ID generiert.

## Deployment

Ziel: `https://hausmeisterservice.vaydena.de` — Subdomain unter dem bestehenden vaydena-Hostinger-Paket.

- Server-Pfad: `/home/u424339903/domains/vaydena.de/public_html/hausmeisterservice`
- Hostinger-hPanel: Subdomain als **Node.js-Anwendung** konfigurieren (Node 22, Start `pnpm start`).
- Env-Variablen (v. a. `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_APP_URL=https://hausmeisterservice.vaydena.de`) im hPanel setzen — nie ins Repo.
- Auth-Cookie-Domain **nicht** auf `.vaydena.de` scopen, sonst kollidieren die Sessions mit der vaydena-Hauptanwendung.
- Git-Auto-Deploy analog vaydena einrichten.
- CI-Pipeline: install → typecheck → lint → build → unit-tests → migration-dry-run → E2E gegen preview.

## Konventionen

- Codesprache **Englisch**, UI-Sprache **Deutsch** (i18n-fähig, `de-DE` default).
- `Europe/Berlin`, EUR, `DD.MM.YYYY`.
- Datenbank: `snake_case` plural. Komponenten: `PascalCase`.
- Server-Actions statt Reload-Only-Mutations; TanStack Query für optimistische Updates.
- Jede Migration bringt RLS + RLS-Tests mit; ohne grüne RLS-Tests kein Merge.
- Kein „Coming Soon" — was im UI ist, funktioniert (`MASTER_PROMPT` §50).
