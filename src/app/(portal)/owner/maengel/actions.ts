'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireOwnerContext } from '@/lib/owner-portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const PRIORITIES = ['low', 'normal', 'high', 'emergency'] as const;

const defectSchema = z.object({
  property_id: z.string().uuid('Bitte ein Objekt auswählen.'),
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
});

const withdrawSchema = z.object({
  id: z.string().uuid('Ungültige Meldungs-ID.'),
});

export type OwnerDefectFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function friendly(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

/**
 * Eigentümermeldung anlegen. Anders als beim Bewohner (genau ein Objekt)
 * waehlt der Eigentuemer das Objekt aus seiner Liste — validiert gegen
 * ctx.propertyIds (Defense-in-Depth; die RLS-Policy defect_reports_insert_owner
 * erzwingt property_owner_owns_property ohnehin). v1 ist bewusst text-only:
 * ein Foto-Upload braeuchte eine eigene owner-INSERT-Policy auf photos/documents
 * plus Storage-RLS und kommt spaeter.
 */
export async function createOwnerDefectAction(
  _prev: OwnerDefectFormState,
  formData: FormData,
): Promise<OwnerDefectFormState> {
  const ctx = await requireOwnerContext();

  const parsed = defectSchema.safeParse({
    property_id: formData.get('property_id') ?? '',
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? undefined,
    location_details: formData.get('location_details') ?? undefined,
    priority: formData.get('priority') ?? 'normal',
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, error: 'Bitte prüfen Sie die Eingaben.' };
  }

  if (!ctx.propertyIds.includes(parsed.data.property_id)) {
    return {
      error: 'Bitte ein gültiges Objekt auswählen.',
      fieldErrors: { property_id: 'Objekt nicht gefunden.' },
    };
  }

  const supabase = await createSupabaseServerClient();
  const inserted = await supabase
    .from('defect_reports')
    .insert({
      tenant_id: ctx.tenantId,
      property_id: parsed.data.property_id,
      title: parsed.data.title,
      description: parsed.data.description,
      location_details: parsed.data.location_details,
      priority: parsed.data.priority,
      reporter_kind: 'owner',
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

  revalidatePath('/owner/maengel');
  revalidatePath('/owner/dashboard');
  redirect(`/owner/maengel/${inserted.data.id}`);
}

/**
 * Eigentuemer zieht eine eigene Meldung zurueck, solange die Hausverwaltung
 * sie noch nicht in Bearbeitung genommen hat (status='new'). Guards laufen als
 * Query-Filter (reporter_user_id + status='new') — RLS (defect_reports_delete_
 * owner_own) erlaubt ohnehin nur eigene, noch-neue Meldungen; der WHERE-Filter
 * macht daraus ein atomares No-op, wenn die Voraussetzung fehlt.
 */
export async function withdrawOwnerDefectAction(formData: FormData): Promise<void> {
  const ctx = await requireOwnerContext();
  const parsed = withdrawSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Meldungs-ID.');
  }

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from('defect_reports')
    .delete({ count: 'exact' })
    .eq('id', parsed.data.id)
    .eq('reporter_user_id', ctx.userId)
    .eq('status', 'new');

  if (error) {
    throw new Error('Zurückziehen fehlgeschlagen. Bitte erneut versuchen.');
  }
  if (!count) {
    throw new Error(
      'Diese Meldung kann nicht mehr zurückgezogen werden. Sie wurde bereits bearbeitet.',
    );
  }

  revalidatePath('/owner/maengel');
  revalidatePath('/owner/dashboard');
  redirect('/owner/maengel?info=withdrawn');
}
