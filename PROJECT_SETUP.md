# Projekt-Setup — Hausmeisterservice

Ergänzung zu `MASTER_PROMPT.md`. Regelt Tech-Stack und Infrastruktur-Entscheidungen, damit die Umsetzung nicht bei Grundsatzfragen ins Stocken gerät.

## Tech-Stack (festgelegt)

Analog zum Vaydena-Projekt (Arbeitszeiterfassung):

- **Framework:** Next.js (aktuelle Version, App Router)
- **Sprache:** TypeScript
- **Backend/DB:** Supabase (Postgres + Auth + Storage + Realtime + Edge Functions)
- **Auth:** Supabase Auth
- **Datei-/Fotoablage:** Supabase Storage
- **Multi-Tenant-Isolation:** Row Level Security (RLS) mit `tenant_id`-Spalte auf jeder Tabelle
- **Styling:** Tailwind CSS
- **UI-Bausteine:** shadcn/ui als Basis (frei kombinierbar, gute Dark-Mode-Unterstützung)
- **Icons:** lucide-react
- **Forms/Validation:** react-hook-form + zod
- **State/Data:** TanStack Query (Server-State) + Server Actions wo sinnvoll
- **Karten (§16, §17):** MapLibre GL + OpenStreetMap-Tiles (keine Google-Maps-Kosten, DSGVO-freundlich)
- **PDF (§13, §25, §28):** `@react-pdf/renderer` oder `pdfmake`
- **Charts (§29):** Recharts
- **Testing:** Vitest (Unit) + Playwright (E2E) für kritische Flows
- **Deployment:** Hostinger mit Git-Auto-Deploy (wie vaydena.de)

## Mobile / Offline-Strategie

- **Primär: PWA** — Next.js liefert es mit, Service Worker via `next-pwa` oder eigenem SW, IndexedDB (z. B. `idb` oder `dexie`) für Offline-Daten (§35).
- Kein Capacitor/Expo im ersten Wurf. Push-Notifications gehen über Web Push (VAPID); native Apps können später gewrappt werden, wenn die App-Store-Präsenz relevant wird.
- Kamera/Geräte-Features über Web-APIs (`getUserMedia`, Geolocation, File-Input mit `capture`).

## Supabase-Projekt

- **Neues, eigenständiges Supabase-Projekt** für die Hausmeister-App anlegen (nicht mit Vaydena teilen — sauberere Trennung von Backups, RLS-Policies, Kosten).
- Region: Frankfurt (wie Vaydena, DSGVO/EU).
- Umgebungen: mindestens `dev` (lokal, evtl. via Supabase CLI) und `prod`. `staging` optional, sobald sinnvoll.
- Zugriff via Supabase MCP-Tools ist möglich — für erste Analyse `list_projects`/`list_tables` nutzen, für Schema-Änderungen `apply_migration`.

## Konventionen

- Codesprache: **Englisch** (Bezeichner, Datei-/Ordnernamen, Kommentare).
- UI-Sprache: **Deutsch** (i18n-fähig aufbauen, aber `de-DE` als Default und aktuell einzige Sprache).
- Zeitzone: `Europe/Berlin`.
- Währung: EUR.
- Datumsformat: `DD.MM.YYYY`.
- Datenbanknamen: `snake_case`, Plural (`work_orders`, `properties`, …).
- Frontend-Komponenten: `PascalCase`, kleine, komponierbare Bausteine.
- Kein Reload-Only — mutations immer via Server Actions oder Supabase-Client mit optimistischen Updates via TanStack Query.

## Sicherheits-/DSGVO-Leitplanken (§33)

- RLS auf **allen** Datentabellen — kein Fallback ohne Policy.
- Service-Role-Key **nur** serverseitig (nie im Client-Bundle).
- Audit-Log (§32) als eigene Tabelle, wird via DB-Trigger oder Service-Layer gefüllt.
- GPS-Positionen (§17): opt-in pro Mitarbeiter, Rohdaten mit Aufbewahrungsfrist (z. B. 90 Tage), Aggregation danach.
- Foto-Uploads: Storage-Buckets pro Tenant mit RLS-Policies, EXIF-Stripping bei Bewohner-Uploads.
- Rate Limiting via Middleware auf sensitiven Endpoints (Login, Meldung, Foto-Upload).

## Deployment / CI

- **Ziel-URL:** `https://hausmeisterservice.vaydena.de` (Subdomain unter dem bestehenden vaydena-Hostinger-Paket).
- **Server-Pfad:** `/home/u424339903/domains/vaydena.de/public_html/hausmeisterservice` (Hostinger).
- Git-Repo lokal init'en → GitHub → Hostinger Git-Deploy in das Subdomain-Verzeichnis (analog Vaydena).
- Environment-Variablen in Hostinger (hPanel → Website → Node.js), `.env.example` im Repo, `.env.local` in `.gitignore`.
- `NEXT_PUBLIC_APP_URL=https://hausmeisterservice.vaydena.de` in Produktions-Env setzen.
- Node-Version pinnen (`.nvmrc`), Lock-File committen.
- Migrationen via Supabase CLI (`supabase/migrations/*.sql`), niemals nur über Studio.

**Node.js bei Hostinger:** Die Subdomain muss im hPanel als **Node.js-Anwendung** konfiguriert werden (nicht als statisches PHP-Verzeichnis) — Startskript `pnpm start`, Node-Version 22. Ohne Node.js-Setup läuft nur ein statischer Export, was für diese App wegen Server Actions/SSR nicht ausreicht.

**Cookie-Domain:** Auth-Cookies **nicht** auf `.vaydena.de` scopen (würde Sessions mit dem vaydena-Hauptprojekt vermischen). Standard-Cookie ohne `Domain`-Attribut bleibt auf `hausmeisterservice.vaydena.de` gebunden — genau das wollen wir.

## Reihenfolge (verweist auf `MASTER_PROMPT.md` §47)

Phase 1 (Analyse) → Phase 2 (Architektur & Datenmodell) → Phase 3 (Auth/Rollen/Tenants/Dashboard/Objekte/Mitarbeiter/Aufträge) → … → Phase 8 (Feinschliff).

**Vor Phase 3 abgestimmte Entscheidungen** (2026-08-01):
- Demo-Tenant-Name: **Hausmeisterservice**
- Hosting: **bestehendes Hostinger-Paket der vaydena.de**, Subdomain `hausmeisterservice.vaydena.de`
- Deploy-Verzeichnis: `/home/u424339903/domains/vaydena.de/public_html/hausmeisterservice`
