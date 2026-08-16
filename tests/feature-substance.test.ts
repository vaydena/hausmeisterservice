import { describe, it, expect } from 'vitest';
import {
  FEATURE_KEYS,
  FEATURE_LABEL,
  FEATURE_MODULES,
  FEATURE_PATHS,
  type FeatureKey,
} from '../src/lib/tenant/feature-map';
import { MODULES_BY_KEY, isUnbuiltModule } from '../src/lib/modules/registry';
import { moduleForPath } from '../src/lib/modules/module-map';

/**
 * SPRINT 140 — WAS DER TARIF VERSPRICHT, MUSS ES GEBEN.
 *
 * Anlass ist `gps`. Der Feature-Schluessel hiess "GPS-Tracking & Touren",
 * stand fuer 149 EUR/Monat auf /preise, hatte einen Absatz in /datenschutz
 * ueber 90 Tage Speicherdauer — und von der GPS-Haelfte existierte keine
 * Zeile: keine Koordinatenspalte an `time_entries`, kein Import von
 * `maplibre-gl`, keine Seite. 139 Sprints lang.
 *
 * WAS DIESER TEST NICHT KANN, ZUERST. Er kann das Label nicht auf Wahrheit
 * pruefen. "GPS-Tracking & Touren" war strukturell in Ordnung — der
 * Schluessel zeigte auf `tours`, und `tours` ist gebaut. Die Luege steckte im
 * Wort, nicht in der Tabelle, und kein Test liest Deutsch. Ein Test, der so
 * tut, als haette er diesen Fall gefangen, waere schlimmer als keiner.
 *
 * Was er kann, ist die Umgebung des Fehlers dichtzumachen — die Stellen, an
 * denen sich dieselbe Sorte Versprechen strukturell niederschlaegt:
 *
 *   1. ein Feature ohne ein einziges gebautes Modul
 *   2. ein Feature-Modul, das es in der Registry nicht gibt
 *   3. ein Feature-Pfad, den kein Modul beansprucht  <- so lag /map da
 *   4. eine Ausnahme, deren Feature es nicht mehr gibt
 *
 * Punkt 3 ist der, der Sprint 139 vorweggenommen haette: `FEATURE_PATHS.gps`
 * enthielt '/map', `MODULE_PATHS` kannte den Pfad nicht, also sperrte das
 * Tarif-Gate eine Seite, die niemand gebaut hatte.
 */

/**
 * Features ohne gebautes Modul — jede Zeile ist ein offenes Versprechen und
 * braucht einen Grund, kein Datum allein.
 *
 * Die Liste steht hier und nicht in feature-map.ts, weil sie eine Aussage
 * ueber den Bauzustand ist und nicht ueber die Zuordnung. Ein `unbuilt: true`
 * wie bei den Modulen waere das bessere Zuhause — aber ein Feature-Flag mit
 * "noch nicht gebaut" in der Tarif-Tabelle waere ein Schalter, den der
 * Betreiber im Betreiber-Bereich sieht und einschalten kann. Bei Modulen ist
 * das Flag ein Riegel; bei Features waere es eine Einladung.
 */
const FEATURES_WITHOUT_BUILT_MODULE: Partial<Record<FeatureKey, string>> = {
  api: [
    'Enterprise fuehrt "API-Zugang" fuer 349 EUR/Monat auf /preise.',
    'Gebaut ist davon nichts: kein oeffentlicher Endpunkt, kein Token, keine',
    'Dokumentation. Die Route-Handler unter /api sind die internen der App',
    'und haengen an der Session, nicht an einem Schluessel.',
    'Gemessen am 16.08.2026, als `gps` aus demselben Grund entfernt wurde —',
    'stehengelassen, weil das eine Entscheidung des Betreibers ist und keine',
    'des Sprints: bauen oder aus dem Tarif nehmen (Task #591).',
  ].join(' '),
};

describe('Tarif-Features haben Substanz', () => {
  describe('sanity: die Tabellen werden wirklich gelesen', () => {
    it('FEATURE_KEYS ist nicht leer', () => {
      expect(FEATURE_KEYS.length).toBeGreaterThan(0);
    });

    it('moduleForPath findet ein bekanntes Modul', () => {
      // Ohne diese Zeile wuerde ein moduleForPath(), das immer null liefert,
      // Punkt 3 unten in einen Dauerfehlschlag verwandeln — und ein
      // moduleForPath(), das immer irgendwas liefert, in eine Attrappe.
      expect(moduleForPath('/tours')).toBe('tours');
      expect(moduleForPath('/gibt-es-nicht')).toBeNull();
    });

    it('jedes Feature hat ein Label, das nicht der Schluessel selbst ist', () => {
      // Kein Wahrheitsbeweis, aber es faengt das Vergessen: ein Feature, das
      // auf /preise als "tours" statt "Tourenplanung" steht.
      for (const key of FEATURE_KEYS) {
        expect(FEATURE_LABEL[key], `Feature "${key}" hat kein eigenes Label`).not.toBe(key);
        expect(FEATURE_LABEL[key].trim().length).toBeGreaterThan(2);
      }
    });
  });

  describe('1. Jedes Feature deckt mindestens ein gebautes Modul ab', () => {
    for (const key of FEATURE_KEYS) {
      const excuse = FEATURES_WITHOUT_BUILT_MODULE[key];
      it(`Feature "${key}" (${FEATURE_LABEL[key]})${excuse ? ' — bekannte Ausnahme' : ''}`, () => {
        const built = FEATURE_MODULES[key].filter((m) => !isUnbuiltModule(m));
        if (excuse) {
          // Die Ausnahme muss zutreffen. Sonst ueberlebt sie das Bauen des
          // Features und entschuldigt spaeter etwas ganz anderes.
          expect(
            built,
            `Feature "${key}" steht in FEATURES_WITHOUT_BUILT_MODULE, hat aber gebaute Module: ${built.join(', ')}. Ausnahme in tests/feature-substance.test.ts entfernen.`,
          ).toEqual([]);
          return;
        }
        expect(
          built,
          `Das Feature "${FEATURE_LABEL[key]}" steht auf /preise und unter Einstellungen -> Abo, und der Kunde bezahlt dafuer — aber kein einziges gebautes Modul haengt daran.\n` +
            `FEATURE_MODULES.${key} = [${FEATURE_MODULES[key].join(', ') || ''}]\n` +
            `Entweder das Feature bauen und ein Modul zuordnen (src/lib/tenant/feature-map.ts), aus dem Tarif nehmen, oder hier mit Begruendung als bekannte Ausnahme eintragen.`,
        ).not.toEqual([]);
      });
    }
  });

  describe('2. Jedes zugeordnete Modul gibt es wirklich', () => {
    for (const key of FEATURE_KEYS) {
      for (const moduleKey of FEATURE_MODULES[key]) {
        it(`Feature "${key}" -> Modul "${moduleKey}" ist registriert`, () => {
          expect(
            MODULES_BY_KEY[moduleKey],
            `FEATURE_MODULES.${key} nennt "${moduleKey}", das steht aber nicht in MODULES (src/lib/modules/registry.ts). lockedModules() traegt den Key in die Sperrmenge ein, wo ihn nie jemand nachschlaegt — das Feature sperrt dann nichts.`,
          ).toBeDefined();
        });
      }
    }
  });

  describe('3. Jeder Feature-Pfad gehoert einem Modul', () => {
    for (const key of FEATURE_KEYS) {
      for (const path of FEATURE_PATHS[key]) {
        it(`Feature "${key}" -> Pfad "${path}" ist einem Modul zugeordnet`, () => {
          expect(
            moduleForPath(path),
            `FEATURE_PATHS.${key} sperrt "${path}", aber MODULE_PATHS (src/lib/modules/module-map.ts) kennt den Pfad nicht. Entweder gibt es die Seite nicht — dann sperrt das Tarif-Gate etwas, das niemand erreichen kann — oder sie gehoert zu keinem abschaltbaren Modul, dann laufen Modul-Gate und Tarif-Gate ueber denselben Pfad auseinander.\n` +
              `Genau so lag '/map' bis Sprint 139 in FEATURE_PATHS.gps: nie gebaut, vom Tarif bewacht.`,
          ).not.toBeNull();
        });
      }
    }
  });

  it('4. Die Ausnahmeliste nennt nur Features, die es gibt', () => {
    const known = new Set<string>(FEATURE_KEYS);
    const stale = Object.keys(FEATURES_WITHOUT_BUILT_MODULE).filter((k) => !known.has(k));
    expect(
      stale,
      `Diese Ausnahmen zeigen auf Features, die es nicht mehr gibt: ${stale.join(', ')}. Eine Ausnahme ohne Feature ist ein Freifahrtschein, der auf den naechsten Key desselben Namens wartet.`,
    ).toEqual([]);
  });
});
