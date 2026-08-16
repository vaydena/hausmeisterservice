import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REPORT_TOKEN_ALPHABET,
  REPORT_TOKEN_LENGTH,
  REPORT_TOKEN_MAX_LENGTH,
  REPORT_TOKEN_MIN_LENGTH,
  generateReportToken,
  isValidReportToken,
} from '@/lib/report-links/token';
import {
  createReportLinkSchema,
  publicDefectReportSchema,
  REPORTER_ROLES,
} from '@/lib/schemas/report-links';

describe('Melde-Link-Token', () => {
  it('erzeugt Tokens in der konfigurierten Laenge', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateReportToken()).toHaveLength(REPORT_TOKEN_LENGTH);
    }
  });

  it('benutzt ausschliesslich das erlaubte Alphabet', () => {
    const allowed = new Set(REPORT_TOKEN_ALPHABET.split(''));
    for (let i = 0; i < 50; i++) {
      for (const char of generateReportToken()) {
        expect(allowed.has(char), `Zeichen "${char}" ist nicht im Alphabet`).toBe(true);
      }
    }
  });

  /**
   * Verwechselbare Zeichen waeren auf einem gedruckten Aushang ein echtes
   * Problem: wer den Code abtippt statt scannt, landet sonst auf einem
   * fremden Objekt oder im Nichts.
   */
  it('enthaelt keine verwechselbaren Zeichen', () => {
    for (const forbidden of ['0', '1', 'i', 'l', 'o', 'u']) {
      expect(
        REPORT_TOKEN_ALPHABET.includes(forbidden),
        `"${forbidden}" gehoert nicht ins Token-Alphabet`,
      ).toBe(false);
    }
  });

  it('erzeugt praktisch nie zweimal denselben Token', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateReportToken());
    expect(seen.size).toBe(500);
  });

  it('akzeptiert eigene Tokens und lehnt Fremdtext ab', () => {
    expect(isValidReportToken(generateReportToken())).toBe(true);

    expect(isValidReportToken('')).toBe(false);
    expect(isValidReportToken('kurz')).toBe(false);
    expect(isValidReportToken(null)).toBe(false);
    expect(isValidReportToken(undefined)).toBe(false);
    expect(isValidReportToken(42)).toBe(false);
    // Grossbuchstaben, Sonderzeichen und Pfad-Tricks sind kein gueltiges Token.
    expect(isValidReportToken(generateReportToken().toUpperCase())).toBe(false);
    expect(isValidReportToken('../../etc/passwd')).toBe(false);
    expect(isValidReportToken(`${generateReportToken()}'`)).toBe(false);
    expect(isValidReportToken('a'.repeat(REPORT_TOKEN_MAX_LENGTH + 1))).toBe(false);
  });

  /**
   * Die Formatpruefung und die CHECK-Constraint der Tabelle muessen dasselbe
   * sagen. Laufen sie auseinander, erzeugt der Generator entweder Tokens,
   * die die Datenbank ablehnt (Melde-Link laesst sich nicht anlegen), oder
   * die Pruefung laesst Werte durch, die es nie geben kann.
   */
  it('Laengengrenzen decken sich mit der CHECK-Constraint der Migration', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260816140000_property_report_links.sql'),
      'utf8',
    );
    expect(sql).toContain(
      `char_length(token) between ${REPORT_TOKEN_MIN_LENGTH} and ${REPORT_TOKEN_MAX_LENGTH}`,
    );
    expect(REPORT_TOKEN_LENGTH).toBeGreaterThanOrEqual(REPORT_TOKEN_MIN_LENGTH);
    expect(REPORT_TOKEN_LENGTH).toBeLessThanOrEqual(REPORT_TOKEN_MAX_LENGTH);
  });
});

describe('Oeffentliches Meldeformular', () => {
  const minimal = { title: 'Aufzug steht still' };

  it('nimmt eine Meldung mit nur einem Titel an', () => {
    const parsed = publicDefectReportSchema.safeParse(minimal);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.priority).toBe('normal');
    expect(parsed.data.reporter_role).toBe('owner');
    expect(parsed.data.description).toBeNull();
    expect(parsed.data.reporter_contact).toBeNull();
  });

  it('verlangt einen aussagekraeftigen Titel', () => {
    expect(publicDefectReportSchema.safeParse({ title: 'ab' }).success).toBe(false);
    expect(publicDefectReportSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(
      publicDefectReportSchema.safeParse({ title: 'x'.repeat(151) }).success,
    ).toBe(false);
  });

  it('macht aus leeren Feldern null statt leerer Strings', () => {
    const parsed = publicDefectReportSchema.safeParse({
      ...minimal,
      description: '   ',
      reporter_name: '',
      category: '',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.description).toBeNull();
    expect(parsed.data.reporter_name).toBeNull();
    expect(parsed.data.category).toBeNull();
  });

  /**
   * `staff` darf nicht waehlbar sein. Waere es das, koennte ein Fremder eine
   * Meldung als "vom eigenen Personal gemeldet" einkippen — und damit die
   * einzige Angabe entwerten, an der die Disposition die Herkunft ablesen
   * kann.
   */
  it('kennt keine Melder-Rolle "staff"', () => {
    expect(REPORTER_ROLES).not.toContain('staff');
    expect(
      publicDefectReportSchema.safeParse({ ...minimal, reporter_role: 'staff' }).success,
    ).toBe(false);
  });

  it('akzeptiert alle vier Dringlichkeitsstufen und nichts sonst', () => {
    for (const priority of ['low', 'normal', 'high', 'emergency']) {
      expect(
        publicDefectReportSchema.safeParse({ ...minimal, priority }).success,
        priority,
      ).toBe(true);
    }
    expect(
      publicDefectReportSchema.safeParse({ ...minimal, priority: 'sofort' }).success,
    ).toBe(false);
  });
});

describe('Melde-Link anlegen', () => {
  it('kommt ohne Angaben aus', () => {
    const parsed = createReportLinkSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.label).toBeNull();
    expect(parsed.data.building_id).toBeNull();
  });

  it('lehnt eine Gebaeude-ID ab, die keine UUID ist', () => {
    expect(createReportLinkSchema.safeParse({ building_id: 'haus-1' }).success).toBe(false);
    expect(
      createReportLinkSchema.safeParse({
        building_id: '00000000-0000-0000-0000-000000000000',
      }).success,
    ).toBe(true);
  });
});
