'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireResidentContext } from '@/lib/portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const PRIORITIES = ['low', 'normal', 'high', 'emergency'] as const;

const defectSchema = z.object({
  title: z.string().trim().min(3, 'Bitte einen aussagekräftigen Titel angeben.').max(200),
  description: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  location_details: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  priority: z.enum(PRIORITIES).default('normal'),
  category: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type PortalDefectFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function friendly(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

export async function createPortalDefectAction(
  _prev: PortalDefectFormState,
  formData: FormData,
): Promise<PortalDefectFormState> {
  const ctx = await requireResidentContext();

  const parsed = defectSchema.safeParse({
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? undefined,
    location_details: formData.get('location_details') ?? undefined,
    priority: formData.get('priority') ?? 'normal',
    category: formData.get('category') ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: 'Bitte prüfen Sie die Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();
  const inserted = await supabase
    .from('defect_reports')
    .insert({
      tenant_id: ctx.tenantId,
      property_id: ctx.propertyId,
      building_id: ctx.buildingId,
      unit_id: ctx.unitId,
      title: parsed.data.title,
      description: parsed.data.description,
      location_details: parsed.data.location_details,
      priority: parsed.data.priority,
      category: parsed.data.category,
      reporter_kind: 'resident',
      reporter_user_id: ctx.userId,
      reporter_name: ctx.displayName,
      reporter_contact: ctx.email,
      code: '',
    })
    .select('id')
    .single();

  if (inserted.error || !inserted.data) {
    return { error: friendly(inserted.error?.message) };
  }

  revalidatePath('/portal/defects');
  revalidatePath('/portal/dashboard');
  redirect(`/portal/defects/${inserted.data.id}`);
}
