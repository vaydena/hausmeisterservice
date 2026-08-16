const DATE_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Berlin',
});

export function formatDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '–';
  return DATE_FORMATTER.format(d);
}

export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '–';
  return DATETIME_FORMATTER.format(d);
}

const TIME_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/Berlin',
});

/**
 * Sprint 113: Uhrzeiten liefen an vielen Stellen ueber
 * `toLocaleTimeString('de-DE')` ohne `timeZone`. In einer Client-Komponente
 * ist das die Zone des Browsers, beim Server-Rendering aber die des Servers —
 * dieselbe Uhrzeit steht also je nach Renderpfad unterschiedlich da, und auf
 * einem Server in UTC in beiden Faellen falsch. Hier steht die Zone fest,
 * genau wie bei `formatDate` und `formatDateTime` daneben.
 */
export function formatTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '–';
  return TIME_FORMATTER.format(d);
}

const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  // Reine DATE-Spalten ("2026-08-15") liest `new Date()` als UTC-Mitternacht.
  // Sie in einer Zone zu formatieren, waere eine Zeitzonen-Frage an etwas,
  // das keine Uhrzeit hat — westlich von Greenwich kaeme der Vortag heraus.
  timeZone: 'UTC',
});

/**
 * Kalenderdatum aus einer DATE-Spalte ("2026-08-15") — ohne Zonenrechnung.
 * Fuer Zeitstempel (timestamptz) ist `formatDate` zustaendig.
 */
export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return '–';
  const d = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '–';
  return DATE_ONLY_FORMATTER.format(d);
}
