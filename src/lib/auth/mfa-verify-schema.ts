import { z } from 'zod';

export const mfaVerifySchema = z.object({
  factorId: z.string().uuid('Ungueltige Faktor-ID.'),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Bitte den 6-stelligen Code aus der Authenticator-App eingeben.'),
});
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

export const mfaEnrollSchema = z.object({
  friendlyName: z
    .string()
    .trim()
    .min(1, 'Bitte einen Namen fuer das Geraet angeben (z. B. "iPhone").')
    .max(40, 'Der Name darf hoechstens 40 Zeichen haben.'),
});
export type MfaEnrollInput = z.infer<typeof mfaEnrollSchema>;

export const mfaUnenrollSchema = z.object({
  factorId: z.string().uuid('Ungueltige Faktor-ID.'),
});
export type MfaUnenrollInput = z.infer<typeof mfaUnenrollSchema>;
