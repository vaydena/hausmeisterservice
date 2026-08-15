import { describe, it, expect } from 'vitest';
import {
  findInvoiceDefects,
  summarizeInvoiceDefects,
  INVOICE_DEFECT_LABEL,
  type InvoiceIntegrityInput,
} from '@/lib/billing/invoice-integrity';

/**
 * Sprint 107: Diese Pruefung ist die Gegenprobe zu den verschluckten
 * Query-Fehlern im Rechnungspfad. Sie soll genau die Zustaende erkennen, die
 * dort entstanden sind — eine Kopfsumme ohne Positionen und eine Summe, die
 * nicht zu den Positionen passt — und dabei eine korrekte Rechnung in Ruhe
 * lassen.
 */

const COMPLETE_SENDER: InvoiceIntegrityInput['sender'] = {
  name: 'Vaydena Hausmeisterservice',
  legalName: 'Vaydena Hausmeisterservice',
  address: { street: 'Biberstraße 27', zip: '85354', city: 'Freising', country: 'Deutschland' },
  taxId: '123/456/78900',
  vatId: null,
};

function invoice(over: Partial<InvoiceIntegrityInput> = {}): InvoiceIntegrityInput {
  return {
    issuedAt: '2026-08-15',
    netTotalCents: 10000,
    taxTotalCents: 1900,
    grossTotalCents: 11900,
    lines: [{ net_cents: 10000, tax_cents: 1900, gross_cents: 11900 }],
    sender: COMPLETE_SENDER,
    ...over,
  };
}

describe('findInvoiceDefects — vollstaendige Rechnung', () => {
  it('meldet nichts, wenn Absender, Datum, Positionen und Summe stimmen', () => {
    expect(findInvoiceDefects(invoice())).toEqual([]);
  });

  it('akzeptiert die USt-IdNr. anstelle der Steuernummer', () => {
    // §14 Abs. 4 Nr. 2 laesst beide gelten. Wer nur eine hat, darf keine
    // Warnung sehen — sonst gewoehnt man sich das Wegklicken an.
    const out = findInvoiceDefects(
      invoice({ sender: { ...COMPLETE_SENDER, taxId: null, vatId: 'DE123456789' } }),
    );
    expect(out).toEqual([]);
  });

  it('faellt auf tenants.name zurueck, wenn kein abweichender legal_name gepflegt ist', () => {
    const out = findInvoiceDefects(
      invoice({ sender: { ...COMPLETE_SENDER, legalName: null } }),
    );
    expect(out).not.toContain('sender_name');
  });
});

describe('findInvoiceDefects — Absender unvollstaendig', () => {
  it('meldet die fehlende Steuernummer, wenn beide Nummern fehlen', () => {
    // Das ist der Ist-Zustand des Live-Mandanten: Adresse und IBAN gepflegt,
    // aber weder tax_id noch vat_id.
    const out = findInvoiceDefects(
      invoice({ sender: { ...COMPLETE_SENDER, taxId: null, vatId: null } }),
    );
    expect(out).toEqual(['sender_tax_number']);
  });

  it('verlangt Strasse, PLZ und Ort — eine halbe Anschrift genuegt nicht', () => {
    for (const partial of [
      { street: null, zip: '85354', city: 'Freising', country: null },
      { street: 'Biberstraße 27', zip: null, city: 'Freising', country: null },
      { street: 'Biberstraße 27', zip: '85354', city: null, country: null },
    ]) {
      const out = findInvoiceDefects(invoice({ sender: { ...COMPLETE_SENDER, address: partial } }));
      expect(out).toContain('sender_address');
    }
  });

  it('wertet reine Leerzeichen wie ein leeres Feld', () => {
    const out = findInvoiceDefects(
      invoice({ sender: { ...COMPLETE_SENDER, taxId: '   ', vatId: '' } }),
    );
    expect(out).toContain('sender_tax_number');
  });

  it('meldet den fehlenden Absendernamen nur, wenn beide Namensfelder leer sind', () => {
    const out = findInvoiceDefects(
      invoice({ sender: { ...COMPLETE_SENDER, name: null, legalName: null } }),
    );
    expect(out).toContain('sender_name');
  });
});

describe('findInvoiceDefects — der Fall aus dem verschluckten Query-Fehler', () => {
  it('erkennt eine Rechnung mit voller Summe, aber ohne Positionen', () => {
    // Genau das PDF, das `(rawLines ?? [])` erzeugt hat: Gesamtbetrag steht
    // da, darunter nichts.
    const out = findInvoiceDefects(invoice({ lines: [] }));
    expect(out).toContain('no_line_items');
  });

  it('meldet bei fehlenden Positionen NICHT zusaetzlich einen Summenkonflikt', () => {
    // Ein Befund, zweimal formuliert, verwaessert beide.
    const out = findInvoiceDefects(invoice({ lines: [] }));
    expect(out).not.toContain('totals_mismatch');
  });

  it('erkennt die auf null geschriebene Summe aus recalcInvoiceTotals', () => {
    const out = findInvoiceDefects(
      invoice({ netTotalCents: 0, taxTotalCents: 0, grossTotalCents: 0 }),
    );
    expect(out).toEqual(['totals_mismatch']);
  });

  it('erkennt eine veraltete Summe nach einer nachtraeglich ergaenzten Position', () => {
    const out = findInvoiceDefects(
      invoice({
        lines: [
          { net_cents: 10000, tax_cents: 1900, gross_cents: 11900 },
          { net_cents: 5000, tax_cents: 950, gross_cents: 5950 },
        ],
      }),
    );
    expect(out).toEqual(['totals_mismatch']);
  });

  it('schlaegt auch an, wenn nur der Steuerbetrag abweicht', () => {
    // Netto und Brutto koennen stimmen, waehrend der ausgewiesene Steuerbetrag
    // falsch ist — und genau der ist die Pflichtangabe nach §14 Abs. 4 Nr. 8.
    const out = findInvoiceDefects(invoice({ taxTotalCents: 700 }));
    expect(out).toEqual(['totals_mismatch']);
  });
});

describe('findInvoiceDefects — Reihenfolge und Datum', () => {
  it('meldet das fehlende Rechnungsdatum', () => {
    expect(findInvoiceDefects(invoice({ issuedAt: null }))).toContain('issue_date');
  });

  it('stellt die Absender-Maengel den Dokument-Maengeln voran', () => {
    // Absenderangaben werden einmal in den Einstellungen erledigt und gelten
    // dann fuer alle Rechnungen — deshalb stehen sie oben.
    const out = findInvoiceDefects(
      invoice({
        issuedAt: null,
        lines: [],
        sender: { ...COMPLETE_SENDER, taxId: null, vatId: null },
      }),
    );
    expect(out).toEqual(['sender_tax_number', 'issue_date', 'no_line_items']);
  });
});

describe('summarizeInvoiceDefects', () => {
  it('gibt null zurueck, wenn nichts zu melden ist', () => {
    // Der Aufrufer rendert dann gar nichts statt eines leeren Kastens.
    expect(summarizeInvoiceDefects([])).toBeNull();
  });

  it('setzt die Meldetexte zu einem Satz zusammen', () => {
    const text = summarizeInvoiceDefects(['sender_tax_number', 'no_line_items']);
    expect(text).toContain('Steuernummer');
    expect(text).toContain('keine Positionen');
  });
});

describe('INVOICE_DEFECT_LABEL', () => {
  it('nennt zu jedem Mangel die Folge, nicht nur den fehlenden Wert', () => {
    // "Steuernummer fehlt" beantwortet nicht, warum das jetzt wichtig ist.
    expect(INVOICE_DEFECT_LABEL.sender_tax_number).toContain('Vorsteuer');
    expect(INVOICE_DEFECT_LABEL.no_line_items).toContain('ohne jede Leistung');
    expect(INVOICE_DEFECT_LABEL.totals_mismatch).toContain('nicht zusammenpassen');
  });

  it('hat fuer jeden Mangel-Schluessel einen Text', () => {
    const keys = Object.keys(INVOICE_DEFECT_LABEL);
    expect(keys).toHaveLength(6);
    for (const k of keys) {
      expect(INVOICE_DEFECT_LABEL[k as keyof typeof INVOICE_DEFECT_LABEL].length).toBeGreaterThan(20);
    }
  });
});
