import { z } from 'zod';

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || z.string().email().safeParse(v).success, 'Ungültige E-Mail.');

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine(
    (v) => v === null || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v),
    'Ungültige URL.',
  );

const optionalIban = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .transform((v) => (v && v.length > 0 ? v.replace(/\s+/g, '') : null))
  .refine((v) => v === null || /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v), 'Ungültige IBAN.');

const optionalBic = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v), 'Ungültiger BIC.');

export const tenantAddressSchema = z.object({
  street: optionalText,
  zip: optionalText,
  city: optionalText,
  country: optionalText,
});

export type TenantAddress = z.infer<typeof tenantAddressSchema>;

export const tenantInvoiceDataSchema = z.object({
  legal_name: optionalText,
  tax_id: optionalText,
  vat_id: optionalText,
  email: optionalEmail,
  phone: optionalText,
  website: optionalUrl,
  bank_name: optionalText,
  iban: optionalIban,
  bic: optionalBic,
  payment_terms_days: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine(
      (v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 365),
      'Zahlungsziel muss 0-365 Tage sein.',
    ),
  footer_note: optionalText,
});

export type TenantInvoiceData = z.infer<typeof tenantInvoiceDataSchema>;

export const tenantBillingUpdateSchema = z.object({
  address: tenantAddressSchema,
  invoice_data: tenantInvoiceDataSchema,
});

export type TenantBillingUpdate = z.infer<typeof tenantBillingUpdateSchema>;

export function parseTenantAddress(raw: unknown): TenantAddress {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    return {
      street: typeof r.street === 'string' ? r.street : null,
      zip: typeof r.zip === 'string' ? r.zip : null,
      city: typeof r.city === 'string' ? r.city : null,
      country: typeof r.country === 'string' ? r.country : null,
    };
  }
  return { street: null, zip: null, city: null, country: null };
}

export function parseTenantInvoiceData(raw: unknown): TenantInvoiceData {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    const paymentTerms =
      typeof r.payment_terms_days === 'number' ? r.payment_terms_days : null;
    return {
      legal_name: typeof r.legal_name === 'string' ? r.legal_name : null,
      tax_id: typeof r.tax_id === 'string' ? r.tax_id : null,
      vat_id: typeof r.vat_id === 'string' ? r.vat_id : null,
      email: typeof r.email === 'string' ? r.email : null,
      phone: typeof r.phone === 'string' ? r.phone : null,
      website: typeof r.website === 'string' ? r.website : null,
      bank_name: typeof r.bank_name === 'string' ? r.bank_name : null,
      iban: typeof r.iban === 'string' ? r.iban : null,
      bic: typeof r.bic === 'string' ? r.bic : null,
      payment_terms_days: paymentTerms,
      footer_note: typeof r.footer_note === 'string' ? r.footer_note : null,
    };
  }
  return {
    legal_name: null,
    tax_id: null,
    vat_id: null,
    email: null,
    phone: null,
    website: null,
    bank_name: null,
    iban: null,
    bic: null,
    payment_terms_days: null,
    footer_note: null,
  };
}

export function formatIban(iban: string | null | undefined): string {
  if (!iban) return '—';
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

export function formatAddressLines(addr: TenantAddress): string[] {
  const lines: string[] = [];
  if (addr.street) lines.push(addr.street);
  const cityLine = [addr.zip, addr.city].filter(Boolean).join(' ');
  if (cityLine) lines.push(cityLine);
  if (addr.country) lines.push(addr.country);
  return lines;
}
