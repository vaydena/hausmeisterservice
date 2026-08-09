import { test, expect } from '@playwright/test';

/**
 * Smoke: alle Kern-Module laden ohne Fehler.
 * Session ist über auth.setup.ts vorbereitet.
 */

const ROUTES = [
  { path: '/dashboard', heading: /dashboard/i },
  { path: '/properties', heading: /objekte/i },
  { path: '/people', heading: /mitarbeiter|benutzer|personen/i },
  { path: '/work-orders', heading: /aufträge/i },
  { path: '/defect-reports', heading: /mängel/i },
  { path: '/schedule', heading: /kalender|planung|schedule/i },
  { path: '/time-tracking', heading: /zeit/i },
  { path: '/tours', heading: /touren/i },
  { path: '/vehicles', heading: /fahrzeuge/i },
  { path: '/materials', heading: /material/i },
  { path: '/keys', heading: /schlüssel/i },
  { path: '/meters', heading: /zähler/i },
  { path: '/messages', heading: /nachrichten/i },
  { path: '/announcements', heading: /ankündigungen/i },
  { path: '/billing', heading: /abrechnung/i },
  { path: '/billing/offers', heading: /angebote/i },
  { path: '/billing/invoices', heading: /rechnungen/i },
  { path: '/reports', heading: /reporting/i },
  { path: '/reports/work-orders', heading: /auftragsbericht/i },
  { path: '/reports/materials', heading: /materialbericht/i },
  { path: '/reports/time', heading: /zeitbericht/i },
];

for (const route of ROUTES) {
  test(`Route lädt: ${route.path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `HTTP-Status für ${route.path}`).toBeLessThan(400);

    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });

    // Keine unerwarteten Fehler in Console/Runtime (Next-HMR / DevTools ignorieren)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('Failed to fetch') &&
        !e.includes('DevTools') &&
        !e.includes('Fast Refresh') &&
        !e.includes('sw.js'),
    );
    expect(criticalErrors, `Console errors auf ${route.path}: ${criticalErrors.join('; ')}`).toHaveLength(0);
  });
}
