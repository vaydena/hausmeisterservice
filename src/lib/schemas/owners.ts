import { z } from 'zod';

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const optionalShort = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Ungültige E-Mail.');

export const ownerKindSchema = z.enum(['individual', 'company', 'management']);
export type OwnerKind = z.infer<typeof ownerKindSchema>;

export const ownerInputSchema = z
  .object({
    kind: ownerKindSchema.default('individual'),
    first_name: optionalShort,
    last_name: optionalShort,
    company_name: optionalShort,
    email: optionalEmail,
    phone: optionalShort,
    street: optionalShort,
    house_number: optionalShort,
    postal_code: optionalShort,
    city: optionalShort,
    country: optionalShort,
    notes: optionalText,
  })
  .superRefine((data, ctx) => {
    if (data.kind === 'individual') {
      if (!data.first_name) {
        ctx.addIssue({
          code: 'custom',
          path: ['first_name'],
          message: 'Vorname ist erforderlich.',
        });
      }
      if (!data.last_name) {
        ctx.addIssue({
          code: 'custom',
          path: ['last_name'],
          message: 'Nachname ist erforderlich.',
        });
      }
    } else if (!data.company_name) {
      ctx.addIssue({
        code: 'custom',
        path: ['company_name'],
        message: 'Firmenname ist erforderlich.',
      });
    }
  });

export type OwnerInput = z.infer<typeof ownerInputSchema>;

export const OWNER_KIND_LABEL: Record<OwnerKind, string> = {
  individual: 'Privatperson',
  company: 'Firma',
  management: 'Hausverwaltung',
};

export function ownerDisplayName(owner: {
  kind?: string | null;
  company_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  if (owner.kind === 'individual') {
    return [owner.first_name, owner.last_name].filter(Boolean).join(' ') || '(ohne Namen)';
  }
  return owner.company_name ?? '(ohne Namen)';
}
