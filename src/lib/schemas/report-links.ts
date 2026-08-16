import { z } from 'zod';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || UUID_RE.test(v), 'Ungültige ID.');

/**
 * Sprint 124 · Staff-seitiges Anlegen eines Melde-Links.
 *
 * `label` ist kein Schmuck: an einem Objekt koennen mehrere Aufkleber
 * haengen (Vordereingang, Tiefgarage, Muellplatz). Ohne Beschriftung ist in
 * der Verwaltung nicht mehr zu erkennen, welcher Eintrag welcher Aufkleber
 * ist — und damit auch nicht, welchen man abschalten muss, wenn einer
 * missbraucht wird.
 */
export const createReportLinkSchema = z.object({
  label: z
    .string()
    .trim()
    .max(120, 'Bezeichnung darf maximal 120 Zeichen lang sein.')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  building_id: optionalUuid,
});

export type CreateReportLinkInput = z.infer<typeof createReportLinkSchema>;

export const reportLinkIdSchema = z.object({
  id: z.string().uuid('Ungültige Melde-Link-ID.'),
});

/**
 * Wer meldet. Wird auf `defect_reports.reporter_kind` abgebildet.
 *
 * Bewusst NUR diese drei: `staff` fehlt, weil ein Mitarbeiter die App hat
 * und keinen anonymen Umweg braucht — stuende die Option hier, koennte
 * jeder Fremde eine Meldung als "vom eigenen Personal gemeldet" einkippen
 * und damit die Glaubwuerdigkeit der Herkunftsangabe zerstoeren.
 *
 * Die Angabe ist ohnehin unbelegt (niemand hat sich angemeldet). Sie ist
 * eine Selbstauskunft und wird in der Oberflaeche auch so behandelt.
 */
export const REPORTER_ROLES = ['owner', 'resident', 'anonymous'] as const;
export type ReporterRole = (typeof REPORTER_ROLES)[number];

export const REPORTER_ROLE_LABEL: Record<ReporterRole, string> = {
  owner: 'Eigentümer / Vermieter / Hausverwaltung',
  resident: 'Bewohner / Mieter',
  anonymous: 'Keine Angabe',
};

/**
 * Sprint 124 · Das oeffentliche Meldeformular.
 *
 * Strengere Laengen als im Staff-Formular: dies ist ein Schreibpfad, den
 * jeder ohne Konto erreicht. Kurze Obergrenzen halten den Schaden klein,
 * wenn jemand den Endpunkt als Ablage missbraucht — der Rate-Limit deckelt
 * die Anzahl, die Laenge deckelt das Volumen pro Versuch.
 *
 * `reporter_contact` ist optional und bleibt es. Eine Pflichtangabe wuerde
 * den Melder zwingen, personenbezogene Daten herauszugeben, um einen
 * Wasserschaden melden zu duerfen — und wer nicht will, meldet dann gar
 * nicht. Ohne Kontakt ist die Meldung immer noch eine Meldung.
 */
export const publicDefectReportSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, 'Bitte beschreiben Sie den Mangel in mindestens 5 Zeichen.')
    .max(150, 'Bitte fassen Sie sich in der Überschrift kürzer (max. 150 Zeichen).'),
  description: z
    .string()
    .trim()
    .max(2000, 'Beschreibung darf maximal 2000 Zeichen lang sein.')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  location_details: z
    .string()
    .trim()
    .max(200, 'Ortsangabe darf maximal 200 Zeichen lang sein.')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  category: z
    .string()
    .trim()
    .max(100, 'Kategorie darf maximal 100 Zeichen lang sein.')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  priority: z.enum(['low', 'normal', 'high', 'emergency']).default('normal'),
  reporter_role: z.enum(REPORTER_ROLES).default('owner'),
  reporter_name: z
    .string()
    .trim()
    .max(120, 'Name darf maximal 120 Zeichen lang sein.')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  reporter_contact: z
    .string()
    .trim()
    .max(200, 'Kontaktangabe darf maximal 200 Zeichen lang sein.')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type PublicDefectReportInput = z.infer<typeof publicDefectReportSchema>;

/**
 * Kategorien als Vorschlagsliste (datalist), nicht als Auswahlzwang. Der
 * Melder kennt die interne Kategorisierung des Betriebs nicht; ein Pflicht-
 * Dropdown wuerde ihn raten lassen und die Daten schlechter machen als ein
 * freies Feld mit guten Vorschlaegen.
 */
export const PUBLIC_DEFECT_CATEGORIES: readonly string[] = [
  'Heizung',
  'Sanitär / Wasser',
  'Elektrik / Licht',
  'Aufzug',
  'Türen / Schlösser',
  'Fenster',
  'Treppenhaus',
  'Außenanlage / Grünflächen',
  'Reinigung',
  'Müll',
  'Sonstiges',
] as const;
