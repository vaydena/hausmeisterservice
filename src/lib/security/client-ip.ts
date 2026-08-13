/**
 * Extrahiert die beste verfuegbare Client-IP aus Request-Headern.
 *
 * Auf Hostinger (Reverse-Proxy vor Next-Server) trifft die echte Client-IP
 * als erster Wert in `x-forwarded-for` ein; `x-real-ip` ist ein Alias-
 * Header, den manche Proxy-Konfigurationen zusaetzlich setzen. Ohne Proxy
 * (z. B. lokaler dev-Server) sind beide Header abwesend — in dem Fall
 * geben wir den Fallback `'no-ip'` zurueck.
 *
 * Warum fail-CLOSED (Fallback zu 'no-ip' statt fail-open zu true): Ein
 * Angreifer koennte durch Entfernen der Forwarded-Header nur so einen
 * Rate-Limit-Umgehungsvektor bekommen. Mit 'no-ip' fallen ALLE Clients
 * ohne Header auf dieselbe Bucket-Zeile — im legitimen Prod-Kontext wird
 * das nie passieren (der Reverse-Proxy setzt immer x-forwarded-for), also
 * ist der Fallback ein Alarm-Zustand, kein Normalfall.
 *
 * Die Function ist ohne next/headers-Abhaengigkeit gebaut (nimmt ein
 * beliebiges Headers-artiges Objekt entgegen), damit sie im Vitest-Node-
 * Umfeld ohne Next-Runtime testbar bleibt.
 */
export function getClientIp(headers: {
  get(name: string): string | null;
}): string {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Kann eine kommaseparierte Liste sein: "client, proxy1, proxy2".
    // Der erste Eintrag ist der urspruengliche Client.
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return 'no-ip';
}
