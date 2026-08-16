import { describe, expect, it } from 'vitest';
import {
  CORE_MODULE_KEYS,
  DEFAULT_ON_MODULE_KEYS,
  isModuleEnabledByRows,
  MODULES,
  UNBUILT_MODULE_KEYS,
  type ModuleKey,
  type ModuleToggleRow,
} from '@/lib/modules/registry';

/**
 * SPRINT 136 — WAS "KEINE ZEILE" BEDEUTET.
 *
 * Die Regel hat zwei Seiten, und beide muessen einzeln falsifizierbar sein:
 *
 *   fehlende Zeile  -> AN   (sonst verschwinden fertige Module lautlos)
 *   `false`-Zeile   -> AUS  (sonst ist der Schalter ohne Wirkung)
 *
 * Nur eine der beiden zu pruefen genuegt nicht. Ein Helfer, der stur `true`
 * zurueckgibt, besteht die erste Haelfte muehelos; einer, der stur `false`
 * zurueckgibt, die zweite. Erst zusammen schliessen sie beide Ausreden aus.
 *
 * Der Anlass war kein gedachter Fall: der aelteste Mandant der
 * Produktiv-Datenbank hatte am 16.08.2026 zu vier gebauten Modulen keine
 * Zeile — resident_portal, qr_codes, reporting, automations — und sah sie
 * deshalb nicht, obwohl niemand sie je abgeschaltet hatte. Das
 * Bewohnerportal war darunter, und er benutzt es.
 */
describe('Modul-Grundzustand', () => {
  /** Ein gebautes Nicht-Kern-Modul, das es sicher gibt. */
  const built = MODULES.find((m) => !m.core && !m.unbuilt)!;

  it('sanity: es gibt ueberhaupt ein gebautes Nicht-Kern-Modul', () => {
    expect(built).toBeDefined();
    expect(DEFAULT_ON_MODULE_KEYS).toContain(built.key);
  });

  describe('ohne Eintrag', () => {
    it('ist ein gebautes Nicht-Kern-Modul AN', () => {
      expect(
        isModuleEnabledByRows(built.key, []),
        `Ohne Eintrag muss "${built.key}" an sein. Ist das falsch, sieht jeder Mandant, der zu diesem Modul nie etwas hinterlegt hat, ein fertiges Modul nicht — und findet keinen Schalter, weil der Menuepunkt fehlt.`,
      ).toBe(true);
    });

    it('ist jedes Kern-Modul AN', () => {
      for (const key of CORE_MODULE_KEYS) {
        expect(isModuleEnabledByRows(key, [])).toBe(true);
      }
    });

    it('ist ein ungebautes Modul AUS', () => {
      for (const key of UNBUILT_MODULE_KEYS) {
        expect(
          isModuleEnabledByRows(key, []),
          `"${key}" ist als unbuilt markiert und darf ohne ausdruecklichen Eintrag nicht an sein — sonst steht ein Menuepunkt in der Navigation, hinter dem keine Seite liegt.`,
        ).toBe(false);
      }
    });
  });

  describe('mit Eintrag', () => {
    const off = (key: ModuleKey): ModuleToggleRow[] => [{ module_key: key, enabled: false }];
    const on = (key: ModuleKey): ModuleToggleRow[] => [{ module_key: key, enabled: true }];

    it('schaltet `false` ein gebautes Modul AUS', () => {
      expect(
        isModuleEnabledByRows(built.key, off(built.key)),
        `Ein ausdrueckliches "aus" muss gewinnen. Sonst waere der Schalter unter Einstellungen -> Mandant eine Attrappe: er schreibt eine Zeile, die niemand liest.`,
      ).toBe(false);
    });

    it('schaltet `true` ein ungebautes Modul AN', () => {
      // Bestandsschutz: "Firma ABC" hat seit dem 16.08.2026 eine aktive
      // gps-Zeile aus der Zeit vor dem Signup-Riegel. Die soll sichtbar
      // bleiben, damit Einstellungen -> Mandant sie ausweisen kann.
      for (const key of UNBUILT_MODULE_KEYS) {
        expect(isModuleEnabledByRows(key, on(key))).toBe(true);
      }
    });

    it('laesst ein Kern-Modul auch bei `false` AN', () => {
      for (const key of CORE_MODULE_KEYS) {
        expect(
          isModuleEnabledByRows(key, off(key)),
          `"${key}" ist ein Kern-Modul. Eine "false"-Zeile darauf kann nur von Hand in die Datenbank gelangt sein — toggleModuleAction weist den Versuch ab. Sie zu befolgen hiesse, Dashboard oder Anmeldung abzuschalten.`,
        ).toBe(true);
      }
    });

    it('beachtet nur die Zeile des gefragten Moduls', () => {
      const other = MODULES.find((m) => !m.core && !m.unbuilt && m.key !== built.key)!;
      expect(isModuleEnabledByRows(built.key, off(other.key))).toBe(true);
      expect(isModuleEnabledByRows(other.key, off(built.key))).toBe(true);
    });
  });

  /**
   * Der Fall, der den Sprint ausgeloest hat, als Testfall: die vier Module,
   * zu denen "Hausmeisterservice" keine Zeile hatte, waehrend 26 andere auf
   * `true` standen.
   */
  it('reproduziert den Produktivbefund vom 16.08.2026', () => {
    const vorhanden: ModuleToggleRow[] = MODULES.filter(
      (m) =>
        !m.core &&
        !m.unbuilt &&
        !['resident_portal', 'qr_codes', 'reporting', 'automations'].includes(m.key),
    ).map((m) => ({ module_key: m.key, enabled: true }));

    for (const key of ['resident_portal', 'qr_codes', 'reporting', 'automations'] as ModuleKey[]) {
      expect(
        isModuleEnabledByRows(key, vorhanden),
        `"${key}" hatte keine Zeile, war aber nie abgeschaltet. Unter der alten Regel blieb es aus — das ist der Fehler, den dieser Sprint behebt.`,
      ).toBe(true);
    }
  });
});
