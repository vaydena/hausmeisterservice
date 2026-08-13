type LoginEvent = {
  id: string;
  at: string;
  ip: string | null;
  userAgent: string | null;
  endpoint: string;
};

/**
 * Kompakter Reader fuer den User-Agent: kein CSS-taugliches Browser-
 * Fingerprinting, nur eine grobe Zuordnung, die auf einen Blick sagt
 * "Firefox auf Windows" statt der langen UA-Zeile. Absichtlich klein und
 * deterministisch — bessere Erkennung wuerde eine ua-parser-Lib brauchen,
 * die Bundle-Groesse kostet.
 */
function summarizeUserAgent(ua: string | null): string {
  if (!ua) return 'Unbekannter Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'macOS'
      : /iPhone|iPad|iOS/.test(ua)
        ? 'iOS'
        : /Android/.test(ua)
          ? 'Android'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  // Reihenfolge wichtig: Edge/OPR/... enthalten "Chrome"-Substring, deshalb zuerst pruefen.
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  if (browser && os) return `${browser} auf ${os}`;
  if (browser) return browser;
  if (os) return os;
  // Fallback: erste 40 Zeichen, damit die Zeile nicht die Tabelle sprengt.
  return ua.slice(0, 40);
}

function formatEndpoint(endpoint: string): string {
  if (endpoint === 'staff-login') return 'Mitarbeiter-Login';
  if (endpoint === 'portal-login') return 'Bewohner-Portal';
  return endpoint;
}

export function LoginEventsList({ events }: { events: LoginEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Noch keine Anmeldungen protokolliert.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
            <th className="py-2 pr-3 font-medium">Zeitpunkt</th>
            <th className="py-2 pr-3 font-medium">Browser</th>
            <th className="py-2 pr-3 font-medium">IP</th>
            <th className="py-2 pr-3 font-medium">Bereich</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b border-[var(--color-border)]/60 last:border-0">
              <td className="py-2 pr-3 whitespace-nowrap">
                {new Date(e.at).toLocaleString('de-DE')}
              </td>
              <td className="py-2 pr-3">{summarizeUserAgent(e.userAgent)}</td>
              <td className="py-2 pr-3 font-mono text-xs">{e.ip ?? '–'}</td>
              <td className="py-2 pr-3 text-xs text-[var(--color-muted-foreground)]">
                {formatEndpoint(e.endpoint)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
