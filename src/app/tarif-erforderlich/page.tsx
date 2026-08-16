import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/current';
import { getEnabledFeatures } from '@/lib/tenant/features';
import { FEATURE_LABEL, parseFeatureKey } from '@/lib/tenant/feature-map';

export const dynamic = 'force-dynamic';

/**
 * Sprint 114: Sperrseite fuer Funktionen, die der gebuchte Tarif nicht
 * enthaelt. Bewusst ausserhalb der (app)-Route-Group — sonst liefe der
 * Feature-Gate aus dem App-Layout auch ueber diese Seite und schickte den
 * Nutzer im Kreis.
 *
 * Der wichtigere Teil ist der Nicht-Inhaber-Fall: ein Mitarbeiter kann den
 * Tarif nicht aendern. Ihn auf die Abo-Seite zu schicken, die ihn wortlos
 * aufs Dashboard zurueckwirft, waere schlimmer als gar kein Hinweis — er
 * saehe nur, dass ein Menuepunkt verschwunden ist.
 */
export default async function PlanRequiredPage({
  searchParams,
}: {
  searchParams: Promise<{ feature?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/login');

  const { feature: raw } = await searchParams;
  const feature = parseFeatureKey(raw);
  if (!feature) redirect('/dashboard');

  // Wer hier ohne Grund landet — etwa ueber einen alten Link oder nach einem
  // Tarifwechsel — soll nicht vor einer Sperrmeldung stehen, die nicht mehr
  // stimmt. Kurzer Gegencheck gegen den aktuellen Plan.
  const features = await getEnabledFeatures(ctx.tenantId);
  if (features[feature]) redirect('/dashboard');

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Nicht im aktuellen Tarif</h1>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          <strong className="text-[var(--color-foreground)]">{FEATURE_LABEL[feature]}</strong> ist
          in Ihrem gebuchten Tarif nicht enthalten. Ihre Daten bleiben unberührt — die Funktion
          steht sofort wieder zur Verfügung, sobald der Tarif sie abdeckt.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {ctx.isOwner ? (
            <Link
              href="/settings/subscription"
              className="inline-flex h-10 items-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
            >
              Tarif ansehen
            </Link>
          ) : (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Den Tarif kann nur der Inhaber Ihrer Agentur ändern. Bitte wenden Sie sich an ihn,
              wenn Sie diese Funktion benötigen.
            </p>
          )}
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center rounded-md border border-[var(--color-border)] px-4 text-sm hover:bg-[var(--color-muted)]"
          >
            Zurück zum Dashboard
          </Link>
        </div>
      </div>

      <p className="text-center text-xs text-[var(--color-muted-foreground)]">
        Ein Überblick, welcher Tarif was enthält, steht auf der{' '}
        <Link href="/preise" className="underline underline-offset-2">
          Preisseite
        </Link>
        .
      </p>
    </main>
  );
}
