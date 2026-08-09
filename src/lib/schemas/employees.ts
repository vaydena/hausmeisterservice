import { z } from 'zod';

export const inviteEmployeeSchema = z.object({
  email: z.string().trim().toLowerCase().email('Bitte eine gültige E-Mail eingeben.'),
  display_name: z.string().trim().min(1, 'Name ist erforderlich.').max(100),
  role_key: z.string().trim().min(1, 'Bitte eine Rolle auswählen.'),
});

export type InviteEmployeeInput = z.infer<typeof inviteEmployeeSchema>;

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

const optionalNumber = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? Number(v) : null))
  .refine((v) => v === null || (!Number.isNaN(v) && v >= 0 && v <= 10000), {
    message: 'Ungültiger Stundensatz.',
  });

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: 'Datum im Format JJJJ-MM-TT.',
  });

export const updateEmployeeSchema = z.object({
  employment_status: z.enum(['active', 'on_leave', 'terminated']),
  hire_date: optionalDate,
  termination_date: optionalDate,
  hourly_rate: optionalNumber,
  phone: optionalText,
  notes: optionalText,
  skills_csv: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : [],
    ),
});

export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
