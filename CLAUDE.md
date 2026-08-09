# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Pflichtlektüre vor Code-Änderungen

- `MASTER_PROMPT.md` — 62 Produkt- und UX-Anforderungen (bindend). Bei Konflikten hat MASTER_PROMPT Vorrang.
- `PROJECT_SETUP.md` — Tech-Stack, Konventionen, Sicherheits-/DSGVO-Leitplanken, Deployment.
- `PLAN.md` — Architektur + Phasenplan. Änderungen am Datenmodell oder Berechtigungssystem gehen HIER rein, nicht in Ad-hoc-Commits.
- `README.md` — Quickstart + nächste Schritte.

## Häufig genutzte Befehle

```bash
pnpm dev --port 3001         # Dev-Server (NICHT 3000 — kollidiert mit vaydena)
pnpm typecheck               # tsc --noEmit; muss vor jedem Merge grün sein
pnpm lint                    # next lint
pnpm test                    # Vitest (Unit)
pnpm test:e2e                # Playwright (kritische Flows)
pnpm db:types                # Supabase → src/types/database.ts regenerieren
pnpm db:push                 # Migration nach Supabase (nur wenn CLI verlinkt)
pnpm seed                    # Demo-Seed via tsx supabase/seed/run.ts
```

`pnpm dev` startet Turbopack (Next 16 default). Kein separater `--turbo`-Flag nötig.

## Architektur-Grundpfeiler

### Multi-Tenant + RLS

Jede Datentabelle hat `tenant_id`. Zugriffsschutz läuft ausschließlich über Postgres-RLS mit Helper-Schema `app_auth`:

- `app_auth.current_tenant_id()` — liest `app_tenant_id` aus dem JWT-Claim (Server-Action setzt ihn nach Login).
- `app_auth.is_tenant_member(tid)` — Membership-Check.
- `app_auth.has_permission(key, scope_type, scope_id)` — feingranular. `scope_type` ist meist `'property'`, `scope_id` die property_id auf der Row.

**RLS-Pattern für property-scoped Tabellen** (siehe `supabase/migrations/20260802000300_defect_reports.sql` als Referenz):
- `select_own` (Reporter/Uploader sieht immer eigene Rows) + `select_permitted` (permission-basiert) als getrennte Policies — NICHT als OR in einer.
- `insert` prüft `tenant_id = current_tenant_id() AND has_permission(...create..., 'property', property_id)`.
- `update` prüft Rechte in `using` UND `with check` (identisch).
- Delete oft bewusst weggelassen → soft-delete via `deleted_at` oder Status-Feld statt DELETE.

Trigger und Funktionen laufen `security definer` mit `set search_path = ''` — Referenzen daher vollqualifiziert (`public.tabelle`, `auth.uid()`).

### Module + Permission Registry (Code-defined, nicht DB-defined)

- `src/lib/modules/registry.ts` = einzige Wahrheit für Module. `core: true` = immer an (nicht abschaltbar). Deaktivierte Module: 404, NICHT 403.
- `src/lib/permissions/registry.ts` = einzige Wahrheit für Permissions. Action-Verben sind fixed: `view/create/edit/delete/assign/close/approve/download/manage/view_others`. Neue Permission → nur wenn wirklich keine passt.
- `SYSTEM_ROLE_TEMPLATES` sind nur Startvorlagen fürs Onboarding; Rollen sind tenant-lokal editierbar (außer `superadmin`).
- Änderung am Registry braucht immer einen Permission-Sync-Run gegen Supabase (`supabase/seed/permissions.ts`), sonst greifen `has_permission`-Checks nicht.

### Auto-Codes via Postgres-Trigger

Menschenlesbare IDs (`P-NNN` Properties, `WO-YYYY-NNNN`, `DR-YYYY-NNNN`, `MP-YYYY-NNNN`, `CL-YYYY-NNNN`) werden **im Trigger** berechnet, NIE clientseitig. Insert setzt `code = null` (oder lässt das Feld leer) → BEFORE-INSERT-Trigger generiert. Trigger-Funktionen leben in `app_auth` und nutzen `now() at time zone 'Europe/Berlin'` fürs Jahr.

### Server Actions + friendlyDbMessage

Jede Mutation ist eine Server Action (`'use server'`). Konventionelles Fehlerhandling: jede Actions-Datei hat oben eine `friendlyDbMessage(msg)`-Funktion, die Postgres-Fehler in deutsche Nutzertexte übersetzt (`row-level security` → „Keine Berechtigung", `violates foreign key` → „Verweis ist ungültig", …). NIE roh throw eines Supabase-Errors — der Nutzer sieht das dann als React-Error-Boundary.

Validierung via `zod` in `src/lib/schemas/*.ts`. Action ruft `.safeParse(formData)` → bei Fehler `return { errors: … }` (mit `useActionState` im Client-Form). Bei Erfolg: `revalidatePath(...)` + evtl. `redirect(...)`.

### Snapshot-Pattern

`checklist_run_items` kopiert die Struktur von `checklist_template_items` beim Start des Runs. Wer Templates später ändert, beeinflusst laufende Runs NICHT. Das gleiche Prinzip gilt für zukünftige Reports/Rechnungen — Historie darf sich nicht ändern.

### Reorder via Two-Phase-Swap

Bei Tabellen mit `UNIQUE(parent_id, position)` (z.B. `checklist_template_items`) wird beim Vertauschen zweier Positionen die eine Row zuerst auf eine negative Parking-Position gesetzt, dann kommt der eigentliche Swap. Sonst UNIQUE-Verletzung. Siehe `moveItemAction` in `src/app/(app)/checklists/actions.ts`.

## Migrations-Reality

Die Wahrheit über das aktuelle Schema ist die Supabase-DB, nicht das lokale `supabase/migrations/`-Verzeichnis. Lokal fehlen mehrere ältere Migrationen (nur `20260801000000_init`, `20260801000100_harden_functions`, `20260802000000_domain_core`, `20260802000100_optimize_rls_policies`, `20260802000200_audit_log`, `20260802000300_defect_reports` sind als `.sql`-Files vorhanden), obwohl auf der DB alle bis `20260802000700` angewendet sind.

- Vor jeder neuen Migration erst `list_migrations` auf der DB abfragen.
- Neue Migration IMMER als `.sql` in `supabase/migrations/YYYYMMDDNNNNNN_name.sql` — die DB gilt aber trotzdem als Wahrheit.
- Nach jeder DDL: `pnpm db:types` und danach `get_advisors` gegen Supabase — Security- oder Performance-Lints müssen leer sein.

## Feste Konventionen (aus MASTER_PROMPT / PROJECT_SETUP)

- **Codesprache Englisch**, UI **Deutsch** (`de-DE`, `Europe/Berlin`, EUR, `DD.MM.YYYY`).
- **Kein „Coming Soon"** (§50 MASTER_PROMPT) — was in der UI/Nav sichtbar ist, muss funktionieren.
- **RLS auf ALLEN Datentabellen** — keine Fallback-Rows ohne Policy.
- **SUPABASE_SERVICE_ROLE_KEY** NIE im Client-Bundle — nur `src/lib/supabase/service.ts` darf ihn lesen; wird ausschließlich in Server-Actions/Route-Handlern importiert.
- **Auth-Cookie NICHT auf `.vaydena.de` scopen** — kollidiert mit vaydena-Hauptapp-Session.
- **GPS opt-in pro Mitarbeiter**, 90-Tage-Retention, EXIF-Strip bei Foto-Uploads (Bewohner-Uploads).
- **Keine technischen Fehlertexte an Endnutzer** — immer via friendlyDbMessage o. ä.

## Wichtige Fallstricke

- `typedRoutes: false` in `next.config.mjs` — kein Route-Cast bei `<Link href>` / `redirect()` nötig.
- Next.js 16 hat `proxy` statt `middleware` — beim Bearbeiten der Auth-Weiche darauf achten.
- `noUncheckedIndexedAccess` ist an (`tsconfig.json`) — Array-Access ist `T | undefined`, Optional-Chaining/Null-Checks überall.
- `@supabase/ssr 0.12.4` mit `PostgrestVersion: "14.15"` — bei Type-Regeneration nicht auf ältere Versionen zurückfallen lassen.
- Deploy-Ziel `https://hausmeisterservice.vaydena.de` (Node 22 via Hostinger hPanel-Node-App, nicht statisches Verzeichnis).

## Layout

- `src/app/(app)/…` = App-Routen mit Sidebar/Header/MobileNav-Shell (`layout.tsx`).
- `src/app/(auth)/…` = Auth-Layout (Login etc.).
- `src/lib/supabase/{browser,server,service}.ts` = drei Kontexte. Server-Actions immer `createSupabaseServerClient()`.
- `src/lib/tenant/current.ts` = `requireTenantContext()` — im Server-Code für User+Tenant.
- `src/lib/schemas/*.ts` = zod-Schemas + Enums/Labels pro Domäne.
- `src/app/(app)/<domain>/{actions.ts,page.tsx,new/,[id]/,[id]/edit/}` = Standard-Layout pro Feature.

## Auto-Memory (session-persistent, siehe `~/.claude/…/memory/MEMORY.md`)

Beim Weiterarbeiten am Roadmap-Backlog: NICHT nach jeder Phase nachfragen (`feedback_autonomous_continuation`) — sofort mit der nächsten Domäne aus `PLAN.md` weitermachen.
