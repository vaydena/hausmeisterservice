/**
 * Sprint 137 · Die Menuepunkte des Betreiber-Bereichs.
 *
 * Vier von sieben Eintraegen fuehrten hier bis heute ins 404:
 * /platform/invoices, /platform/plans, /platform/admins und
 * /platform/settings hatten nie eine Seite. Der Betreiber bekam also bei
 * jedem zweiten Klick eine Fehlerseite — in dem einen Bereich, den ausser
 * ihm niemand zu sehen bekommt und den deshalb auch niemand sonst melden
 * konnte.
 *
 * "Rechnungen" ist jetzt gebaut (die Belege der Freischaltungen muessen
 * irgendwo landen), die drei uebrigen sind raus. Sie kommen zurueck, wenn es
 * sie gibt: `tests/platform-nav-coverage.test.ts` liest genau diese Liste
 * und laesst keinen Eintrag mehr durch, hinter dem keine page.tsx liegt.
 *
 * Icons stehen wie in `nav-config.ts` als String-Keys hier — so bleibt diese
 * Datei frei von React-Importen und der Test kann sie ohne
 * Komponenten-Umgebung laden.
 */
export type PlatformNavIconKey = 'inbox' | 'building' | 'card' | 'receipt';

export interface PlatformNavItem {
  href: string;
  label: string;
  icon: PlatformNavIconKey;
}

export const PLATFORM_NAV_ITEMS: readonly PlatformNavItem[] = [
  { href: '/platform',          label: 'Registrierungen', icon: 'inbox' },
  { href: '/platform/tenants',  label: 'Agenturen',       icon: 'building' },
  { href: '/platform/payments', label: 'Zahlungen',       icon: 'card' },
  { href: '/platform/invoices', label: 'Rechnungen',      icon: 'receipt' },
];
