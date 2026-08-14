import { z } from 'zod';

export const changeEmailSchema = z.object({
  newEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('Bitte geben Sie eine gueltige E-Mail-Adresse ein.')
    .max(254, 'E-Mail-Adresse darf hoechstens 254 Zeichen haben.'),
});

export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
