'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/notifications/create';
import {
  keyInputSchema,
  keyStatusUpdateSchema,
  issueSchema,
  returnSchema,
  lostSchema,
  retiredSchema,
  replacedSchema,
} from '@/lib/schemas/keys';

export type KeyFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

function fieldErrorsFromZod(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

function parseForm<T extends z.ZodTypeAny>(schema: T, formData: FormData) {
  const raw: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) if (typeof v === 'string') raw[k] = v;
  return schema.safeParse(raw);
}

function friendlyDbMessage(msg?: string | null): string {
  if (!msg) return 'Speichern fehlgeschlagen.';
  if (msg.includes('row-level security')) return 'Sie haben keine Berechtigung für diese Aktion.';
  if (msg.includes('key_handovers_shape'))
    return 'Der Vorgang ist im falschen Zustand für diese Aktion.';
  if (msg.includes('violates foreign key')) return 'Verweis ist ungültig.';
  return 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
}

/* -------------------------------------------------------------------------- */
/* Keys — CRUD                                                                */
/* -------------------------------------------------------------------------- */

export async function createKeyAction(
  _prev: KeyFormState,
  formData: FormData,
): Promise<KeyFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(keyInputSchema, formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('keys')
    .insert({
      tenant_id: ctx.tenantId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      ...parsed.data,
    })
    .select('id')
    .single();

  if (error || !data) return { error: friendlyDbMessage(error?.message) };

  revalidatePath('/keys');
  redirect(`/keys/${data.id}`);
}

export async function updateKeyAction(
  keyId: string,
  _prev: KeyFormState,
  formData: FormData,
): Promise<KeyFormState> {
  const ctx = await requireTenantContext();
  const parsed = parseForm(keyInputSchema, formData);
  if (!parsed.success) {
    return {
      fieldErrors: fieldErrorsFromZod(parsed.error),
      error: 'Bitte prüfen Sie die Eingaben.',
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('keys')
    .update({ ...parsed.data, updated_by: ctx.userId })
    .eq('id', keyId);

  if (error) return { error: friendlyDbMessage(error.message) };

  revalidatePath('/keys');
  revalidatePath(`/keys/${keyId}`);
  redirect(`/keys/${keyId}`);
}

export async function setKeyStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = keyStatusUpdateSchema.safeParse({
    key_id: formData.get('key_id') ?? '',
    status: formData.get('status') ?? '',
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('keys')
    .update({ status: parsed.data.status, updated_by: ctx.userId })
    .eq('id', parsed.data.key_id);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/keys');
  revalidatePath(`/keys/${parsed.data.key_id}`);
}

export async function softDeleteKeyAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const keyId = String(formData.get('key_id') ?? '');
  if (!keyId) throw new Error('Schlüssel fehlt.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('keys')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('id', keyId);

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/keys');
  redirect('/keys');
}

/* -------------------------------------------------------------------------- */
/* Handovers                                                                  */
/* -------------------------------------------------------------------------- */

async function loadKeyProperty(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  keyId: string,
): Promise<{ property_id: string; label: string; code: string | null }> {
  const { data, error } = await supabase
    .from('keys')
    .select('property_id, label, code')
    .eq('id', keyId)
    .maybeSingle();
  if (error || !data) throw new Error('Schlüssel nicht gefunden.');
  return data;
}

export async function issueKeyAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = issueSchema.safeParse({
    key_id: formData.get('key_id') ?? '',
    holder_kind: formData.get('holder_kind') ?? '',
    holder_user_id: formData.get('holder_user_id') ?? undefined,
    holder_name: formData.get('holder_name') ?? undefined,
    holder_contact: formData.get('holder_contact') ?? undefined,
    expected_return_at: formData.get('expected_return_at') ?? undefined,
    copies_count: formData.get('copies_count') ?? 1,
    reference_work_order_id: formData.get('reference_work_order_id') ?? undefined,
    note: formData.get('note') ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();
  const key = await loadKeyProperty(supabase, parsed.data.key_id);

  const { data: inserted, error } = await supabase
    .from('key_handovers')
    .insert({
      tenant_id: ctx.tenantId,
      key_id: parsed.data.key_id,
      property_id: key.property_id,
      kind: 'issue',
      holder_kind: parsed.data.holder_kind,
      holder_user_id: parsed.data.holder_user_id,
      holder_name: parsed.data.holder_name,
      holder_contact: parsed.data.holder_contact,
      expected_return_at: parsed.data.expected_return_at,
      copies_count: parsed.data.copies_count,
      reference_work_order_id: parsed.data.reference_work_order_id,
      note: parsed.data.note,
      performed_by: ctx.userId,
    })
    .select('id')
    .single();

  if (error || !inserted) throw new Error(friendlyDbMessage(error?.message));

  if (parsed.data.holder_user_id && parsed.data.holder_user_id !== ctx.userId) {
    const label = key.code ? `${key.code} · ${key.label}` : key.label;
    await createNotification({
      userId: parsed.data.holder_user_id,
      kind: 'mention',
      subject: `Schlüssel ausgegeben: ${label}`,
      body: parsed.data.expected_return_at
        ? `Rückgabe erwartet bis ${new Date(parsed.data.expected_return_at).toLocaleString('de-DE')}`
        : undefined,
      entityType: null,
      entityId: null,
      url: `/keys/${parsed.data.key_id}`,
    });
  }

  revalidatePath('/keys');
  revalidatePath(`/keys/${parsed.data.key_id}`);
}

export async function returnKeyAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = returnSchema.safeParse({
    issue_handover_id: formData.get('issue_handover_id') ?? '',
    copies_count: formData.get('copies_count') ?? 1,
    note: formData.get('note') ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();

  const { data: issue, error: issueErr } = await supabase
    .from('key_handovers')
    .select('id, key_id, property_id, tenant_id, holder_user_id')
    .eq('id', parsed.data.issue_handover_id)
    .maybeSingle();
  if (issueErr || !issue) throw new Error('Ausgabe nicht gefunden.');

  const { error } = await supabase.from('key_handovers').insert({
    tenant_id: issue.tenant_id,
    key_id: issue.key_id,
    property_id: issue.property_id,
    kind: 'return',
    issue_handover_id: issue.id,
    copies_count: parsed.data.copies_count,
    note: parsed.data.note,
    performed_by: ctx.userId,
  });

  if (error) throw new Error(friendlyDbMessage(error.message));

  revalidatePath('/keys');
  revalidatePath(`/keys/${issue.key_id}`);
}

export async function markKeyLostAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = lostSchema.safeParse({
    key_id: formData.get('key_id') ?? '',
    copies_count: formData.get('copies_count') ?? 1,
    note: formData.get('note') ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();
  const key = await loadKeyProperty(supabase, parsed.data.key_id);

  const { error: insertErr } = await supabase.from('key_handovers').insert({
    tenant_id: ctx.tenantId,
    key_id: parsed.data.key_id,
    property_id: key.property_id,
    kind: 'lost',
    copies_count: parsed.data.copies_count,
    note: parsed.data.note,
    performed_by: ctx.userId,
  });
  if (insertErr) throw new Error(friendlyDbMessage(insertErr.message));

  const { error: statusErr } = await supabase
    .from('keys')
    .update({ status: 'lost', updated_by: ctx.userId })
    .eq('id', parsed.data.key_id);
  if (statusErr) throw new Error(friendlyDbMessage(statusErr.message));

  revalidatePath('/keys');
  revalidatePath(`/keys/${parsed.data.key_id}`);
}

export async function markKeyRetiredAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = retiredSchema.safeParse({
    key_id: formData.get('key_id') ?? '',
    note: formData.get('note') ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();
  const key = await loadKeyProperty(supabase, parsed.data.key_id);

  const { error: insertErr } = await supabase.from('key_handovers').insert({
    tenant_id: ctx.tenantId,
    key_id: parsed.data.key_id,
    property_id: key.property_id,
    kind: 'retired',
    note: parsed.data.note,
    performed_by: ctx.userId,
  });
  if (insertErr) throw new Error(friendlyDbMessage(insertErr.message));

  const { error: statusErr } = await supabase
    .from('keys')
    .update({ status: 'retired', updated_by: ctx.userId })
    .eq('id', parsed.data.key_id);
  if (statusErr) throw new Error(friendlyDbMessage(statusErr.message));

  revalidatePath('/keys');
  revalidatePath(`/keys/${parsed.data.key_id}`);
}

export async function recordKeyReplacedAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  const parsed = replacedSchema.safeParse({
    key_id: formData.get('key_id') ?? '',
    copies_count: formData.get('copies_count') ?? 1,
    note: formData.get('note') ?? undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  }

  const supabase = await createSupabaseServerClient();
  const key = await loadKeyProperty(supabase, parsed.data.key_id);

  const { error: insertErr } = await supabase.from('key_handovers').insert({
    tenant_id: ctx.tenantId,
    key_id: parsed.data.key_id,
    property_id: key.property_id,
    kind: 'replaced',
    copies_count: parsed.data.copies_count,
    note: parsed.data.note,
    performed_by: ctx.userId,
  });
  if (insertErr) throw new Error(friendlyDbMessage(insertErr.message));

  const { data: current } = await supabase
    .from('keys')
    .select('copies_total')
    .eq('id', parsed.data.key_id)
    .maybeSingle();
  if (current) {
    await supabase
      .from('keys')
      .update({
        copies_total: current.copies_total + parsed.data.copies_count,
        updated_by: ctx.userId,
      })
      .eq('id', parsed.data.key_id);
  }

  revalidatePath('/keys');
  revalidatePath(`/keys/${parsed.data.key_id}`);
}
