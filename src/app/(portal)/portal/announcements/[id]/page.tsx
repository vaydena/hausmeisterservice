import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { getResidentContext } from '@/lib/portal/current';
import {
  isAnnouncementUnread,
  needsAcknowledgement,
} from '@/lib/portal/announcement-read-state';
import { formatRelativeGerman } from '@/lib/schemas/notifications';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { portalAcknowledgeAnnouncementAction } from '../actions';

export const metadata: Metadata = {
  title: 'Ankündigung · Bewohner-Portal',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Sprint 75: Relative Zeit analog Sprint 74 (Meldungen-Detail). Bei
// juengeren Ankuendigungen hilft "vor 3 Tagen" beim Einordnen. Der
// Zusatz erscheint nur solange formatRelativeGerman einen relativen
// Text liefert; ab >7 Tagen wird ohnehin nur das Datum ausgegeben.
function formatDateWithRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const absolute = formatDate(iso);
  const relative = formatRelativeGerman(iso);
  const isRelative = relative === 'gerade eben' || relative.startsWith('vor ');
  return isRelative ? `${absolute} · ${relative}` : absolute;
}

export default async function PortalAnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getResidentContext();
  if (!ctx) redirect('/portal/login');

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [annRes, receiptRes] = await Promise.all([
    supabase
      .from('announcements')
      .select(
        'id, title, body, published_at, expires_at, requires_acknowledgement, status, target_type, target_property_id',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('announcement_receipts')
      .select('read_at, acknowledged_at')
      .eq('announcement_id', id)
      .eq('user_id', ctx.userId)
      .maybeSingle(),
  ]);

  if (!annRes.data) notFound();
  const a = annRes.data;
  const r = receiptRes.data;

  // Sprint 95: Zielgruppen-Info fuer den Bewohner. Bei 'property' zusaetzlich
  // den Objekt-Namen aufloesen — Bewohner sieht so, warum ihn diese
  // Ankuendigung betrifft (globaler Aushang vs. objektbezogen). 'role'/'users'
  // filtert die RLS ohnehin heraus, daher sind das im Portal effektiv tote
  // Zweige — Fallback laesst sie leer.
  let audienceLabel: string | null = null;
  if (a.target_type === 'all' || a.target_type === 'residents') {
    audienceLabel = 'Für alle Bewohner';
  } else if (a.target_type === 'property' && a.target_property_id) {
    const { data: prop } = await supabase
      .from('properties')
      .select('name')
      .eq('id', a.target_property_id)
      .maybeSingle();
    audienceLabel = prop?.name ? `Für alle Bewohner von ${prop.name}` : 'Für alle Bewohner Ihres Objekts';
  }

  // Sprint 51: Auto-Mark-Read analog zum Messages-Detail-Page. Der
  // vorherige "Als gelesen markieren"-Button hat einen Klick verlangt,
  // damit die Bell/Dashboard-Zaehler sinken — was viele Bewohner nicht
  // taten. Beim Server-Render setzen wir read_at jetzt implizit auf jetzt,
  // wenn noch kein Wert vorhanden ist. Die Ack-Semantik bleibt strikt
  // getrennt (weiterhin expliziter Button-Klick).
  const nowIso = new Date().toISOString();
  const readAt = r?.read_at ?? nowIso;
  if (isAnnouncementUnread(r)) {
    await supabase.from('announcement_receipts').upsert(
      {
        announcement_id: id,
        user_id: ctx.userId,
        read_at: nowIso,
      },
      { onConflict: 'announcement_id,user_id', ignoreDuplicates: false },
    );
  }

  const needsAck = needsAcknowledgement(a.requires_acknowledgement, r);
  // Sprint 66: Ablauf-Warnung. Das Datum "gültig bis" stand bisher
  // nur diskret im Header — Bewohner konnten so alte Aushänge lesen,
  // ohne zu bemerken, dass sie bereits abgelaufen sind. Der Ack-Button
  // bleibt bewusst aktiv: wer die Ankündigung erst nach Ablauf öffnet,
  // soll sie trotzdem quittieren können.
  const expiresAt = a.expires_at ? new Date(a.expires_at) : null;
  const isExpired = expiresAt !== null && expiresAt.getTime() < Date.now();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/portal/announcements"
          className="text-sm text-[var(--color-muted-foreground)] hover:underline"
        >
          ← zurück zu den Ankündigungen
        </Link>
      </div>

      <article className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{a.title}</h1>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Veröffentlicht {formatDateWithRelative(a.published_at)}
            {a.expires_at
              ? isExpired
                ? ` · war gültig bis ${formatDate(a.expires_at)}`
                : ` · gültig bis ${formatDate(a.expires_at)}`
              : ''}
          </p>
          {audienceLabel && (
            <p className="text-xs text-[var(--color-muted-foreground)]">{audienceLabel}</p>
          )}
        </header>
        {isExpired && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              Diese Ankündigung ist am {formatDate(a.expires_at)} abgelaufen und
              dient nur noch zur Information.
            </p>
          </div>
        )}
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{a.body}</div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {needsAck && (
            <form action={portalAcknowledgeAnnouncementAction}>
              <input type="hidden" name="id" value={a.id} />
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
              >
                Kenntnis genommen
              </button>
            </form>
          )}
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Gelesen am {formatDate(readAt)}
            {r?.acknowledged_at ? ` · quittiert am ${formatDate(r.acknowledged_at)}` : ''}
          </p>
        </div>
      </article>
    </div>
  );
}
