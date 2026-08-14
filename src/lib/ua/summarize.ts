/**
 * Sprint 31: Aus login-events-list.tsx extrahiert, damit auch die neue
 * Sessions-Liste denselben "Chrome auf Windows"-Kurzstring nutzt.
 *
 * Kein CSS-taugliches Browser-Fingerprinting, nur eine grobe Zuordnung.
 * Absichtlich klein und deterministisch — bessere Erkennung wuerde eine
 * ua-parser-Lib brauchen, die Bundle-Groesse kostet und regelmaessige
 * Regex-Updates verlangt, wenn neue Browser rauskommen.
 */
export function summarizeUserAgent(ua: string | null): string {
  if (!ua) return 'Unbekannter Browser';
  // Reihenfolge wichtig:
  //   - iPhone/iPad VOR Mac OS X — iOS-UAs enthalten "like Mac OS X".
  //   - Android VOR Linux — Android-UAs sind gekennzeichnet als
  //     "Linux; Android ...".
  //   - Windows kann irgendwo stehen (kein Konflikt-Substring).
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'macOS'
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
