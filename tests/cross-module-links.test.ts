import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { moduleForPath } from '@/lib/modules/module-map';
import type { ModuleKey } from '@/lib/modules/registry';

/**
 * Sprint 119: Links auf ein fremdes Modul.
 *
 * Sprint 117 hat abgeschaltete Module wirklich abgeschaltet — die Route
 * antwortet seither mit 404. Damit wurde jeder Link, der von einer Seite auf
 * ein ANDERES Modul zeigt, zur Sackgasse. Ein Scan fand 30 solcher Stellen:
 * die Auftragsdetailseite verlinkt das Objekt, der Materialbericht das
 * Material, die Tour das Fahrzeug.
 *
 * Der Fehler ist besonders unangenehm, weil er nicht dort entsteht, wo er
 * auffaellt: wer `qr_codes` abschaltet, erwartet Folgen im QR-Bereich — nicht
 * einen toten Knopf auf der Schluesselseite. Und er waechst mit: jede neue
 * Detailseite, die ein Nachbarmodul verlinkt, bringt eine neue Sackgasse mit.
 *
 * Deshalb prueft dieser Test die Regel statt der Einzelfaelle: ein `href`, das
 * auf ein fremdes Modul zeigt, geht durch `ModuleLink` (Text bleibt, Link
 * faellt weg) oder steht in einem `ModuleGate` (verschwindet mit dem Modul).
 */

const APP_DIR = join(process.cwd(), 'src', 'app', '(app)');

/**
 * Dateien, die ihre fremden Links auf anderem Weg absichern.
 *
 * Kein Sammelbecken: jeder Eintrag nennt den Mechanismus, der stattdessen
 * greift. Wer hier etwas eintraegt, ohne einen zu haben, baut die Sackgasse
 * wieder ein, die dieser Sprint beseitigt hat.
 */
const ALTERNATIVE_GUARD: Record<string, string> = {
  'hilfe/page.tsx':
    'Gated auf Ebene der FAQ-Antwort (FaqItem.topic), nicht des Links. Eine Antwort ' +
    'zu einem abgeschalteten Modul soll ganz verschwinden — ein entlinkter Satz ' +
    'wuerde eine Funktion beschreiben, die dieser Mandant nicht hat.',
};

interface Finding {
  file: string;
  line: number;
  href: string;
  ownModule: ModuleKey | null;
  targetModule: ModuleKey;
  guarded: boolean;
}

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Route der Datei = Verzeichnis unter (app), Route-Groups herausgerechnet. */
function routeOfFile(file: string): string {
  const segments = relative(APP_DIR, file)
    .split(sep)
    .slice(0, -1)
    .filter((s) => s.length > 0 && !s.startsWith('('));
  return `/${segments.join('/')}`;
}

/**
 * `href="..."`, `href={\`...\`}`, `href={'...'}`. Template-Platzhalter werden
 * durch ein Segment ersetzt — fuer `moduleForPath` zaehlt nur das Praefix.
 */
const HREF = /href=(?:"([^"]+)"|\{`([^`]+)`\}|\{'([^']+)'\})/g;

function scan(): Finding[] {
  const findings: Finding[] = [];
  for (const file of collectFiles(APP_DIR)) {
    const ownModule = moduleForPath(routeOfFile(file));
    const lines = readFileSync(file, 'utf8').split('\n');
    let gateDepth = 0;

    lines.forEach((line, index) => {
      // Zeilenweise Klammerzaehlung statt echtem Parser: `<ModuleGate ...>`
      // und `</ModuleGate>` stehen in diesem Repo immer auf eigenen Zeilen,
      // und ein Fehler faellt in die sichere Richtung (Test schlaegt an).
      const insideGate = gateDepth > 0;
      gateDepth +=
        (line.match(/<ModuleGate\b/g) ?? []).length - (line.match(/<\/ModuleGate>/g) ?? []).length;

      for (const match of line.matchAll(HREF)) {
        const raw = match[1] ?? match[2] ?? match[3] ?? '';
        if (!raw.startsWith('/')) continue; // mailto:, tel:, externe URLs
        const targetModule = moduleForPath(raw.replace(/\$\{[^}]*\}/g, 'x'));
        if (!targetModule || targetModule === ownModule) continue;

        // Das oeffnende Tag steht bei mehrzeiligen Props ueber dem href.
        let element = '?';
        for (let j = index; j >= 0 && j > index - 6; j--) {
          const tags = lines[j]?.match(/<([A-Za-z][\w.]*)/g);
          if (tags) {
            element = tags[tags.length - 1]!.slice(1);
            break;
          }
        }

        findings.push({
          file: relative(APP_DIR, file).split(sep).join('/'),
          line: index + 1,
          href: raw,
          ownModule,
          targetModule,
          guarded: insideGate || element === 'ModuleLink' || element === 'ModuleGate',
        });
      }
    });
  }
  return findings;
}

const FINDINGS = scan();

describe('Links auf fremde Module', () => {
  it('sanity: der Scan findet ueberhaupt modulfremde Links', () => {
    // Faellt der Regex still aus, wuerde dieser Test grün bleiben und nichts
    // mehr bewachen — genau das Muster, das dieses Repo schon zweimal
    // eingefangen hat (features.ts ohne Importe, isModuleEnabled ohne Aufrufer).
    expect(FINDINGS.length).toBeGreaterThan(20);
    expect(new Set(FINDINGS.map((f) => f.file)).size).toBeGreaterThan(10);
  });

  it('jeder modulfremde Link geht durch ModuleLink oder ModuleGate', () => {
    const open = FINDINGS.filter((f) => !f.guarded && !(f.file in ALTERNATIVE_GUARD));
    const report = open
      .map(
        (f) =>
          `  src/app/(app)/${f.file}:${f.line} — ${f.ownModule ?? '(kein Modul)'} → ${f.targetModule}: ${f.href}`,
      )
      .join('\n');
    expect(
      open,
      `Diese Links zeigen auf ein fremdes Modul und fuehren ins 404, sobald der ` +
        `Mandant es abschaltet:\n${report}\n\n` +
        `Fix: <Link> durch <ModuleLink> ersetzen (Text bleibt stehen, nur der Link ` +
        `faellt weg), oder Buttons in <ModuleGate href="…"> wickeln. Beide leiten ` +
        `das Zielmodul aus dem href ab. In Client-Komponenten geht das nicht — dort ` +
        `gehoert die Pruefung in die Server-Elternkomponente.`,
    ).toEqual([]);
  });

  it('jeder Eintrag in ALTERNATIVE_GUARD hat noch einen Grund', () => {
    // Sonst verrottet die Liste: eine Datei, die laengst umgestellt ist, bleibt
    // als Ausnahme stehen und deckt spaeter einen echten neuen Fall zu.
    for (const file of Object.keys(ALTERNATIVE_GUARD)) {
      const found = FINDINGS.filter((f) => f.file === file);
      expect(
        found.length,
        `ALTERNATIVE_GUARD nennt "${file}", aber dort gibt es keinen modulfremden Link mehr. Eintrag entfernen.`,
      ).toBeGreaterThan(0);
      expect(
        found.some((f) => !f.guarded),
        `"${file}" nutzt inzwischen ueberall ModuleLink/ModuleGate. Die Ausnahme ist unnoetig geworden.`,
      ).toBe(true);
    }
  });
});

describe('ModuleLink leitet das Zielmodul aus dem href ab', () => {
  /**
   * Ein `module`-Prop waere eine zweite Wahrheit neben MODULE_PATHS. Der
   * Fehler faellt dann nicht auf: ein falsch benanntes Modul sieht einfach
   * immer verfuegbar aus, und der Link ist wieder eine Sackgasse.
   */
  const source = readFileSync(
    join(process.cwd(), 'src', 'components', 'ui', 'module-link.tsx'),
    'utf8',
  );

  it('nutzt moduleForPath und die tarifbereinigte Modulmenge', () => {
    expect(source).toMatch(/from '@\/lib\/modules\/module-map'/);
    expect(source).toContain('moduleForPath(href)');
    // isModuleAvailable, nicht der rohe Schalterzustand: sonst bleibt der Link
    // stehen, wenn der Tarif das Modul sperrt — und fuehrt ins 404.
    expect(source).toContain('isModuleAvailable');
    expect(source).not.toContain('isModuleEnabled');
  });

  it('nimmt kein Modul als Prop entgegen', () => {
    expect(source).not.toMatch(/\bmoduleKey\??:\s*ModuleKey/);
  });

  it('ist server-only — sonst laeuft die Pruefung im Browser ins Leere', () => {
    expect(source).toContain("import 'server-only'");
  });
});
