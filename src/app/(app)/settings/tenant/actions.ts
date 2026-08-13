'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { isCoreModule, MODULES_BY_KEY, type ModuleKey } from '@/lib/modules/registry';
import { tenantBillingUpdateSchema } from '@/lib/schemas/tenant';
import {
  loadDemoDataForTenant,
  removeDemoDataFromTenant,
} from '@/lib/tenant/demo-data';

export async function toggleModuleAction(formData: FormData): Promise<void> {
  const rawKey = String(formData.get('module_key') ?? '');
  const rawEnabled = String(formData.get('enabled') ?? '');

  const key = rawKey as ModuleKey;
  if (!MODULES_BY_KEY[key]) throw new Error('Unbekanntes Modul.');
  if (isCoreModule(key)) throw new Error('Kern-Module lassen sich nicht deaktivieren.');

  const enabled = rawEnabled === 'true';

  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('core.tenants.manage')) {
    throw new Error('Fehlende Berechtigung, um Module zu ändern.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('tenant_modules')
    .upsert(
      { tenant_id: ctx.tenantId, module_key: key, enabled },
      { onConflict: 'tenant_id,module_key' },
    );
  if (error) throw new Error('Modul konnte nicht gespeichert werden.');

  revalidatePath('/', 'layout');
}

export type BillingFormState = {
  ok: boolean;
  message: string | null;
  fieldErrors: Record<string, string>;
};

const emptyBillingState: BillingFormState = {
  ok: false,
  message: null,
  fieldErrors: {},
};

export async function updateTenantBillingAction(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const ctx = await requireTenantContext();
  if (!ctx.isOwner) {
    return {
      ...emptyBillingState,
      message: 'Nur Inhaber:innen können Firmendaten ändern.',
    };
  }

  const raw = {
    address: {
      street: formData.get('address.street') ?? '',
      zip: formData.get('address.zip') ?? '',
      city: formData.get('address.city') ?? '',
      country: formData.get('address.country') ?? '',
    },
    invoice_data: {
      legal_name: formData.get('invoice_data.legal_name') ?? '',
      tax_id: formData.get('invoice_data.tax_id') ?? '',
      vat_id: formData.get('invoice_data.vat_id') ?? '',
      email: formData.get('invoice_data.email') ?? '',
      phone: formData.get('invoice_data.phone') ?? '',
      website: formData.get('invoice_data.website') ?? '',
      bank_name: formData.get('invoice_data.bank_name') ?? '',
      iban: formData.get('invoice_data.iban') ?? '',
      bic: formData.get('invoice_data.bic') ?? '',
      payment_terms_days: formData.get('invoice_data.payment_terms_days') ?? '',
      footer_note: formData.get('invoice_data.footer_note') ?? '',
    },
  };

  const parsed = tenantBillingUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      if (path && !fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return {
      ok: false,
      message: 'Bitte prüfen Sie die markierten Felder.',
      fieldErrors,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('tenants')
    .update({
      address: parsed.data.address,
      invoice_data: parsed.data.invoice_data,
    })
    .eq('id', ctx.tenantId);

  if (error) {
    return { ok: false, message: 'Speichern fehlgeschlagen.', fieldErrors: {} };
  }

  revalidatePath('/settings/tenant');
  return { ok: true, message: 'Firmendaten gespeichert.', fieldErrors: {} };
}

export async function loadDemoDataAction(): Promise<void> {
  const ctx = await requireTenantContext();
  if (!ctx.isOwner) throw new Error('Nur der Inhaber kann Beispieldaten laden.');
  await loadDemoDataForTenant(ctx.tenantId, ctx.userId);
  revalidatePath('/', 'layout');
}

export async function removeDemoDataAction(): Promise<void> {
  const ctx = await requireTenantContext();
  if (!ctx.isOwner) throw new Error('Nur der Inhaber kann Beispieldaten entfernen.');
  await removeDemoDataFromTenant(ctx.tenantId);
  revalidatePath('/', 'layout');
}
