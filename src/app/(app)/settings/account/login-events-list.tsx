import { summarizeUserAgent } from '@/lib/ua/summarize';
import { formatDateTime } from '@/lib/utils/format';

type LoginEvent = {
  id: string;
  at: string;
  ip: string | null;
  userAgent: string | null;
  endpoint: string;
};

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
                {formatDateTime(e.at)}
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
