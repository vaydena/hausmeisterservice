import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  NOTIFICATION_ENTITY_TYPES,
  notificationHref,
} from '../src/lib/schemas/notifications';

const DUMMY_UUID = '00000000-0000-0000-0000-000000000000';
const APP_DIR = join(process.cwd(), 'src', 'app', '(app)');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function urlToExpectedFile(url: string): string {
  const clean = url.replace(/[?#].*$/, '');
  const segments = clean.split('/').filter(Boolean);
  const mapped = segments.map((seg) => (UUID_RE.test(seg) ? '[id]' : seg));
  return join(...mapped, 'page.tsx');
}

function assertRouteExists(url: string, context: string): void {
  const relative = urlToExpectedFile(url);
  const abs = join(APP_DIR, relative);
  const displayed = relative.split(/[\\/]/).join('/');
  expect(
    existsSync(abs),
    `${context}: ${url} → expected src/app/(app)/${displayed}`,
  ).toBe(true);
}

describe('Notification deep-links', () => {
  describe('schema-driven notificationHref()', () => {
    for (const type of NOTIFICATION_ENTITY_TYPES) {
      it(`entity type "${type}" resolves to an existing page.tsx`, () => {
        const url = notificationHref(type, DUMMY_UUID, null);
        assertRouteExists(url, `entityType=${type}`);
      });
    }

    it('default fallback (no entity) → /notifications', () => {
      const url = notificationHref(null, null, null);
      expect(url).toBe('/notifications');
      assertRouteExists(url, 'default fallback');
    });

    it('urlOverride wins over entity-derived href', () => {
      const url = notificationHref('property', DUMMY_UUID, '/custom/target');
      expect(url).toBe('/custom/target');
    });
  });

  describe('static url overrides in server actions & automation engine', () => {
    const overrides: Array<{ url: string; where: string }> = [
      { url: `/keys/${DUMMY_UUID}`, where: 'keys/actions.ts (missed return)' },
      {
        url: `/time-corrections/${DUMMY_UUID}`,
        where: 'time-corrections/actions.ts (request + decide)',
      },
      { url: '/schedule', where: 'schedule/actions.ts (own shift assigned)' },
      { url: `/work-orders/${DUMMY_UUID}`, where: 'automations engine (work_order.*)' },
      { url: `/defect-reports/${DUMMY_UUID}`, where: 'automations engine (defect_report.*)' },
      { url: `/maintenance/${DUMMY_UUID}`, where: 'automations engine (maintenance_due)' },
      { url: `/billing/invoices/${DUMMY_UUID}`, where: 'automations engine (billing_due/overdue)' },
    ];

    for (const { url, where } of overrides) {
      it(`${where} → ${url} routes to a page.tsx`, () => {
        assertRouteExists(url, where);
      });
    }
  });
});
