import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isValidQrType, isValidUuid, type QrEntityType } from '@/lib/qr/generate';
import { PrintButton } from '../[type]/[id]/print-button';

export const metadata: Metadata = { title: 'QR-Codes drucken (Sammel-Bogen)' };

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

// Sammel-Druck ist nur für physisch anzubringende Objekte sinnvoll.
const SUPPORTED_TYPES: QrEntityType[] = ['property', 'key', 'meter', 'vehicle'];

const MAX_IDS = 60;

type Sticker = {
  id: string;
  kindLabel: string;
  title: string;
  subtitle: string | null;
};

async function loadStickers(
  type: QrEntityType,
  ids: string[],
): Promise<Sticker[]> {
  const supabase = await createSupabaseServerClient();
  const kindLabel = LABEL[type];

  if (type === 'property') {
    const { data } = await supabase
      .from('properties')
      .select('id, name, code, street, house_number, postal_code, city')
      .in('id', ids)
      .is('deleted_at', null);
    return (data ?? []).map((p) => {
      const addr = [
        [p.street, p.house_number].filter(Boolean).join(' '),
        [p.postal_code, p.city].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join(', ');
      return {
        id: p.id,
        kindLabel,
        title: `${p.name}${p.code ? ` · ${p.code}` : ''}`,
        subtitle: addr || null,
      };
    });
  }
  if (type === 'key') {
    const { data } = await supabase
      .from('keys')
      .select('id, code, label, kind, storage_location')
      .in('id', ids)
      .is('deleted_at', null);
    return (data ?? []).map((k) => ({
      id: k.id,
      kindLabel,
      title: `${k.label}${k.code ? ` · ${k.code}` : ''}`,
      subtitle: [k.kind, k.storage_location].filter(Boolean).join(' · ') || null,
    }));
  }
  if (type === 'meter') {
    const { data } = await supabase
      .from('meters')
      .select('id, label, meter_number, location_note, utility_kind')
      .in('id', ids)
      .is('deleted_at', null);
    return (data ?? []).map((m) => ({
      id: m.id,
      kindLabel,
      title: `${m.label}${m.meter_number ? ` · ${m.meter_number}` : ''}`,
      subtitle:
        [m.utility_kind, m.location_note].filter(Boolean).join(' · ') || null,
    }));
  }
  if (type === 'vehicle') {
    const { data } = await supabase
      .from('vehicles')
      .select('id, license_plate, model, make')
      .in('id', ids)
      .is('deleted_at', null);
    return (data ?? []).map((v) => ({
      id: v.id,
      kindLabel,
      title: v.license_plate,
      subtitle: [v.make, v.model].filter(Boolean).join(' ') || null,
    }));
  }
  return [];
}

export default async function QrSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; ids?: string }>;
}) {
  await requireTenantContext();
  const params = await searchParams;
  const type = params.type;
  const idsRaw = params.ids ?? '';

  if (!type || !isValidQrType(type) || !SUPPORTED_TYPES.includes(type)) {
    notFound();
  }

  const uniqueIds = Array.from(
    new Set(
      idsRaw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .filter(isValidUuid),
    ),
  ).slice(0, MAX_IDS);

  if (uniqueIds.length === 0) notFound();

  // RLS filtert automatisch auf Tenant — deshalb reicht ein einfaches .in('id', ids).
  const loaded = await loadStickers(type, uniqueIds);
  // Reihenfolge wie in der URL, damit der Auslöser das erwartete Layout bekommt.
  const byId = new Map(loaded.map((s) => [s.id, s]));
  const stickers = uniqueIds.map((id) => byId.get(id)).filter((s): s is Sticker => Boolean(s));
  const missing = uniqueIds.length - stickers.length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 print:max-w-none print:gap-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-lg font-semibold">
            QR-Codes drucken: {LABEL[type]} ({stickers.length})
          </h1>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            A4-Bogen mit 15 Aufklebern pro Seite. Zum Drucken „Randlos" oder „Skalieren:
            keine" wählen, damit die Rasterung stimmt.
            {missing > 0 && (
              <>
                {' '}
                <span className="text-[var(--color-destructive)]">
                  {missing} ID{missing === 1 ? '' : 's'} nicht gefunden oder gelöscht — übersprungen.
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <Link
            href={`/${type === 'key' ? 'keys' : type === 'meter' ? 'meters' : type === 'vehicle' ? 'vehicles' : 'properties'}`}
            className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
          >
            Zurück zur Liste
          </Link>
        </div>
      </div>

      {/* Print-Bogen: 3 Spalten × 5 Reihen = 15 Sticker/Seite (Avery-ähnliches Raster) */}
      <div className="grid grid-cols-3 gap-2 bg-white p-2 text-black print:gap-0 print:p-0">
        {stickers.map((s) => (
          <article
            key={s.id}
            className="flex break-inside-avoid flex-col items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white p-3 print:break-inside-avoid print:rounded-none print:border-gray-400"
          >
            <p className="text-[9px] uppercase tracking-widest text-gray-500">
              {s.kindLabel}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/qr/${type}/${s.id}`}
              alt={`QR-Code ${s.title}`}
              className="h-28 w-28"
              width={112}
              height={112}
            />
            <p className="line-clamp-2 text-center text-[11px] font-semibold leading-tight">
              {s.title}
            </p>
            {s.subtitle && (
              <p className="line-clamp-1 text-center text-[9px] text-gray-600">
                {s.subtitle}
              </p>
            )}
          </article>
        ))}
      </div>

      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          html, body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
