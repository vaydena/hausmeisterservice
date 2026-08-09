import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DUMMY_UUID = '00000000-0000-0000-0000-000000000000';
const PORTAL_DIR = join(process.cwd(), 'src', 'app', '(portal)');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function urlToExpectedFile(url: string): string {
  const clean = url.replace(/[?#].*$/, '');
  const segments = clean.split('/').filter(Boolean);
  const mapped = segments.map((seg) => (UUID_RE.test(seg) ? '[id]' : seg));
  return join(...mapped, 'page.tsx');
}

function assertRouteExists(url: string, context: string): void {
  const relative = urlToExpectedFile(url);
  const abs = join(PORTAL_DIR, relative);
  const displayed = relative.split(/[\\/]/).join('/');
  expect(
    existsSync(abs),
    `${context}: ${url} → expected src/app/(portal)/${displayed}`,
  ).toBe(true);
}

describe('Portal deep-links', () => {
  describe('static navigation targets (portal-nav, dashboard, cross-page links)', () => {
    const staticLinks: Array<{ url: string; where: string }> = [
      { url: '/portal', where: 'root portal redirect' },
      { url: '/portal/login', where: 'portal login (proxy + form redirects)' },
      { url: '/portal/dashboard', where: 'portal-nav + post-login redirect' },
      { url: '/portal/announcements', where: 'portal-nav + dashboard panel' },
      { url: '/portal/defects', where: 'portal-nav + dashboard panel + back-link' },
      { url: '/portal/defects/new', where: 'defects list "Neue Meldung" button' },
      { url: '/portal/messages', where: 'portal-nav + dashboard panel + back-link' },
    ];

    for (const { url, where } of staticLinks) {
      it(`${where} → ${url} routes to a page.tsx`, () => {
        assertRouteExists(url, where);
      });
    }
  });

  describe('dynamic entity deep-links (rendered from DB rows)', () => {
    const dynamicLinks: Array<{ url: string; where: string }> = [
      {
        url: `/portal/announcements/${DUMMY_UUID}`,
        where: 'announcement rows (dashboard list + inbox list)',
      },
      {
        url: `/portal/defects/${DUMMY_UUID}`,
        where: 'defect rows (dashboard list + inbox list) + post-create redirect',
      },
      {
        url: `/portal/messages/${DUMMY_UUID}`,
        where: 'message thread rows + revalidate targets',
      },
    ];

    for (const { url, where } of dynamicLinks) {
      it(`${where} → ${url} routes to a page.tsx`, () => {
        assertRouteExists(url, where);
      });
    }
  });

  describe('cross-boundary redirects into portal (from /login and /(app))', () => {
    it('staff login action redirects residents to /portal/dashboard', () => {
      assertRouteExists('/portal/dashboard', '(auth)/login/actions.ts');
    });

    it('(app)/layout redirects lone residents to /portal/dashboard', () => {
      assertRouteExists('/portal/dashboard', '(app)/layout.tsx');
    });
  });
});
