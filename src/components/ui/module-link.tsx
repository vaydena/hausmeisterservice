import 'server-only';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireTenantContext } from '@/lib/tenant/current';
import { isModuleAvailable } from '@/lib/modules/enabled';
import { moduleForPath } from '@/lib/modules/module-map';

/**
 * Sprint 119: Links auf ein fremdes Modul.
 *
 * Seit Sprint 117 liefert eine Route 404, wenn ihr Modul abgeschaltet ist.
 * Damit wurde jeder Link, der von einer Seite auf ein ANDERES Modul zeigt,
 * zur Sackgasse — und zwar eine, die Sprint 117 selbst erzeugt hat: vorher
 * funktionierten diese Links, weil es das Gate nicht gab. Ein Scan ueber
 * `src/app/(app)` fand 30 solcher Stellen: die Auftragsdetailseite verlinkt
 * das Objekt, der Materialbericht das Material, die Tour das Fahrzeug.
 *
 * Das Zielmodul wird aus dem `href` abgeleitet, nicht als Prop uebergeben.
 * Ein Prop waere eine zweite Wahrheit neben `MODULE_PATHS`, die beim
 * naechsten Routen-Umbau auseinanderlaeuft — und der Fehler faellt nicht
 * auf, weil ein falsch benanntes Modul einfach immer verfuegbar aussieht.
 *
 * Kosten: `getTenantContext()` und `getAvailableModules()` sind beide
 * `cache`d. Eine Tabelle mit 50 Zeilen kostet dieselbe eine Abfrage wie ein
 * einzelner Link.
 */

async function targetAvailable(href: string): Promise<boolean> {
  const moduleKey = moduleForPath(href);
  // Kein Modul-Gate auf dem Ziel: Kernrouten, /settings/konto, /hilfe.
  if (!moduleKey) return true;
  const ctx = await requireTenantContext();
  return isModuleAvailable(ctx.tenantId, moduleKey);
}

interface ModuleLinkProps {
  href: string;
  className?: string;
  /**
   * Klassen fuer den Fall "Modul aus". Ohne Angabe faellt der Text auf die
   * Umgebung zurueck — und das ist die richtige Vorgabe: `className` traegt
   * an fast allen Stellen Link-Optik (`text-primary hover:underline`). Auf
   * einem `<span>` waere das eine Luege, die zum Klicken einlaedt.
   */
  unavailableClassName?: string;
  title?: string;
  target?: string;
  children: ReactNode;
}

/**
 * Inline-Link auf ein fremdes Modul. Ist das Modul abgeschaltet, bleibt der
 * Text stehen und verliert nur den Link.
 *
 * Bewusst kein Ausblenden: "Objekt: Musterstrasse 1" ist die Auskunft,
 * derentwegen der Nutzer auf die Seite gekommen ist. Wer das Objekte-Modul
 * abschaltet, will die Objektliste nicht mehr pflegen — nicht erfahren, dass
 * der Auftrag zu irgendeinem namenlosen Ort gehoert.
 */
export async function ModuleLink({
  href,
  className,
  unavailableClassName,
  title,
  target,
  children,
}: ModuleLinkProps) {
  if (await targetAvailable(href)) {
    return (
      <Link href={href} className={className} title={title} target={target}>
        {children}
      </Link>
    );
  }
  return (
    <span className={unavailableClassName} title={title}>
      {children}
    </span>
  );
}

/**
 * Alles, was mit dem Zielmodul komplett verschwinden soll — Buttons vor
 * allem. Ein ausgegrauter "Auftrag anlegen"-Knopf waere schlechter als
 * keiner: er verspricht eine Funktion, die dieser Mandant abbestellt hat.
 */
export async function ModuleGate({ href, children }: { href: string; children: ReactNode }) {
  return (await targetAvailable(href)) ? <>{children}</> : null;
}
