import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DOC_BUCKET,
  DOC_ENTITY_TYPES,
  documentEntityHref,
  type DocumentEntityType,
} from '@/lib/schemas/documents';
import { moduleForPath } from '@/lib/modules/module-map';

/**
 * Sprint 120: der Rueckweg von einem Dokument zu seinem Vorgang.
 *
 * Die zentrale Liste unter `/documents` zeigt Dateien aus fuenf verschiedenen
 * Quellen. Der Link zurueck ist die einzige Einordnung, die eine Zeile hat —
 * ein Foto ohne den Auftrag dazu ist eine Datei ohne Aussage. Zeigt er auf den
 * falschen Pfad, faellt das nicht auf: die Zielseite antwortet mit 404, und
 * das sieht aus wie ein geloeschter Vorgang.
 */

describe('documentEntityHref', () => {
  it('fuehrt auf die Detailseite des Vorgangs', () => {
    expect(documentEntityHref('work_order', 'wo-1')).toBe('/work-orders/wo-1');
    expect(documentEntityHref('defect_report', 'dr-1')).toBe('/defect-reports/dr-1');
    expect(documentEntityHref('property', 'p-1')).toBe('/properties/p-1');
  });

  it('schickt eine Einheit auf ihr Objekt', () => {
    // Einheiten haben keine eigene Route; sie stehen auf der Objektseite.
    expect(documentEntityHref('unit', 'u-1', { propertyId: 'p-9' })).toBe('/properties/p-9');
  });

  it('schickt einen Pruefpunkt auf seinen Durchlauf', () => {
    expect(documentEntityHref('checklist_run_item', 'i-1', { checklistRunId: 'r-7' })).toBe(
      '/checklist-runs/r-7',
    );
  });

  it('liefert null statt eines geratenen Pfades, wenn der Kontext fehlt', () => {
    // Die documents-Zeile kennt weder die Run-ID noch zwingend eine
    // property_id. Ein aus der entity_id zusammengebauter Pfad waere in
    // beiden Faellen falsch — `/checklist-runs/<item-id>` gibt es nicht.
    expect(documentEntityHref('checklist_run_item', 'i-1')).toBeNull();
    expect(documentEntityHref('unit', 'u-1')).toBeNull();
    expect(documentEntityHref('unit', 'u-1', { propertyId: null })).toBeNull();
  });

  it('kennt jeden Eintrag aus DOC_ENTITY_TYPES', () => {
    // Sonst bekommt ein spaeter ergaenzter Typ still einen Strich statt eines
    // Rueckwegs. Der Kontext ist hier vollstaendig gesetzt, damit nur die
    // fehlende Fallunterscheidung durchfaellt.
    for (const type of DOC_ENTITY_TYPES) {
      expect(
        documentEntityHref(type, 'e-1', { propertyId: 'p-1', checklistRunId: 'r-1' }),
        `documentEntityHref kennt "${type}" nicht.`,
      ).toBeTruthy();
    }
  });

  it('jedes Ziel liegt in einem Modul, das ModuleLink kennt', () => {
    // Das ist die Bedingung, unter der die Liste ueberhaupt sicher ist: nur
    // wenn moduleForPath das Ziel einem Modul zuordnet, kann ModuleLink den
    // Link fallen lassen, sobald der Mandant dieses Modul abschaltet.
    const expected: Record<DocumentEntityType, string> = {
      work_order: 'work_orders',
      defect_report: 'defect_reports',
      property: 'properties',
      unit: 'properties',
      checklist_run_item: 'checklists',
    };
    for (const type of DOC_ENTITY_TYPES) {
      const href = documentEntityHref(type, 'e-1', { propertyId: 'p-1', checklistRunId: 'r-1' });
      expect(moduleForPath(href ?? ''), `${type} → ${href}`).toBe(expected[type]);
    }
  });
});

describe('Download-Handler', () => {
  const source = readFileSync(
    join(process.cwd(), 'src', 'app', 'api', 'documents', '[id]', 'download', 'route.ts'),
    'utf8',
  );

  it('signiert ueber die Dokument-ID, nicht ueber einen uebergebenen Pfad', () => {
    // Der storage_path kommt aus der documents-Zeile, die der Nutzer laut RLS
    // sehen darf. Naehme der Handler den Pfad entgegen, bliebe nur die
    // Storage-RLS — und die kennt die Mandantengrenze, nicht die
    // Objektberechtigung aus `documents.view`.
    expect(source).toContain("from('documents')");
    expect(source).toContain('.eq(\'id\', id)');
    expect(source).toContain('storage_path');
  });

  it('nutzt denselben Bucket wie der Upload', () => {
    expect(source).toContain('DOC_BUCKET');
    expect(DOC_BUCKET).toBe('attachments');
  });

  it('macht Query-Fehler sichtbar statt sie als "nicht gefunden" auszugeben', () => {
    // Ohne unwrap wuerde eine kaputte RLS-Policy zu einem 404 fuer jede Datei
    // — nicht unterscheidbar davon, dass es die Datei wirklich nicht gibt.
    expect(source).toContain('unwrapMaybeRow');
  });
});

describe('Upload und Download teilen den Bucket-Namen', () => {
  it('actions.ts hat kein eigenes Literal mehr', () => {
    const actions = readFileSync(
      join(process.cwd(), 'src', 'lib', 'documents', 'actions.ts'),
      'utf8',
    );
    expect(actions).toContain('DOC_BUCKET');
    expect(actions).not.toMatch(/const BUCKET\s*=\s*'/);
  });
});
