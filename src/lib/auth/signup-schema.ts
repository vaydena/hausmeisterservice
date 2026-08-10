import { z } from 'zod';

// Slugs: 2–32 Zeichen, lowercase, digits, dashes; kein leading/trailing dash,
// kein doppel-dash. Passt später zu subdomains oder pfad-basierten Tenant-URLs.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Wörter, die technisch für Routen, Rollen oder Marken belegt sind.
export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'callback',
  'dashboard',
  'dev',
  'help',
  'impressum',
  'agb',
  'datenschutz',
  'login',
  'logout',
  'notifications',
  'portal',
  'public',
  'reports',
  'reset-password',
  'root',
  'settings',
  'signup',
  'staging',
  'super',
  'superadmin',
  'support',
  'system',
  'test',
  'user',
  'users',
  'vaydena',
  'www',
]);

export function slugify(input: string): string {
  // Reihenfolge ist wichtig: Umlaute werden vor NFKD durch ihre Digraph-
  // Entsprechungen ersetzt (ä→ae etc.); NFKD würde sie sonst in Basis-
  // Buchstabe + kombinierendes diakritisches Zeichen zerlegen, das im
  // Regex-Schritt weggeworfen würde (→ Sohne statt Soehne).
  return input
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export const signupSchema = z
  .object({
    companyName: z
      .string()
      .trim()
      .min(2, 'Bitte Firmennamen eingeben (mindestens 2 Zeichen).')
      .max(100, 'Firmenname darf höchstens 100 Zeichen haben.'),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2, 'Kürzel muss mindestens 2 Zeichen haben.')
      .max(32, 'Kürzel darf höchstens 32 Zeichen haben.')
      .regex(
        SLUG_PATTERN,
        'Kürzel darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten (keine Bindestriche am Anfang oder Ende).',
      )
      .refine((v) => !RESERVED_SLUGS.has(v), {
        message: 'Dieses Kürzel ist reserviert. Bitte ein anderes wählen.',
      }),
    email: z.string().trim().toLowerCase().email('Bitte eine gültige E-Mail-Adresse eingeben.'),
    password: z
      .string()
      .min(10, 'Passwort muss mindestens 10 Zeichen haben.')
      .max(128, 'Passwort darf höchstens 128 Zeichen haben.'),
    passwordConfirm: z.string(),
    termsAccepted: z.literal('on', {
      errorMap: () => ({ message: 'Bitte AGB zustimmen, um fortzufahren.' }),
    }),
    privacyAccepted: z.literal('on', {
      errorMap: () => ({ message: 'Bitte Datenschutzerklärung zustimmen, um fortzufahren.' }),
    }),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'Die Passwörter stimmen nicht überein.',
  });

export type SignupInput = z.infer<typeof signupSchema>;
