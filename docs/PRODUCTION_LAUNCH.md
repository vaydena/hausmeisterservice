# Production-Launch-Checkliste

Diese Checkliste führt die manuellen Schritte auf, die Claude nicht
selbst ausführen kann, aber vor dem Live-Gang erledigt sein müssen.
Alles Codeseitige (Legal-Pages, CSP-Header, Proxy, Footer) ist bereits
umgesetzt — hier geht es um Konfiguration, Verträge und Deploy.

Reihenfolge ist nicht zufällig: Rechtliches muss VOR dem ersten
öffentlichen Zugriff stehen.

## 1. Firmendaten in `src/lib/legal/config.ts` eintragen

Alle mit `{PLATZHALTER}` markierten Felder ausfüllen:

- `company.name` — Firmenname (wie im HR eingetragen)
- `company.legalForm` — z. B. `"GmbH"`, `"UG (haftungsbeschränkt)"`, `"Einzelunternehmen"`
- `address.street` / `zip` / `city`
- `contact.email` / `contact.phone`
- `representative` — Geschäftsführung bzw. Inhaber
- `commercialRegister.court` + `commercialRegister.number` — HRB/HRA-Nummer, oder auf `null` setzen bei Einzelunternehmen ohne HR-Eintrag
- `vatId` — USt-IdNr nach §27a UStG, oder `null` bei Kleinunternehmen
- `supervisoryAuthority` — zuständige Datenschutz-Aufsichtsbehörde für den eigenen Standort (Standard: BayLDA für Bayern — bitte für den eigenen Standort anpassen; Übersicht unter https://www.bfdi.bund.de/DE/Fachthemen/Inhalte/Europa-Internationales/Europa/DSGVO/Aufsichtsbehoerden-Bundeslaender.html)
- `jurisdiction` — Ort des zuständigen Amtsgerichts
- `lastUpdated` — aktualisieren, wenn Inhalte inhaltlich geändert werden

Optional:
- `company.tradeName` — abweichender Handelsname
- `dataProtectionOfficer` — nur nötig bei >20 Beschäftigten mit regelmäßigem Bezug zu personenbezogenen Daten
- `editorialResponsible` — nur bei journalistisch-redaktionellen Inhalten

**Anwaltliche Prüfung**: Die drei Vorlagen sind DSGVO-konform strukturiert, ersetzen aber keine anwaltliche Prüfung im Einzelfall. Vor Live-Gang durch Fachanwalt für IT-Recht/Datenschutz gegenprüfen lassen.

## 2. Auftragsverarbeitungsvertrag (AVV) mit Supabase abschließen

**Pflicht nach Art. 28 DSGVO** — ohne AVV ist die Nutzung von Supabase für personenbezogene Daten rechtswidrig.

1. Bei Supabase eingeloggt sein
2. Auf https://supabase.com/legal/dpa den AVV / Data Processing Agreement herunterladen
3. Firmendaten eintragen, unterschreiben, an Supabase zurücksenden (E-Mail-Adresse steht im Dokument)
4. Bestätigung ablegen (in Ordner "Verträge & Datenschutz")

Falls **Resend** aktiv genutzt wird (Umgebungsvariable `RESEND_API_KEY` gesetzt):
5. Analog AVV mit Resend: https://resend.com/legal/dpa

Falls **Hostinger** für Hosting genutzt wird (siehe unten Schritt 5): Hostinger-AVV im Kundenpanel unter "Rechtliche Vereinbarungen" akzeptieren.

## 3. Supabase Auth-Härtung

Im Supabase Dashboard des Projekts `hausmeisterservice`:

**Auth → Password Protection → Enabled Password Protection**
Toggle einschalten. Aktiviert den Abgleich neuer Passwörter gegen die HaveIBeenPwned-Datenbank kompromittierter Zugangsdaten. Nutzer bekommen bei Registrierung/Änderung eine Fehlermeldung, wenn sie ein bekanntes kompromittiertes Passwort verwenden.

**Prüfung**: Nach dem Umlegen erscheint die Warnung im Advisor `auth_leaked_password_protection` nicht mehr — kurz mit dem MCP-Advisor-Check verifizieren.

## 3.5 Supabase Auth-Redirect-URLs für Self-Signup

Der Self-Signup-Flow (siehe README-Sektion "Self-Signup neuer Mandanten")
schickt Bestätigungs-E-Mails mit einem Link zurück auf `/auth/callback`.
Supabase lässt diese Redirects nur zu, wenn die Ziel-Origin in den
Allowed-URLs eingetragen ist — sonst schlägt der Verify fehl mit
`redirect_to is not allowed`.

Im Supabase-Dashboard des Projekts `hausmeisterservice`:

**Authentication → URL Configuration**

- **Site URL**: `https://hausmeisterservice.vaydena.de`
- **Redirect URLs** (Additional): Zeile hinzufügen mit
  `https://hausmeisterservice.vaydena.de/auth/callback`

Für lokale Entwicklung parallel zulassen:
`http://localhost:3001/auth/callback` (Port ist der lokale Dev-Port).

**Optional aber empfohlen**: Auth → Email Templates → **Confirm signup** — dort
den deutschen Betreff/Text auf die Marke anpassen, z. B. „Ihr Konto bei
Hausmeisterservice bestätigen". Der `{{ .ConfirmationURL }}`-Platzhalter im
Template bleibt unverändert.

## 3.6 Supabase: Schema `platform` über die API freigeben

**Ohne diesen Schritt ist der halbe Betrieb tot** — und zwar lautlos.

Die Plattform-Ebene (Tarife, Plattform-Rechnungen, Plattform-Admins) liegt im
Postgres-Schema `platform`. PostgREST — die REST-Schicht, über die
`supabase-js` **jede** Abfrage schickt — bedient aber nur Schemas, die
ausdrücklich freigegeben sind. Ab Werk sind das `public` und
`graphql_public`. Jede Abfrage gegen `platform` scheitert deshalb mit:

```
PGRST106 — Invalid schema: platform
Only the following schemas are exposed: public, graphql_public
```

Das gilt auch für den Service-Role-Key: der umgeht RLS, nicht die
Schema-Freigabe. Betroffen sind `/preise` (zeigt dann keinen einzigen
Tarif und keinen Signup-Button), der komplette `/platform`-Bereich,
Einstellungen→Abo, der Plattform-Rechnungs-PDF und die Feature-Gates.

Im Supabase-Dashboard des Projekts `hausmeisterservice`:

**Project Settings → API → Exposed schemas**

- `platform` zur Liste hinzufügen.
- `public` bleibt an **erster** Stelle: die Reihenfolge bestimmt das
  Default-Profile. `public.invoices` (Kundenrechnungen der Agentur) und
  `platform.invoices` (Plattform-Rechnungen an die Agentur) heißen gleich —
  steht `platform` vorn, greifen bestehende Abfragen ins falsche Schema.

**Prüfung**: `/preise` im Browser öffnen — es müssen drei Tarifkarten mit
Preisen und je einem „14 Tage kostenlos testen"-Button stehen. Ein curl
reicht hier nicht: Hostinger antwortet auf HTML-Routen mit einer
Bot-Prüfseite, ein HTTP 200 sagt also nichts über den Inhalt.

Sicherheitslage nach der Freigabe (Stand Sprint 116): RLS ist auf allen drei
Tabellen aktiv. `anon` darf ausschließlich öffentliche Tarife lesen,
`authenticated` zusätzlich die eigene Admin-Zeile und die Rechnungen des
eigenen Mandanten. Schreibrechte hat kein Client — der letzte verbliebene
Schreibpfad (`INSERT` auf `platform.invoices`) wurde in Migration
`20260816090000_platform_invoices_revoke_client_insert.sql` entzogen.

## 4. Sentry einrichten (Runtime-Error-Tracking)

Sentry fängt unbehandelte Fehler auf Client, Server und Edge ein.
Ohne DSN läuft die App normal weiter — Sentry ist dann komplett aus.

1. Konto auf https://sentry.io anlegen (Free-Tier: 5.000 Errors/Monat, 10k Performance-Events)
2. Neues Projekt anlegen: **Platform „Next.js"**, Name z. B. `hausmeisterservice`
3. Nach dem Anlegen zeigt Sentry einen DSN — sieht ungefähr so aus:
   `https://<publicKey>@o<orgId>.ingest.us.sentry.io/<projectId>`
4. In Hostinger unter **Websites → hausmeisterservice.vaydena.de → Node.js → Environment-Variablen** setzen:
   - `NEXT_PUBLIC_SENTRY_DSN=<DSN aus Schritt 3>`
   - `SENTRY_DSN=<gleicher DSN>` *(Server-side)*
5. Für **Source-Map-Upload beim Build** (optional, aber sehr empfohlen — sonst zeigt Sentry nur minifizierten Code): Sentry-Dashboard → **Settings → Account → API → Auth Tokens** → neues Token `project:releases` + `project:write` erstellen. Dann setzen:
   - `SENTRY_ORG=<Slug der Sentry-Organisation>`
   - `SENTRY_PROJECT=hausmeisterservice`
   - `SENTRY_AUTH_TOKEN=<Auth-Token>` *(niemals in Git!)*
6. Optional AVV mit Sentry: https://sentry.io/legal/dpa/ (relevant, da Sentry personenbezogene Daten wie IP-Adressen indirekt verarbeiten kann — auch wenn wir `sendDefaultPii: false` gesetzt haben).
7. Prüfung nach Deploy: In der App bewusst einen Fehler auslösen (z. B. `throw new Error('sentry-smoke-test')` in einer Test-Route) → in Sentry sollte er innerhalb ~30 Sekunden erscheinen.

**DSGVO-Konformität**: Server- und Client-Config setzen `sendDefaultPii: false`, sodass IP-Adressen, User-Agents und Cookies nicht mitgeschickt werden. Der Sentry-Prozessor-Eintrag in `src/app/(legal)/datenschutz/page.tsx` erscheint automatisch, sobald `SENTRY_DSN` bzw. `NEXT_PUBLIC_SENTRY_DSN` gesetzt ist (Rechtsgrundlage Art. 6 Abs. 1 lit. f DSGVO — berechtigtes Interesse an Systemstabilität, USA-Übertragung via EU-Standardvertragsklauseln).

## 5. Git-Repository anlegen und mit GitHub verknüpfen

Aktuell hat das lokale Repo keinen Remote. Für den Hostinger-Git-Auto-Deploy braucht es einen Remote (empfohlen: privates GitHub-Repo).

```bash
# Im GitHub-UI ein privates Repo "hausmeisterservice" anlegen (leer, kein README).
# Dann lokal:
git remote add origin git@github.com:<GITHUB-USERNAME>/hausmeisterservice.git
git branch -M main
git push -u origin main
```

Nach dem ersten Push läuft automatisch der CI-Workflow unter `.github/workflows/ci.yml` (TypeCheck + Vitest + Build) auf jedem Push und PR gegen `main` — kein weiteres Setup nötig.

## 6. Hostinger-Deploy einrichten

Ziel-Subdomain: `hausmeisterservice.vaydena.de`
Ziel-Pfad: `/home/u424339903/domains/vaydena.de/public_html/hausmeisterservice`

1. Hostinger-Panel → Domains → vaydena.de → Subdomain `hausmeisterservice` anlegen
2. Hostinger-Panel → Websites → hausmeisterservice.vaydena.de → **Node.js aktivieren** (Version 22)
3. Hostinger-Panel → Git → Repository verknüpfen (GitHub-Repo aus Schritt 5, Branch `main`)
4. Deploy-Skript in Hostinger einstellen:
   ```
   pnpm install --frozen-lockfile
   pnpm build
   pnpm start
   ```
5. **Environment-Variablen im Hostinger-Panel** (nicht in `.env.local` — die Datei wird nicht deployed) setzen — Werte aus dem lokalen `.env.local` übertragen:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `NEXT_PUBLIC_APP_URL=https://hausmeisterservice.vaydena.de`
   - `NEXT_PUBLIC_APP_NAME`
   - `SUPABASE_SERVICE_ROLE_KEY` *(niemals in Git!)*
   - `SUPABASE_JWT_SECRET`
   - `VAPID_PRIVATE_KEY`
   - `RESEND_API_KEY` (falls E-Mail-Versand über Resend)
   - `AUTOMATION_CRON_SECRET`
   - `NODE_ENV=production`
   - Aus Schritt 4 (Sentry, wenn aktiviert): `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`
6. SSL/TLS für die Subdomain im Hostinger-Panel aktivieren (Let's Encrypt).
7. Ersten Deploy auslösen (Push auf `main`), Logs beobachten.
8. Smoke-Test: `https://hausmeisterservice.vaydena.de/impressum` erreichbar? Login funktioniert?

## 7. Verifikations-Checks nach dem ersten Deploy

Nach erfolgreichem Deploy im Browser prüfen:

- [ ] `/impressum` — alle Platzhalter ersetzt, keine `{FIRMENNAME}` sichtbar
- [ ] `/datenschutz` — Aufsichtsbehörde für eigenen Standort korrekt
- [ ] `/agb` — Gerichtsstand korrekt
- [ ] Login-Screen zeigt Impressum/Datenschutz/AGB-Links im Footer
- [ ] Response-Header via `curl -I https://hausmeisterservice.vaydena.de` enthält:
  - `Content-Security-Policy: default-src 'self'; ...`
  - `Strict-Transport-Security: max-age=31536000`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
- [ ] Browser-DevTools-Konsole zeigt keine CSP-Violations
- [ ] Alle bisherigen Features (Dashboard, Login, Formulare, PDF-Download) funktionieren mit aktivierter CSP
- [ ] Sentry (wenn aktiviert): Testfehler wird innerhalb 30 s im Sentry-Dashboard sichtbar

## 8. Impressum-Meldung (nur Info)

Nach Live-Gang keine gesonderte Anmeldung nötig. Bei Änderungen am Impressum (Umzug, neuer Geschäftsführer, neue USt-IdNr) → `src/lib/legal/config.ts` aktualisieren, `lastUpdated` hochzählen, Deploy.

## 9. Laufende Kontrolle: die zwei Health-Endpunkte

Beide sind absichtlich unauthentifiziert — ein Monitor führt keine Zugangsdaten mit. Beide geben deshalb nur Konstanten aus, nie Fehlermeldungen oder Serverpfade.

**`/api/health` — läuft der Server überhaupt?** Flach und billig, für den Minutentakt. Enthält `build.sha`; damit lässt sich nach jedem Push prüfen, ob der Deploy wirklich durch ist:

```bash
curl -s https://hausmeisterservice.vaydena.de/api/health
```

Stimmt `build.sha` nicht mit `git rev-parse --short=12 HEAD` überein, läuft draußen noch der alte Stand — dann ist jede weitere Fehlersuche am falschen Code.

**`/api/health/deep` — kann der Server auch arbeiten?** Kodiert ein winziges Bild und antwortet **503**, wenn das misslingt. Ein Monitor braucht dafür kein JSON zu lesen.

```bash
curl -s https://hausmeisterservice.vaydena.de/api/health/deep
```

Warum es diesen zweiten Endpunkt gibt: Der Bild-Upload kann ausfallen, ohne dass irgendwo ein roter Punkt angeht — die Meldung eines Bewohners kommt an, nur das Foto fehlt still. Ein Ausfall, den nur der Melder sieht und der Betreiber nie, läuft unbegrenzt lange weiter.

Antwort im Fehlerfall lesen:

| Befund | Bedeutung | Was zu tun ist |
| --- | --- | --- |
| `ok: true` | Bildverarbeitung arbeitet. | Nichts. |
| `stage: "load"`, `sharpPresent: false` | Nicht einmal `sharp` selbst liegt im `node_modules` des Servers. | Der Deploy hat die Abhängigkeiten nicht (vollständig) installiert. Install-Schritt prüfen. |
| `stage: "load"`, `present: false` | `sharp` ist da, das native Paket aus `binary.expected` fehlt daneben. | Genau dieses Paket nachinstallieren lassen — es ist eine *optionale* Abhängigkeit von sharp und wird von manchen Install-Läufen übersprungen. |
| `stage: "load"`, `libvips.present: false` | Wrapper da, die eigentliche Bildbibliothek fehlt. | `libvips.expected` nachinstallieren. Das ist eine optionale Abhängigkeit **einer optionalen Abhängigkeit** — der häufigste Grund, warum ein Install „durchläuft" und sharp trotzdem nicht startet. |
| `stage: "load"`, alles `true` | Alle Pakete liegen da, das Laden scheitert trotzdem — meist fehlende Systembibliotheken oder eine unpassende glibc-Version. | Hostinger-Support mit `binary.expected` und `code` anfragen. |
| `stage: "encode"` | Modul lädt, das Kodieren scheitert — Format-Backend fehlt. | Wie oben, mit dem Hinweis, dass libvips unvollständig gebaut ist. |

`libvips: null` heißt **nicht** „fehlt", sondern „gibt es auf dieser Plattform nicht einzeln" — unter Windows steckt libvips im Plattform-Paket.

`code: "UNKNOWN"` ist kein Fehler des Endpunkts: findet sharp kein passendes Binary, wirft es einen eigenen Fehler ohne maschinenlesbaren Code. Genau dafür gibt es den `binary`-Block.

**Solange `/api/health/deep` rot ist:** Fotos und Dokumenten-Uploads werden abgelehnt, nicht etwa ungefiltert gespeichert. Das ist Absicht — das Neu-Kodieren ist der einzige Grund, warum aus einem Wohnungsfoto keine GPS-Koordinate der Wohnung wird. Meldungen ohne Foto funktionieren normal weiter.
