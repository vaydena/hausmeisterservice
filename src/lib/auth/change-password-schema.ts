import { z } from 'zod';

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Bitte geben Sie Ihr aktuelles Passwort ein.'),
    newPassword: z
      .string()
      .min(10, 'Neues Passwort muss mindestens 10 Zeichen haben.')
      .max(128, 'Neues Passwort darf hoechstens 128 Zeichen haben.'),
    newPasswordConfirm: z.string(),
  })
  .refine((v) => v.newPassword === v.newPasswordConfirm, {
    path: ['newPasswordConfirm'],
    message: 'Die neuen Passwoerter stimmen nicht ueberein.',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'Das neue Passwort muss sich vom aktuellen unterscheiden.',
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
