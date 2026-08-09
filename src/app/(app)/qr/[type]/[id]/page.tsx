import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  buildDeepLink,
  isValidQrType,
  isValidUuid,
  type QrEntityType,
} from '@/lib/qr/generate';
import { PrintButton } from './print-button';

export const metadata: Metadata = { title: 'QR-Code drucken' };

const LABEL: Record<QrEntityType, string> = {
  property: 'Liegenschaft',
  unit: 'Einheit',
  building: 'Gebäude',
  key: 'Schlüssel',
  meter: 'Zähler',
  vehicle: 'Fahrzeug',
  material: 'Material',
  'defect-report': 'Mängelmeldung',
  'work-order': 'Auftrag',
};

async function loadEntitySummary(
  type: QrEntityType,
  id: string,
): Promise<{ title: string; subtitle: string | null } | null> {
  const supabase = await createSupabaseServerClient();
  if (type === 'property') {
    const { data } = await supabase
      .from('properties')
      .select('name, code, street, house_number, postal_code, city')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    const addr = [
      [data.street, data.house_number].filter(Boolean).join(' '),
      [data.postal_code, data.city].filter(Boolean).join(' '),
    ]
      .filter(Boolean)
      .join(', ');
    return {
      title: `${data.name}${data.code ? ` · ${data.code}` : ''}`,
      subtitle: addr || null,
    };
  }
  if (type === 'key') {
    const { data } = await supabase
      .from('keys')
      .select('code, label, kind')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    return {
      title: `${data.label}${data.code ? ` · ${data.code}` : ''}`,
      subtitle: data.kind,
    };
  }
  if (type === 'meter') {
    const { data } = await supabase
      .from('meters')
      .select('label, meter_number, location_note, utility_kind')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    return {
      title: `${data.label}${data.meter_number ? ` · ${data.meter_number}` : ''}`,
      subtitle: [data.utility_kind, data.location_note].filter(Boolean).join(' · ') || null,
    };
  }
  if (type === 'vehicle') {
    const { data } = await supabase
      .from('vehicles')
      .select('license_plate, model, make')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    return {
      title: data.license_plate,
      subtitle: [data.make, data.model].filter(Boolean).join(' ') || null,
    };
  }
  return { title: id, subtitle: null };
}

export default async function QrPrintPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  await requireTenantContext();
  const { type, id } = await params;
  if (!isValidQrType(type) || !isValidUuid(id)) notFound();

  const summary = await loadEntitySummary(type, id);
  if (!summary) notFound();

  const deepLink = buildDeepLink(type, id);
  const qrSrc = `/api/qr/${type}/${id}`;
  const kindLabel = LABEL[type];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 print:max-w-none print:gap-4">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <h1 className="text-lg font-semibold">QR-Code: {summary.title}</h1>
        <div className="flex gap-2">
          <PrintButton />
          <Link
            href={qrSrc}
            target="_blank"
            className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
          >
            SVG öffnen
          </Link>
        </div>
      </div>

      <article className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-lg border border-[var(--color-border)] bg-white p-6 text-black print:border-0 print:shadow-none">
        <p className="text-xs uppercase tracking-wide text-gray-500">{kindLabel}</p>
        <h2 className="text-center text-xl font-semibold">{summary.title}</h2>
        {summary.subtitle && (
          <p className="text-center text-sm text-gray-600">{summary.subtitle}</p>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrSrc}
          alt={`QR-Code für ${summary.title}`}
          className="h-64 w-64"
          width={256}
          height={256}
        />
        <p className="mt-1 break-all text-center text-[11px] text-gray-500">{deepLink}</p>
      </article>

      <p className="text-xs text-[var(--color-muted-foreground)] print:hidden">
        Tipp: QR-Code auf robuste Etiketten drucken und direkt am Objekt anbringen. Ein Scan
        führt jeden authentifizierten Nutzer direkt auf die Detail-Seite.
      </p>
    </div>
  );
}

