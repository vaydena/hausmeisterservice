import 'server-only';
import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant/current';
import { getAvailableModules } from '@/lib/modules/enabled';
import type { ModuleKey } from '@/lib/modules/registry';

/**
 * Sprint 118: Modul-Gate fuer Route-Handler.
 *
 * Das Gate aus Sprint 117 sitzt im `(app)`-Layout und deckt damit nur Seiten
 * ab. Handler unter `src/app/api` haben kein Layout — sie liefen daran
 * vorbei. Konkret: `/api/qr/property/<id>` gab den SVG auch mit
 * abgeschaltetem QR-Modul heraus, `/api/invoices/<id>/pdf` die Rechnung ohne
 * Abrechnungsmodul. Beide URLs stehen in Browserverlaeufen und in
 * ausgegangenen E-Mails; die abgeschaltete Oberflaeche davor war also nur
 * noch Dekoration.
 *
 * Rueckgabewert statt `throw`/`notFound()`: der Handler entscheidet sichtbar,
 * was er zurueckgibt. Ein geworfenes `notFound()` haengt daran, wie Next die
 * Ausnahme in einem Route-Handler uebersetzt — eine Frage, die man bei jedem
 * Framework-Update neu beantworten muesste, und deren falsche Antwort
 * (durchgereichte 500 statt 404) hier nicht auffiele.
 *
 *     const blocked = await moduleGate('qr_codes');
 *     if (blocked) return blocked;
 *
 * 404 und nicht 403 — dieselbe Begruendung wie beim Seiten-Gate: abschalten
 * war eine Entscheidung des Inhabers, keine Rechtefrage. Fuer diesen
 * Mandanten gibt es die Ressource nicht.
 */
export async function moduleGate(moduleKey: ModuleKey): Promise<NextResponse | null> {
  const ctx = await getTenantContext();

  // `getTenantContext` statt `requireTenantContext`: letzteres macht einen
  // `redirect('/no-access')`. Auf einer Seite ist das richtig, auf einem
  // Endpunkt, der ein PDF oder ein SVG liefert, ist eine HTML-Weiterleitung
  // keine brauchbare Antwort. Fuer eine mandantengebundene Ressource ist
  // "kein Mandant" ohnehin dasselbe wie "gibt es nicht".
  if (!ctx) return notFoundResponse();

  const available = await getAvailableModules(ctx.tenantId);
  return available.has(moduleKey) ? null : notFoundResponse();
}

function notFoundResponse(): NextResponse {
  return new NextResponse('Nicht gefunden.', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Sonst liegt die 404 im Zwischenspeicher, wenn der Inhaber das Modul
      // wieder einschaltet — die QR-Route setzt fuer den Erfolgsfall
      // `max-age=3600, immutable`.
      'Cache-Control': 'private, no-store',
    },
  });
}
