import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  API_MODULE_PATHS,
  MODULE_PATHS,
  apiPathsForModule,
  moduleForApiPath,
  moduleForPath,
} from '@/lib/modules/module-map';
import { MODULES_BY_KEY, type ModuleKey } from '@/lib/modules/registry';

/**
 * Sprint 118: Das Modul-Gate und die Route-Handler.
 *
 * Sprint 117 haengt das Gate ins `(app)`-Layout. Handler unter `src/app/api`
 * haben kein Layout und liefen deshalb daran vorbei — `/api/qr/property/<id>`
 * lieferte den SVG mit abgeschaltetem QR-Modul, `/api/invoices/<id>/pdf` die
 * Rechnung ohne Abrechnungsmodul. Beide URLs stehen in Browserverlaeufen und
 * in ausgegangenen E-Mails; das abgeschaltete Menue davor war Dekoration.
 *
 * Dieser Test haelt die Regel fest, nicht die drei Einzelfaelle: ein neuer
 * Handler unter einem gesperrten Praefix ohne `moduleGate` faellt hier auf,
 * bevor er live geht.
 */

const API_DIR = join(process.cwd(), 'src', 'app', 'api');

/**
 * Handler, die bewusst an keinem Modul haengen — mit dem Grund, warum ein
 * Gate dort falsch waere. Ohne Grund gehoert hier nichts hinein: die Liste
 * ist die Stelle, an der man sich ein Loch bequem selbst genehmigen koennte.
 */
const UNGATED_API_ROUTES: Record<string, string> = {
  '/api/cron/run-automations':
    'Laeuft ohne Session (Bearer-Secret, im Proxy als PUBLIC_API_PREFIX). Es gibt keinen ' +
    'Mandanten zu pruefen — ein Gate wuerde den Cron fuer alle abwuergen.',
  '/api/health':
    'Betriebsueberwachung. Muss auch antworten, wenn Session, Mandant oder Datenbank fehlen — ' +
    'genau dann wird sie gebraucht.',
  '/api/privacy/export':
    'DSGVO Art. 15. Das Auskunftsrecht haengt nicht daran, welche Module gebucht sind; ' +
    'gerade der Mandant, der ein Modul abschaltet, hat dort weiter Daten liegen.',
  '/api/portal/privacy/export':
    'Dasselbe Auskunftsrecht fuer Bewohner. Haengt am Bewohner-Kontext, nicht an den Modulen ' +
    'der Hausverwaltung.',
  '/api/push/subscribe':
    'Benachrichtigungen sind core.notifications und damit per Definition nicht abschaltbar.',
  '/api/push/unsubscribe':
    'Abmelden muss immer gehen. Ein Gate hier hiesse: Push laesst sich nicht mehr abstellen.',
  '/api/push/vapid-key':
    'Liefert den oeffentlichen VAPID-Schluessel des Servers — keine Mandantendaten, kein Modul.',
  '/api/portal/push/subscribe':
    'Bewohner-Gegenstueck zu /api/push/subscribe. core.notifications, nicht abschaltbar.',
  '/api/portal/push/unsubscribe':
    'Bewohner-Gegenstueck. Abmelden muss auch dann gehen, wenn das Portal abbestellt wird.',
  '/api/portal/push/vapid-key':
    'Bewohner-Gegenstueck. Oeffentlicher Schluessel, unabhaengig vom Mandanten.',
};

interface RouteFile {
  /** URL-Pfad inkl. `[param]`-Segmente, z. B. `/api/invoices/[id]/pdf`. */
  path: string;
  file: string;
  source: string;
}

function collectRouteFiles(dir: string, out: RouteFile[] = []): RouteFile[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRouteFiles(full, out);
      continue;
    }
    if (entry.name !== 'route.ts') continue;
    const segments = relative(API_DIR, dir)
      .split(sep)
      .filter((s) => s.length > 0 && !s.startsWith('('));
    out.push({
      path: `/api${segments.length > 0 ? `/${segments.join('/')}` : ''}`,
      file: relative(process.cwd(), full).split(sep).join('/'),
      source: readFileSync(full, 'utf8'),
    });
  }
  return out;
}

const ROUTES = collectRouteFiles(API_DIR);

describe('moduleForApiPath', () => {
  it('trifft den Praefix und alles darunter', () => {
    expect(moduleForApiPath('/api/qr')).toBe('qr_codes');
    expect(moduleForApiPath('/api/qr/property/abc-123')).toBe('qr_codes');
    expect(moduleForApiPath('/api/invoices/abc/pdf')).toBe('billing');
    expect(moduleForApiPath('/api/offers/abc/pdf')).toBe('billing');
  });

  it('haelt an der Segmentgrenze', () => {
    expect(moduleForApiPath('/api/qrcode')).toBeNull();
    expect(moduleForApiPath('/api/invoices-export')).toBeNull();
  });

  it('laesst die ungesperrten Endpunkte in Ruhe', () => {
    for (const path of Object.keys(UNGATED_API_ROUTES)) {
      expect(moduleForApiPath(path), `${path} darf kein Modul-Gate ausloesen`).toBeNull();
    }
  });

  it('trennt Seiten- und API-Tabelle', () => {
    // `/qr` ist die Druckansicht, `/api/qr` der SVG-Endpunkt. Beide gehoeren
    // zu qr_codes, stehen aber in verschiedenen Tabellen — wer eine davon
    // erweitert, darf nicht annehmen, die andere zoege automatisch nach.
    expect(moduleForPath('/api/qr/property/x')).toBeNull();
    expect(moduleForApiPath('/qr/print')).toBeNull();
  });
});

describe('Jeder Handler ist gesperrt oder ausdruecklich ungesperrt', () => {
  it('sanity: die Handler wurden gefunden', () => {
    expect(ROUTES.length).toBeGreaterThan(8);
    expect(ROUTES.map((r) => r.path)).toContain('/api/health');
  });

  it('ein Handler unter einem gesperrten Praefix ruft moduleGate mit seinem Modul', () => {
    for (const route of ROUTES) {
      const moduleKey = moduleForApiPath(route.path);
      if (!moduleKey) continue;
      expect(
        route.source,
        `${route.file} liegt unter einem Praefix von "${moduleKey}", ruft aber kein moduleGate('${moduleKey}'). ` +
          `Der Endpunkt liefert damit weiter aus, wenn der Mandant das Modul abschaltet.`,
      ).toContain(`moduleGate('${moduleKey}')`);
      expect(route.source).toMatch(/from '@\/lib\/modules\/api-guard'/);
    }
  });

  it('das Gate steht vor der Arbeit, nicht dahinter', () => {
    // Sonst laedt der Handler erst das Dokument, rendert das PDF und wirft es
    // dann weg — Rechenzeit fuer ein Ergebnis, das niemand bekommen soll.
    // Schlimmer bei Handlern mit Nebenwirkung: die waere dann schon passiert.
    for (const route of ROUTES) {
      const moduleKey = moduleForApiPath(route.path);
      if (!moduleKey) continue;
      const body = route.source.slice(route.source.indexOf('export async function'));
      const gate = body.indexOf('moduleGate(');
      const firstAwait = body.search(/await (?!moduleGate)/);
      expect(gate, `${route.file}: moduleGate nicht im Handler gefunden`).toBeGreaterThan(-1);
      expect(
        gate,
        `${route.file}: moduleGate steht hinter der ersten anderen await-Anweisung.`,
      ).toBeLessThan(firstAwait === -1 ? Number.MAX_SAFE_INTEGER : firstAwait);
    }
  });

  it('jeder ungesperrte Handler steht mit Grund in UNGATED_API_ROUTES', () => {
    for (const route of ROUTES) {
      if (moduleForApiPath(route.path)) continue;
      const reason = UNGATED_API_ROUTES[route.path];
      expect(
        reason,
        `${route.file} (${route.path}) haengt an keinem Modul-Gate und steht nicht in ` +
          `UNGATED_API_ROUTES. Entweder gehoert sein Praefix in API_MODULE_PATHS, oder er ist ` +
          `bewusst immer erreichbar — dann hier mit Begruendung eintragen.`,
      ).toBeTruthy();
      expect((reason ?? '').length, `Begruendung fuer ${route.path} ist zu duenn.`).toBeGreaterThan(
        30,
      );
    }
  });

  it('jeder Eintrag in UNGATED_API_ROUTES entspricht einem echten Handler', () => {
    const known = new Set(ROUTES.map((r) => r.path));
    for (const path of Object.keys(UNGATED_API_ROUTES)) {
      expect(
        known.has(path),
        `UNGATED_API_ROUTES nennt "${path}", aber unter src/app/api gibt es dazu keinen Handler.`,
      ).toBe(true);
    }
  });

  it('jeder Praefix in API_MODULE_PATHS deckt mindestens einen Handler ab', () => {
    for (const [key, prefixes] of Object.entries(API_MODULE_PATHS) as [
      ModuleKey,
      readonly string[],
    ][]) {
      for (const prefix of prefixes) {
        expect(
          ROUTES.some((r) => r.path === prefix || r.path.startsWith(`${prefix}/`)),
          `API_MODULE_PATHS sperrt "${prefix}" fuer Modul "${key}", aber dort liegt kein Handler. ` +
            `Ein Praefix ohne Route deckt spaeter vielleicht eine ganz andere.`,
        ).toBe(true);
      }
    }
  });
});

describe('Konsistenz mit dem Seiten-Gate', () => {
  it('jedes Modul mit API-Praefix hat auch UI-Routen unter demselben Modul', () => {
    // Andernfalls hiesse dasselbe Feature in beiden Gates anders, und welche
    // Antwort der Nutzer sieht, haengt davon ab, ob er die Seite oder den
    // Endpunkt trifft.
    for (const key of Object.keys(API_MODULE_PATHS) as ModuleKey[]) {
      expect(
        MODULE_PATHS[key]?.length ?? 0,
        `Modul "${key}" sperrt API-Routen, aber keine Seiten. Dann ist die Oberflaeche dazu offen.`,
      ).toBeGreaterThan(0);
      expect(MODULES_BY_KEY[key]?.core, `"${key}" ist Kern und nicht abschaltbar.`).toBe(false);
    }
  });

  it('apiPathsForModule liefert die Tabelle, nicht eine Kopie davon', () => {
    expect(apiPathsForModule('billing')).toEqual(['/api/invoices', '/api/offers']);
    expect(apiPathsForModule('properties')).toEqual([]);
  });
});

describe('Zusammenspiel mit dem Proxy', () => {
  const proxy = readFileSync(join(process.cwd(), 'src', 'proxy.ts'), 'utf8');

  /** `const PUBLIC_API_PREFIXES = ['/api/cron/', '/api/health'];` */
  const publicApiPrefixes = (
    proxy.match(/PUBLIC_API_PREFIXES\s*=\s*\[([^\]]*)\]/)?.[1] ?? ''
  )
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter((s) => s.length > 0);

  it('sanity: die Proxy-Liste wurde gelesen', () => {
    expect(publicApiPrefixes.length).toBeGreaterThan(0);
  });

  it('kein oeffentlicher Endpunkt liegt unter einem Modul-Gate', () => {
    // Der Proxy laesst diese Pfade ohne Session-Refresh durch. Ein Modul-Gate
    // dahinter findet nie einen Mandanten und antwortet immer mit 404 — eine
    // Sperre, die aussieht wie ein kaputter Endpunkt.
    for (const prefix of publicApiPrefixes) {
      const normalized = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
      expect(
        moduleForApiPath(normalized),
        `"${prefix}" ist im Proxy oeffentlich, faellt aber unter das Modul-Gate.`,
      ).toBeNull();
    }
  });

  it('jeder gesperrte Endpunkt braucht umgekehrt eine Session', () => {
    for (const prefixes of Object.values(API_MODULE_PATHS)) {
      for (const prefix of prefixes ?? []) {
        expect(
          publicApiPrefixes.some((p) => prefix.startsWith(p.endsWith('/') ? p : `${p}/`) || prefix === p),
          `"${prefix}" steht im Modul-Gate und gleichzeitig in PUBLIC_API_PREFIXES.`,
        ).toBe(false);
      }
    }
  });
});
