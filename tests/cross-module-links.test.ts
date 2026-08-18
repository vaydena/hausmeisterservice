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

/**
 * Das oeffnende Tag zu einem `href`. Steht bei mehrzeiligen Props ueber der
 * Zeile, deshalb ein paar Zeilen rueckwaerts.
 */
function elementAt(lines: string[], index: number): string {
  for (let j = index; j >= 0 && j > index - 6; j--) {
    const tags = lines[j]?.match(/<([A-Za-z][\w.]*)/g);
    if (tags) return tags[tags.length - 1]!.slice(1);
  }
  return '?';
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
 * `href="..."`, `href={\`...\`}`, `href={'...'}` und — seit Sprint 121 — die
 * Objekt-Schreibweise `href: '...'`. Template-Platzhalter werden durch ein
 * Segment ersetzt; fuer `moduleForPath` zaehlt nur das Praefix.
 *
 * Die Objekt-Form fehlte und deckte einen echten Fall zu: das
 * Willkommens-Overlay hielt seine vier Schritte als `STEPS`-Tabelle mit
 * `href: '/properties/new'`. Zwei davon zeigen in abschaltbare Module, und
 * das ist der allererste Bildschirm, den ein neuer Mandant sieht.
 */
const HREF = /href(?:=(?:"([^"]+)"|\{`([^`]+)`\}|\{'([^']+)'\})|:\s*'([^']+)')/g;

/**
 * Sprint 121: `href={irgendeineVariable}` — ein Wert, den dieser Scan nicht
 * lesen kann.
 *
 * Das war die Luecke, mit der Sprint 119 ausgeliefert wurde: der Regex oben
 * trifft nur Literale. Fuenf Stellen zeigten ueber eine Hilfsfunktion auf ein
 * fremdes Modul und blieben unsichtbar — die Benachrichtigungs-Inbox, das
 * E-Mail-Log (Liste und Detail), der Automatisierungs-Lauf. Alle vier
 * verlinken einen Vorgang, den sie selbst nicht besitzen.
 *
 * Statisch aufloesen laesst sich so ein Wert nicht. Die Regel dreht deshalb
 * die Beweislast um: wer einen berechneten `href` rendert, nimmt `ModuleLink`
 * — dort faellt der Abgleich zur Laufzeit an, wo der Wert bekannt ist. Zeigt
 * der Pfad auf gar kein Modul, ist `ModuleLink` ein durchgereichtes `Link`,
 * kostet also nichts.
 *
 * Nur Server-Komponenten: `ModuleLink` ist `server-only`. In einer
 * Client-Komponente gehoert die Pruefung in die Server-Elternkomponente, die
 * den Wert hineinreicht — deshalb steht `dashboard/welcome-overlay.tsx` nicht
 * mehr auf einer eigenen Liste, sondern bekommt seine Schritte gefiltert.
 */
const COMPUTED_HREF = /href=\{(?!`|'|")([^}]+)\}/g;

/**
 * Berechnete hrefs, die kein `ModuleLink` brauchen — mit dem Grund.
 *
 * Kein Sammelbecken, gleiche Regel wie bei ALTERNATIVE_GUARD: jeder Eintrag
 * nennt den Mechanismus, der stattdessen greift. Fast alles hier ist ein
 * Abbrechen-Knopf — ein Formular unter `/vehicles/neu` kehrt nach `/vehicles`
 * zurueck. Das Ziel gehoert per Konstruktion zur eigenen Route, und waere sie
 * abgeschaltet, gaebe es das Formular nicht, aus dem der Nutzer abbricht.
 *
 * Grenze der Liste, ausdruecklich: ein Eintrag entschuldigt die GANZE Datei.
 * `notifications/page.tsx` steht wegen seiner Blaetter-Tabs drin — kaeme der
 * Link auf den Vorgang daneben auf `<Link>` zurueck, saehe dieser Block das
 * nicht. Auf Dateiebene laesst sich das statisch nicht trennen: beide heissen
 * `href={href}` und beide stehen in einem `<Link>`. Deshalb sind die vier
 * Fundstellen aus Sprint 121 zusaetzlich namentlich festgenagelt (unten).
 */
const COMPUTED_HREF_GUARD: Record<string, string> = {
  'announcements/announcement-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'billing/billing-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'checklists/template-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'defect-reports/report-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'keys/key-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'maintenance/plan-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'materials/material-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'messages/new-thread-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'meters/meter-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'people/employees/[id]/edit/edit-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'people/owners/owner-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'people/residents/resident-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'properties/property-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'schedule/entry-form.tsx': 'onCancelHref — zurueck zur eigenen Liste',
  'settings/users/roles/role-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'shifts/shift-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'time-tracking/entry-form.tsx': 'onCancelHref — zurueck zur eigenen Liste',
  'time-tracking/[id]/correction/correction-form.tsx': 'onCancelHref — zurueck zur eigenen Liste',
  'tours/tour-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'vehicles/vehicle-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'work-orders/work-order-form.tsx': 'cancelHref — zurueck zur eigenen Liste',
  'work-reports/work-report-form.tsx': 'cancelHref — zurueck zur eigenen Liste',

  'documents/page.tsx':
    'pageHref() — Blaetterlinks auf /documents selbst. Der Rueckweg zum Vorgang ' +
    'in derselben Datei laeuft ueber ModuleLink.',
  'notifications/page.tsx':
    'TabLink bekommt "/notifications" als Literal vom Aufrufer; der Scan sieht ' +
    'es dort. Das Ziel der Benachrichtigung laeuft ueber ModuleLink.',
  'reports/page.tsx':
    'ReportLink bekommt seine hrefs als Literale von den drei Aufrufern in ' +
    'derselben Datei — die pruefen sich oben selbst.',
  'settings/emails/page.tsx':
    'buildHref() — Filterlinks auf /settings/emails selbst. Der Vorgangslink ' +
    'daneben laeuft ueber ModuleLink.',
  'qr/[type]/[id]/page.tsx':
    'qrSrc zeigt auf /api/qr — ein Route-Handler, kein Seiten-Modul. Der haelt ' +
    'sein Gate seit Sprint 118 selbst (moduleGate).',
  'dashboard/page.tsx':
    'mod.menuPath, iteriert ueber getAvailableModules() — die Menge ist bereits ' +
    'die tarifbereinigte. Ein Eintrag darin ist per Definition erreichbar.',
  'dashboard/welcome-overlay.tsx':
    'Client-Komponente, ModuleLink waere hier nicht ladbar. Die Schritte kommen ' +
    'aus onboarding-steps.ts und werden in dashboard/page.tsx serverseitig ' +
    'ueber hrefAvailable() gefiltert, bevor sie hier ankommen.',
};

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
        const raw = match[1] ?? match[2] ?? match[3] ?? match[4] ?? '';
        if (!raw.startsWith('/')) continue; // mailto:, tel:, externe URLs
        const targetModule = moduleForPath(raw.replace(/\$\{[^}]*\}/g, 'x'));
        if (!targetModule || targetModule === ownModule) continue;

        const element = elementAt(lines, index);

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

interface ComputedFinding {
  file: string;
  line: number;
  expression: string;
  element: string;
}

/** Sprint 121: `href={ausdruck}` ausserhalb von ModuleLink/ModuleGate. */
function scanComputed(): ComputedFinding[] {
  const findings: ComputedFinding[] = [];
  for (const file of collectFiles(APP_DIR)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    let gateDepth = 0;

    lines.forEach((line, index) => {
      const insideGate = gateDepth > 0;
      gateDepth +=
        (line.match(/<ModuleGate\b/g) ?? []).length - (line.match(/<\/ModuleGate>/g) ?? []).length;

      for (const match of line.matchAll(COMPUTED_HREF)) {
        const element = elementAt(lines, index);
        if (insideGate || element === 'ModuleLink' || element === 'ModuleGate') continue;
        findings.push({
          file: relative(APP_DIR, file).split(sep).join('/'),
          line: index + 1,
          expression: (match[1] ?? '').trim(),
          element,
        });
      }
    });
  }
  return findings;
}

const FINDINGS = scan();
const COMPUTED = scanComputed();

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

describe('Berechnete hrefs (Sprint 121)', () => {
  it('sanity: der Scan findet ueberhaupt berechnete hrefs', () => {
    // Faellt COMPUTED_HREF still aus, bewacht dieser Block nichts mehr — und
    // genau das war der Zustand, in dem Sprint 119 ausgeliefert wurde.
    expect(COMPUTED.length).toBeGreaterThan(15);
  });

  it('jeder berechnete href geht durch ModuleLink oder steht mit Grund in COMPUTED_HREF_GUARD', () => {
    const open = COMPUTED.filter((f) => !(f.file in COMPUTED_HREF_GUARD));
    const report = open
      .map((f) => `  src/app/(app)/${f.file}:${f.line} — <${f.element} href={${f.expression}}>`)
      .join('\n');
    expect(
      open,
      `Diese hrefs stehen erst zur Laufzeit fest. Der Scan oben sieht nur ` +
        `Literale und kann deshalb nicht sagen, ob sie auf ein fremdes Modul ` +
        `zeigen:\n${report}\n\n` +
        `Fix: <Link> durch <ModuleLink> ersetzen — das leitet das Modul zur ` +
        `Laufzeit aus dem href ab und kostet nichts, wenn das Ziel zu keinem ` +
        `Modul gehoert. In Client-Komponenten geht das nicht (server-only): dort ` +
        `gehoert die Pruefung in die Server-Elternkomponente, die den Wert ` +
        `hineinreicht. Bleibt das Ziel nachweislich im eigenen Modul (Abbrechen-, ` +
        `Filter- und Blaetterlinks), gehoert ein Eintrag samt Begruendung in ` +
        `COMPUTED_HREF_GUARD.`,
    ).toEqual([]);
  });

  it('jeder Eintrag in COMPUTED_HREF_GUARD hat noch einen berechneten href', () => {
    // Sonst verrottet die Liste genauso wie eine Allowlist: eine laengst
    // umgestellte Datei bleibt als Ausnahme stehen und deckt spaeter einen
    // echten neuen Fall zu.
    for (const file of Object.keys(COMPUTED_HREF_GUARD)) {
      expect(
        COMPUTED.some((f) => f.file === file),
        `COMPUTED_HREF_GUARD nennt "${file}", aber dort gibt es keinen ungeschuetzten ` +
          `berechneten href mehr. Eintrag entfernen.`,
      ).toBe(true);
    }
  });

  it('die vier Sackgassen aus Sprint 121 sind zu', () => {
    // Namentlich, weil es echte Fundstellen waren und kein Muster: alle vier
    // zeigten ueber eine Hilfsfunktion auf einen Vorgang in einem fremden
    // Modul. Wird eine davon auf <Link> zurueckgedreht, faellt sie hier auf
    // und nicht erst beim Kunden, der das Modul abgeschaltet hat.
    const fixed = [
      'notifications/page.tsx',
      'settings/emails/page.tsx',
      'settings/emails/[id]/page.tsx',
      'settings/automations/[id]/runs/[runId]/page.tsx',
    ];
    for (const file of fixed) {
      const source = readFileSync(join(APP_DIR, ...file.split('/')), 'utf8');
      expect(source, `${file} verlinkt einen fremden Vorgang und braucht ModuleLink.`).toContain(
        '<ModuleLink',
      );
    }
  });
});

describe('hrefAvailable leitet das Zielmodul aus dem href ab', () => {
  /**
   * Ein `module`-Prop waere eine zweite Wahrheit neben MODULE_PATHS. Der
   * Fehler faellt dann nicht auf: ein falsch benanntes Modul sieht einfach
   * immer verfuegbar aus, und der Link ist wieder eine Sackgasse.
   */
  const guard = readFileSync(join(process.cwd(), 'src', 'lib', 'modules', 'href-guard.ts'), 'utf8');
  const link = readFileSync(
    join(process.cwd(), 'src', 'components', 'ui', 'module-link.tsx'),
    'utf8',
  );

  it('nutzt moduleForPath und die tarifbereinigte Modulmenge', () => {
    expect(guard).toMatch(/from '@\/lib\/modules\/module-map'/);
    expect(guard).toContain('moduleForPath(href)');
    // isModuleAvailable, nicht der rohe Schalterzustand: sonst bleibt der Link
    // stehen, wenn der Tarif das Modul sperrt — und fuehrt ins 404.
    expect(guard).toContain('isModuleAvailable');
    expect(guard).not.toContain('isModuleEnabled');
  });

  it('ist server-only — sonst laeuft die Pruefung im Browser ins Leere', () => {
    expect(guard).toContain("import 'server-only'");
    expect(link).toContain("import 'server-only'");
  });

  it('ModuleLink und ModuleGate nehmen kein Modul als Prop entgegen', () => {
    expect(link).not.toMatch(/\bmoduleKey\??:\s*ModuleKey/);
  });

  it('ModuleLink baut die Pruefung nicht selbst nach', () => {
    // Sonst gaebe es wieder zwei Implementierungen — und die Server-Action, die
    // dieselbe Frage beantworten muss, waere die dritte.
    expect(link).toContain('hrefAvailable');
    expect(link).not.toContain('moduleForPath');
  });

  it('openNotificationAction prueft das Ziel vor dem redirect', () => {
    // Sprint 121: Der Klick auf eine Benachrichtigung geht nicht ueber einen
    // Link, sondern ueber `redirect()` in einer Server-Action — an ModuleLink
    // vorbei. Faellt die Pruefung weg, fuehrt die Glocke wieder ins 404.
    const actions = readFileSync(
      join(APP_DIR, 'notifications', 'actions.ts'),
      'utf8',
    );
    expect(actions).toContain('hrefAvailable');
    expect(actions).toMatch(/if\s*\(!\(await hrefAvailable\(href\)\)\)/);
  });

  it('das Willkommens-Overlay bekommt seine Schritte gefiltert', () => {
    // Client-Komponente: die Pruefung muss in der Server-Elternkomponente
    // sitzen. Steht die Schritt-Tabelle wieder in der Client-Datei, ist der
    // erste Bildschirm eines neuen Mandanten wieder eine Sackgasse.
    const overlay = readFileSync(join(APP_DIR, 'dashboard', 'welcome-overlay.tsx'), 'utf8');
    const page = readFileSync(join(APP_DIR, 'dashboard', 'page.tsx'), 'utf8');
    expect(overlay).toContain("'use client'");
    expect(overlay).not.toContain('/properties/new');
    expect(page).toContain('hrefAvailable');
    expect(page).toContain('ONBOARDING_STEPS');
  });
});
