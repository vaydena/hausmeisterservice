import { z } from 'zod';

/**
 * Recovery-Code-Format: 8 Zeichen aus dem Base32-artigen Alphabet
 * (ABCDEFGHJKMNPQRSTUVWXYZ23456789, keine 0/O/1/I/L/U/V), optional
 * mit einem Bindestrich in der Mitte oder Whitespace. Die
 * Normalisierung (Strich/Whitespace weg, upper-case) macht die
 * Action — hier prueft das Schema nur das Grundformat, damit der
 * Fehlertext frueh und benutzerfreundlich zurueckkommt.
 */
export const recoveryCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .max(20, 'Der Recovery-Code ist zu lang.')
    .regex(
      /^[A-Za-z0-9\s-]+$/,
      'Der Recovery-Code enthaelt ungueltige Zeichen. Bitte nur Buchstaben und Ziffern eingeben.',
    ),
});
export type RecoveryCodeInput = z.infer<typeof recoveryCodeSchema>;
