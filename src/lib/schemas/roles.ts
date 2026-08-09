import { z } from 'zod';

export const roleInputSchema = z.object({
  name: z.string().trim().min(2, 'Bitte Name angeben (mind. 2 Zeichen).').max(80),
  description: z
    .string()
    .trim()
    .transform((v) => (v ? v : null))
    .nullable()
    .optional(),
});

export type RoleInput = z.infer<typeof roleInputSchema>;

/**
 * Erzeugt aus einem Namen einen stabilen kebab-case-Key.
 *  „Objektleiter Nord" → „objektleiter-nord"
 */
export function slugifyRoleKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
