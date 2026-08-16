import { addDaysToKey, localDayRange, todayKey } from '@/lib/utils/datetime-local';

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export function startOfMonthIso(offsetMonths = 0): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() + offsetMonths);
  return d.toISOString();
}

/**
 * Sprint 113: lief ueber `toISOString().slice(0, 10)`, also ueber den
 * UTC-Kalendertag. Zwischen 22:00 und Mitternacht Berliner Zeit ist das noch
 * der Vortag — der voreingestellte Berichtszeitraum endete dann gestern und
 * liess den laufenden Tag weg.
 */
export function todayIsoDate(): string {
  return todayKey();
}

export function formatMinutes(mins: number | null | undefined): string {
  if (mins === null || mins === undefined || Number.isNaN(mins)) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h}h ${m}min`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  return formatMinutes(Math.round(ms / 60_000));
}

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatEuro(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

// CSV: RFC 4180-konformes Escaping
export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : String(v);
  if (/[",\n\r;]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(csvEscape).join(';')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(';'));
  }
  // UTF-8 BOM für Excel-Kompatibilität
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export function parsePeriod(searchParams: URLSearchParams | Record<string, string | undefined>): {
  from: string;
  to: string;
} {
  const get = (k: string): string | undefined => {
    if (searchParams instanceof URLSearchParams) return searchParams.get(k) ?? undefined;
    return searchParams[k];
  };
  const fromRaw = get('from');
  const toRaw = get('to');
  const defaultFrom = daysAgoIso(30).slice(0, 10);
  const defaultTo = todayIsoDate();
  const from = fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : defaultFrom;
  const to = toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : defaultTo;
  return { from, to };
}

/**
 * Zeitraum aus den Query-Parametern plus das passende Zeitfenster fuer die
 * Datenbank — `[startIso, endIso)`, Ende exklusiv.
 *
 * Sprint 113: Alle sechs Berichtsseiten und Exporte haben ihr Fenster selbst
 * gebaut, und zwar als `${from}T00:00:00Z` bis `${to}T23:59:59Z`. Das hat
 * zwei Fehler auf einmal:
 *
 *   - Es ist der UTC-Tag, nicht der Berliner. Im Sommer fehlten dem Zeitraum
 *     die ersten zwei Stunden des Starttags und es kamen zwei Stunden des
 *     Folgetags dazu. Fuer den Zeitbericht heisst das: eine Fruehschicht ab
 *     06:00 am Monatsersten faellt in den Vormonat — und der Zeitbericht ist
 *     die Grundlage der Lohnabrechnung.
 *   - Die letzte Sekunde des Endtages (23:59:59.001 bis 23:59:59.999) lag
 *     zwischen den Grenzen. Selten, aber ein Eintrag dort war unauffindbar.
 *
 * Beides ist mit einer exklusiven Obergrenze auf Berliner Mitternacht erledigt.
 * Die Aufrufer filtern entsprechend mit `.lt(endIso)`, nicht `.lte()`.
 */
export function parsePeriodRange(
  searchParams: URLSearchParams | Record<string, string | undefined>,
): { from: string; to: string; startIso: string; endIso: string } {
  const { from, to } = parsePeriod(searchParams);
  const range = localDayRange(from, to);
  if (!range) {
    // parsePeriod laesst nur "yyyy-MM-dd" durch, kalendarisch Unmoegliches
    // (31.02.) kommt aber durch die Regex. Dann lieber der Standardzeitraum
    // als ein Bericht ueber ein leeres Fenster.
    const fallbackFrom = addDaysToKey(todayKey(), -30);
    const fallbackTo = todayKey();
    const fallback = localDayRange(fallbackFrom, fallbackTo);
    if (!fallback) throw new Error('Berichtszeitraum konnte nicht bestimmt werden.');
    return { from: fallbackFrom, to: fallbackTo, ...fallback };
  }
  return { from, to, ...range };
}
