'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireResidentContext } from '@/lib/portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
