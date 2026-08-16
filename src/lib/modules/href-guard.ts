import 'server-only';
import { requireTenantContext } from '@/lib/tenant/current';
import { isModuleAvailable } from '@/lib/modules/enabled';
import { moduleForPath } from '@/lib/modules/module-map';

/**
 * Sprint 121: "Darf dieser Ziel-Pfad ueberhaupt noch angesteuert werden?"
 *
 * Stand bis hierher als private `targetAvailable` in `module-link.tsx`. Der
 * Umzug hat einen konkreten Anlass: nicht jeder Sprung auf ein fremdes Modul
 * geht durch ein `<a>`. `openNotificationAction` beantwortet den Klick auf
 * eine Benachrichtigung mit `redirect(notificationHref(...))` — dieselbe
 * Sackgasse wie ein toter Link, nur ohne Link. Ein zweiter Abgleich in der
 * Action waere die uebliche zweite Wahrheit gewesen, die beim naechsten
 * Routen-Umbau auseinanderlaeuft.
 *
 * Kein Modul-Treffer heisst verfuegbar: Kernrouten, `/settings/konto`,
 * `/hilfe` und `/notifications` selbst haben kein Gate, das sie schliessen
 * koennte.
 *
 * `getAvailableModules` ist `cache`d — eine Tabelle mit 50 Zeilen kostet
 * dieselbe eine Abfrage wie ein einzelner Link.
 */
export async function hrefAvailable(href: string): Promise<boolean> {
  const moduleKey = moduleForPath(href);
  if (!moduleKey) return true;
  const ctx = await requireTenantContext();
  return isModuleAvailable(ctx.tenantId, moduleKey);
}
