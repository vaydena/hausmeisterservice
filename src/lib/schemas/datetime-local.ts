import { z } from 'zod';
import { parseLocalDateTime } from '@/lib/utils/datetime-local';

/**
 * Zod-Bausteine fuer Felder, die aus einem `<input type="datetime-local">`
 * kommen. Jedes Modul hatte dafuer bisher seine eigene Variante, und die
 * Varianten waren sich uneinig:
 *
 *   - time-tracking, scheduling, work-orders, time-corrections haben mit
 *     `new Date(v).toISOString()` umgerechnet — also in der Zeitzone des
 *     Node-Prozesses.
 *   - keys, tours, announcements haben den Rohstring an Postgres
 *     durchgereicht — also in der Session-Zeitzone der Datenbank (UTC).
 *   - materials und meters haben in der Server-Action umgerechnet, nicht im
 *     Schema.
 *
 * Angezeigt wurde alles einheitlich in Berliner Zeit. Hier steht jetzt die
 * eine Umrechnung, die zu dieser Anzeige passt.
 *
 * Zweiter Punkt: die alten Varianten haben teils erst *nach* dem Transform
 * geprueft, ob das Datum lesbar war. `new Date('kaputt').toISOString()` wirft
 * aber schon im Transform eine RangeError — und die faengt `safeParse` nicht
 * ab, sie faellt als 500 beim Nutzer heraus. `parseLocalDateTime` wirft nie,
 * sondern liefert `null`; daraus wird hier ein normaler Feldfehler.
 */

const DEFAULT_INVALID = 'Ungültiger Zeitpunkt.';

/** Pflichtfeld: Wanduhr-Zeit → ISO-Zeitpunkt. */
export function localDateTimeRequired(
  missingMessage = 'Zeitpunkt fehlt.',
  invalidMessage = DEFAULT_INVALID,
) {
  return z
    .string()
    .trim()
    .min(1, missingMessage)
    .transform((value, ctx) => {
      const iso = parseLocalDateTime(value);
      if (iso === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: invalidMessage });
        return z.NEVER;
      }
      return iso;
    });
}

/** Optionales Feld: leer → `null`, sonst Wanduhr-Zeit → ISO-Zeitpunkt. */
export function localDateTimeOptional(invalidMessage = DEFAULT_INVALID) {
  return z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (!value || value.length === 0) return null;
      const iso = parseLocalDateTime(value);
      if (iso === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: invalidMessage });
        return z.NEVER;
      }
      return iso;
    });
}
