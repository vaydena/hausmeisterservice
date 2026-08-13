import { z } from 'zod';

export const changeDisplayNameSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, 'Anzeigename muss mindestens 2 Zeichen haben.')
    .max(60, 'Anzeigename darf hoechstens 60 Zeichen haben.'),
});

export type ChangeDisplayNameInput = z.infer<typeof changeDisplayNameSchema>;
