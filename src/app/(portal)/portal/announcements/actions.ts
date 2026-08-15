'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireResidentContext } from '@/lib/portal/current';
import { isAnnouncementUnread } from '@/lib/portal/announcement-read-state';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';

const idSchema = z.object({
  id: z.string().uuid('Ungültige Ankündigungs-ID.'),
});

export async function portalAcknowledgeAnnouncementAction(formData: FormData): Promise<void> {
  const ctx = await requireResidentContext();
  const parsed = idSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) throw new Error('Ungültige Ankündigungs-ID.');

  const now = new Date().toISOString();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('announcement_receipts').upsert(
    {
      announcement_id: parsed.data.id,
      user_id: ctx.userId,
      read_at: now,
      acknowledged_at: now,
    },
    { onConflict: 'announcement_id,user_id', ignoreDuplicates: false },
  );
  if (error) throw new Error(error.message);

  revalidatePath('/portal/announcements');
  revalidatePath(`/portal/announcements/${parsed.data.id}`);
  revalidatePath('/portal/dashboard');
}

// Sprint 71: "Alle als gelesen markieren" — Inbox-Zero-Feature. Wir
// laden alle published announcements + existing receipts, filtern auf
// die noch nicht als gelesen markierten (read_at IS NULL bzw. kein
// receipt vorhanden) und upsert alle mit read_at=now. acknowledged_at
// wird explizit weitergereicht, damit ein bereits quittiertes receipt
// nicht ueberschrieben wird — Supabase-JS upsert setzt DO UPDATE SET
// auf alle Felder im Objekt, und ohne acknowledged_at wuerde die
// bestehende Quittierung auf NULL zurueckfallen.
export async function markAllPortalAnnouncementsReadAction(): Promise<void> {
  const ctx = await requireResidentContext();
  const supabase = await createSupabaseServerClient();

  const [annRes, recRes] = await Promise.all([
    supabase.from('announcements').select('id').eq('status', 'published'),
    supabase
      .from('announcement_receipts')
      .select('announcement_id, read_at, acknowledged_at')
      .eq('user_id', ctx.userId),
  ]);
  // Sprint 103: War hier schon korrekt (expliziter throw je Result) und ist
  // jetzt nur noch auf denselben Helper wie der Rest des Portals umgestellt.
  const receiptMap = new Map(
    unwrapRows(recRes, 'Portal: Lesebestätigungen (Alle-gelesen)').map((r) => [
      r.announcement_id,
      r,
    ]),
  );

  const now = new Date().toISOString();
  const toUpsert = unwrapRows(annRes, 'Portal: Ankündigungen (Alle-gelesen)')
    .filter((a) => isAnnouncementUnread(receiptMap.get(a.id)))
    .map((a) => ({
      announcement_id: a.id,
      user_id: ctx.userId,
      read_at: now,
      acknowledged_at: receiptMap.get(a.id)?.acknowledged_at ?? null,
    }));

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from('announcement_receipts')
      .upsert(toUpsert, { onConflict: 'announcement_id,user_id', ignoreDuplicates: false });
    if (error) throw new Error(error.message);
  }

  revalidatePath('/portal/announcements');
  revalidatePath('/portal/dashboard');
}
