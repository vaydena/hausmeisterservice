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

Im Supabase Dashboard des Projekts `hausmeister-app`:

**Auth → Password Protection → Enabled Password Protection**
Toggle einschalten. Aktiviert den Abgleich neuer Passwörter gegen die HaveIBeenPwned-Datenbank kompromittierter Zugangsdaten. Nutzer bekommen bei Registrierung/Änderung eine Fehlermeldung, wenn sie ein bekanntes kompromittiertes Passwort verwenden.

**Prüfung**: Nach dem Umlegen erscheint die Warnung im Advisor `auth_leaked_password_protection` nicht mehr — kurz mit dem MCP-Advisor-Check verifizieren.

## 4. Git-Repository anlegen und mit GitHub verknüpfen

Aktuell hat das lokale Repo keinen Remote. Für den Hostinger-Git-Auto-Deploy braucht es einen Remote (empfohlen: privates GitHub-Repo).

```bash
# Im GitHub-UI ein privates Repo "hausmeister-app" anlegen (leer, kein README).
# Dann lokal:
git remote add origin git@github.com:<GITHUB-USERNAME>/hausmeister-app.git
git branch -M main
git push -u origin main
```

Danach in GitHub unter Settings → Secrets and variables → Actions die Deploy-Secrets hinterlegen (falls CI später ergänzt wird).

## 5. Hostinger-Deploy einrichten

Ziel-Subdomain: `hausmeisterservice.vaydena.de`
Ziel-Pfad: `/home/u424339903/domains/vaydena.de/public_html/hausmeisterservice`

1. Hostinger-Panel → Domains → vaydena.de → Subdomain `hausmeisterservice` anlegen
2. Hostinger-Panel → Websites → hausmeisterservice.vaydena.de → **Node.js aktivieren** (Version 22)
3. Hostinger-Panel → Git → Repository verknüpfen (GitHub-Repo aus Schritt 4, Branch `main`)
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
6. SSL/TLS für die Subdomain im Hostinger-Panel aktivieren (Let's Encrypt).
7. Ersten Deploy auslösen (Push auf `main`), Logs beobachten.
8. Smoke-Test: `https://hausmeisterservice.vaydena.de/impressum` erreichbar? Login funktioniert?

## 6. Verifikations-Checks nach dem ersten Deploy

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

## 7. Impressum-Meldung (nur Info)

Nach Live-Gang keine gesonderte Anmeldung nötig. Bei Änderungen am Impressum (Umzug, neuer Geschäftsführer, neue USt-IdNr) → `src/lib/legal/config.ts` aktualisieren, `lastUpdated` hochzählen, Deploy.
