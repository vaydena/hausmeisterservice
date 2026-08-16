// @ts-check
import next from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * SPRINT 132 — BIS HIERHER HAT NICHTS DIESES PROJEKT GELINTET.
 *
 * Das Skript `pnpm lint` rief `next lint`. Next 16 hat den Befehl entfernt;
 * seither liest Next das Wort "lint" als Verzeichnisnamen und bricht ab mit
 * "Invalid project directory provided, no such directory: ...\lint" — Exit 1,
 * aber keine einzige geprueft Datei. Eine Konfigurationsdatei gab es dazu
 * ueberhaupt nicht: weder `eslint.config.*` noch `.eslintrc*`. Und die CI
 * rief `lint` nie auf (audit -> typecheck -> test -> build).
 *
 * Dieselbe Sorte Fehler wie im Rest dieser Woche: eine Pruefung, die nicht
 * fehlschlagen kann, weil sie gar nicht laeuft.
 *
 * ABGESCHALTETE REGELN STEHEN HIER MIT BEGRUENDUNG. Was nur an einzelnen
 * Stellen nicht passt, wird dort per `eslint-disable-next-line` mit Grund
 * entschuldigt — nicht global. Eine global abgeschaltete Regel findet nie
 * wieder etwas; ein Kommentar an der Fundstelle laesst sich beim Lesen
 * pruefen und faellt weg, sobald der Code sich aendert.
 */
const config = [
  {
    /**
     * Nur Erzeugtes. `.claude/worktrees/` steht drin, weil dort vollstaendige
     * Repo-Kopien samt eigenem `.next` liegen — ohne den Eintrag lintet ESLint
     * dieselben Dateien mehrfach und dazu fremde Build-Artefakte.
     */
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'node_modules/**',
      '.claude/worktrees/**',
      'playwright-report/**',
      'test-results/**',
      'coverage/**',
      'next-env.d.ts',
      'src/types/database.ts', // erzeugt von `supabase gen types`
      'public/sw.js', // Service Worker, laeuft ausserhalb des Bundles
    ],
  },
  ...next,
  ...nextTypescript,
  {
    rules: {
      /**
       * AUS. Die Regel verlangt `&quot;` statt `"` im JSX-Text. Diese
       * Anwendung ist durchgaengig deutsch und benutzt typografische
       * Anfuehrungszeichen („so") in AGB, Datenschutz, Hilfe und in
       * Erklaertexten der Oberflaeche — 21 Treffer, alle davon reiner
       * Fliesstext. React rendert sie korrekt; die Regel schuetzt hier vor
       * nichts und wuerde die Quelltexte der Rechtsseiten unlesbar machen.
       */
      'react/no-unescaped-entities': 'off',

      /**
       * AN, aber mit der Unterstrich-Konvention. `useActionState` gibt jeder
       * Action `(prevState, formData)` — Actions, die den Vorzustand nicht
       * brauchen, heissen die Parameter `_prev`/`_formData`. Das ist eine
       * bewusste Markierung, kein vergessener Code, und darf nicht als Fund
       * gemeldet werden. Alles ohne Unterstrich bleibt ein Fehler.
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    /**
     * `react-hooks/purity` AUS fuer Seiten und Layouts.
     *
     * Die Regel stammt vom React Compiler und verbietet unreine Aufrufe im
     * Render — richtig fuer Client-Komponenten, die React jederzeit erneut
     * rendern darf. Seiten und Layouts im App Router sind hier aber
     * ausnahmslos Server-Komponenten: sie laufen einmal pro Request. Ein
     * `Date.now()` darin ist nicht unrein, sondern genau die Frage "wie spaet
     * ist es bei diesem Request" — fuenf Fundstellen, alle davon
     * Ablauf-Pruefungen (abgelaufene Ankuendigung, MFA-Erinnerungs-Cooldown,
     * vergangener Termin).
     *
     * Die Ausnahme haengt an einer Tatsachenbehauptung: keine `page.tsx` und
     * keine `layout.tsx` unter `src/app/` traegt `'use client'`. Das ist
     * heute so (139 + 6 Dateien, alle geprueft) — aber nichts hindert jemanden
     * daran, das morgen zu aendern, und dann waere diese Zeile eine still
     * abgeschaltete Pruefung. `tests/server-components-are-server.test.ts`
     * haelt die Behauptung deshalb nach.
     */
    files: ['src/app/**/page.tsx', 'src/app/**/layout.tsx'],
    rules: {
      'react-hooks/purity': 'off',
    },
  },
];

export default config;
