import { describe, it, expect } from 'vitest';
import { summarizeUserAgent } from '@/lib/ua/summarize';

// Repräsentative User-Agents echter Browser (nicht ausgedacht) — die
// Regex-Prioritaeten (Edge vor Chrome, OPR vor Chrome) haben in der
// Vergangenheit zu Fehlklassifikationen gefuehrt, daher hier fest verdrahtet.
const UA = {
  chromeWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  firefoxWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  edgeWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  operaWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  firefoxLinux:
    'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
} as const;

describe('summarizeUserAgent', () => {
  it('returns "Unbekannter Browser" for null input', () => {
    expect(summarizeUserAgent(null)).toBe('Unbekannter Browser');
  });

  it('recognises Chrome on Windows', () => {
    expect(summarizeUserAgent(UA.chromeWin)).toBe('Chrome auf Windows');
  });

  it('recognises Firefox on Windows', () => {
    expect(summarizeUserAgent(UA.firefoxWin)).toBe('Firefox auf Windows');
  });

  it('recognises Edge on Windows even though its UA contains "Chrome"', () => {
    // Edge sendet "Chrome/... Edg/..." — die Reihenfolge im summarize-Regex
    // pruefen "Edg" zuerst, damit ein Edge-Client nicht faelschlich als
    // Chrome ausgewiesen wird. Sonst waere die Sessions-Liste fuer
    // Edge-User immer irrefuehrend.
    expect(summarizeUserAgent(UA.edgeWin)).toBe('Edge auf Windows');
  });

  it('recognises Opera on Windows even though its UA contains "Chrome"', () => {
    // Analog zu Edge — Opera sendet "Chrome/... OPR/..." und muss vor der
    // Chrome-Regel abgefangen werden.
    expect(summarizeUserAgent(UA.operaWin)).toBe('Opera auf Windows');
  });

  it('recognises Safari on macOS', () => {
    expect(summarizeUserAgent(UA.safariMac)).toBe('Safari auf macOS');
  });

  it('recognises Chrome on Android', () => {
    expect(summarizeUserAgent(UA.chromeAndroid)).toBe('Chrome auf Android');
  });

  it('recognises Safari on iOS (iPhone)', () => {
    expect(summarizeUserAgent(UA.safariIphone)).toBe('Safari auf iOS');
  });

  it('recognises Firefox on Linux', () => {
    expect(summarizeUserAgent(UA.firefoxLinux)).toBe('Firefox auf Linux');
  });

  it('falls back to the first 40 chars for an unrecognised UA', () => {
    const weird = 'ExoticBot/1.0 (very old server-to-server crawler with unusual signature and lots of details)';
    const summary = summarizeUserAgent(weird);
    expect(summary.length).toBeLessThanOrEqual(40);
    expect(summary).toBe(weird.slice(0, 40));
  });
});
