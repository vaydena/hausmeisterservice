import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getResidentContext } from '@/lib/portal/current';
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
        'id, title, body, published_at, expires_at, requires_acknowledgement, status',
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

  // Sprint 51: Auto-Mark-Read analog zum Messages-Detail-Page. Der
  // vorherige "Als gelesen markieren"-Button hat einen Klick verlangt,
  // damit die Bell/Dashboard-Zaehler sinken — was viele Bewohner nicht
  // taten. Beim Server-Render setzen wir read_at jetzt implizit auf jetzt,
  // wenn noch kein Wert vorhanden ist. Die Ack-Semantik bleibt strikt
  // getrennt (weiterhin expliziter Button-Klick).
  const nowIso = new Date().toISOString();
  const readAt = r?.read_at ?? nowIso;
  if (!r?.read_at) {
    await supabase.from('announcement_receipts').upsert(
      {
        announcement_id: id,
        user_id: ctx.userId,
        read_at: nowIso,
      },
      { onConflict: 'announcement_id,user_id', ignoreDuplicates: false },
    );
  }

  const needsAck = a.requires_acknowledgement && !r?.acknowledged_at;

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
            Veröffentlicht {formatDate(a.published_at)}
            {a.expires_at ? ` · gültig bis ${formatDate(a.expires_at)}` : ''}
          </p>
        </header>
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
