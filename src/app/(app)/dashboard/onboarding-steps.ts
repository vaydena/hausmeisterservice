/**
 * Sprint 121: Die vier Schritte des Willkommens-Overlays.
 *
 * Standen bis hierher in `welcome-overlay.tsx` — einer Client-Komponente.
 * Zwei der vier Ziele liegen in abschaltbaren Modulen (`/properties/new`,
 * `/work-orders/new`), und genau die bekommt ein neuer Mandant als erstes zu
 * sehen. Wer Objekte oder Auftraege abgeschaltet hat, klickte im Overlay ins
 * 404, bevor er ueberhaupt irgendwo anders war.
 *
 * `ModuleLink` ist `server-only` und in einer Client-Komponente nicht
 * verwendbar. Die Liste steht deshalb hier, frei von `'use client'`, damit
 * `dashboard/page.tsx` sie serverseitig filtern und nur die erreichbaren
 * Schritte hinunterreichen kann.
 */
export interface OnboardingStep {
  title: string;
  body: string;
  href?: string;
  cta?: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: '1. Ihr erstes Objekt anlegen',
    body: 'Erfassen Sie das erste Gebäude oder Objekt, das Sie betreuen. Später können Sie Wohnungen, Zähler und Schlüssel darunter organisieren.',
    href: '/properties/new',
    cta: 'Objekt anlegen',
  },
  {
    title: '2. Mitarbeiter einladen',
    body: 'Fügen Sie Ihr Team hinzu und weisen Sie Rollen zu — Vorarbeiter, Hausmeister, Reinigungskraft usw. Jeder bekommt eine Einladung per E-Mail.',
    href: '/settings/users',
    cta: 'Team verwalten',
  },
  {
    title: '3. Ersten Auftrag erstellen',
    body: 'Ein Auftrag ist die kleinste Arbeitseinheit — vom Wasserhahn-Wechsel bis zur Winterdienst-Runde. Zuweisen, dokumentieren, abschließen.',
    href: '/work-orders/new',
    cta: 'Auftrag anlegen',
  },
  {
    title: '4. Rechnungs-Absenderdaten hinterlegen',
    body: 'Firmenanschrift, Steuernummer und Bankverbindung — damit Ihre späteren Rechnungen und Angebote als PDF gültig sind.',
    href: '/settings/tenant',
    cta: 'Mandantendaten',
  },
];
