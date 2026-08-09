import { z } from 'zod';

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const longText = z
  .string()
  .trim()
  .max(5000)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const optionalNumber = (min: number, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? Number(v) : null))
    .refine((v) => v === null || (!Number.isNaN(v) && v >= min && v <= max), {
      message: `Wert muss zwischen ${min} und ${max} liegen.`,
    });

export const propertyInputSchema = z.object({
  name: z.string().trim().min(1, 'Name ist erforderlich.').max(200),
  code: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  property_type: optionalText,
  street: optionalText,
  house_number: optionalText,
  postal_code: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  city: optionalText,
  country: z
    .string()
    .trim()
    .max(2)
    .default('DE')
    .transform((v) => v.toUpperCase()),
  gps_lat: optionalNumber(-90, 90),
  gps_lng: optionalNumber(-180, 180),
  notes: longText,
  access_notes: longText,
  emergency_notes: longText,
});

export type PropertyInput = z.infer<typeof propertyInputSchema>;
