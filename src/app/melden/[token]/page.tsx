import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, MapPin } from 'lucide-react';
import { resolveReportLink } from '@/lib/report-links/resolve';
import { PublicReportForm } from './report-form';

/**
 * Kein Prerendering: die Seite haengt an einem Token, das erst zur Laufzeit
 * aufgeloest werden kann, und an einem widerrufbaren Zustand (`active`).
 * Eine gecachte Variante wuerde einen abgeschalteten Aufkleber weiter
 * bedienen.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mangel melden',
  // Melde-Links gehoeren nicht in Suchmaschinen. Der Token ist zwar kein
  // Geheimnis, aber ein indexierter Aufkleber-Link waere ein oeffentlich
  // auffindbares Eingabeformular in fremde Betriebsdaten.
  robots: { index: false, follow: false },
};

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolution = await resolveReportLink(token);

  if (!resolution.ok) {
    return (
      <Shell title="Mangel melden">
        <div className="flex flex-col gap-3">
          {resolution.reason === 'unavailable' ? (
            <>
              <h2 className="text-lg font-semibold">Gerade nicht erreichbar</h2>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Der Dienst antwortet im Moment nicht. Bitte laden Sie die Seite in
                einigen Minuten neu. Bei dringenden Fällen wenden Sie sich bitte
                direkt an Ihre Hausverwaltung.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold">Dieser Code ist nicht mehr gültig</h2>
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Der Melde-Link wurde abgeschaltet oder gehört zu keinem aktiven
                Objekt. Bitte wenden Sie sich direkt an Ihre Hausverwaltung.
              </p>
            </>
          )}
        </div>
      </Shell>
    );
  }

  const link = resolution.context;

  return (
    <Shell title="Mangel melden">
      <div className="mb-6 flex flex-col gap-2 border-b border-[var(--color-border)] pb-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Building2 className="size-4 shrink-0 text-[var(--color-muted-foreground)]" aria-hidden />
          <span>{link.propertyName}</span>
        </div>
        {(link.propertyAddress || link.buildingName || link.linkLabel) && (
          <div className="flex items-start gap-2 text-sm text-[var(--color-muted-foreground)]">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {[link.buildingName, link.linkLabel, link.propertyAddress]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        )}
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          Ihre Meldung geht direkt an <strong>{link.tenantName}</strong>. Eine
          Anmeldung ist nicht nötig.
        </p>
      </div>

      <PublicReportForm token={token} tenantName={link.tenantName} />
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center bg-[var(--color-muted)] px-4 py-8">
      <div className="w-full max-w-lg">
        <h1 className="mb-6 text-center text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
          {children}
        </div>
        <nav
          aria-label="Rechtliche Hinweise"
          className="mt-6 flex justify-center gap-4 text-xs text-[var(--color-muted-foreground)]"
        >
          <Link href="/impressum" className="hover:text-[var(--color-foreground)] hover:underline">
            Impressum
          </Link>
          <Link href="/datenschutz" className="hover:text-[var(--color-foreground)] hover:underline">
            Datenschutz
          </Link>
        </nav>
      </div>
    </div>
  );
}
