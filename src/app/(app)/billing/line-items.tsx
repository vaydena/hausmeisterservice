'use client';

import { useState, useTransition } from 'react';
import { Input, Select } from '@/components/ui/input';
import { formatCents } from '@/lib/schemas/billing';
import { addLineItemAction, removeLineItemAction } from './actions';

type LineItem = {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price_cents: number;
  tax_rate: number;
  net_cents: number;
  tax_cents: number;
  gross_cents: number;
};

export function LineItemsEditor({
  kind,
  parentId,
  items,
  editable,
}: {
  kind: 'offer' | 'invoice';
  parentId: string;
  items: LineItem[];
  editable: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--color-border)] text-xs uppercase text-[var(--color-muted-foreground)]">
            <tr>
              <th className="pb-2 pr-2 w-8">#</th>
              <th className="pb-2 pr-2">Beschreibung</th>
              <th className="pb-2 pr-2 text-right">Menge</th>
              <th className="pb-2 pr-2">Einheit</th>
              <th className="pb-2 pr-2 text-right">Einzelpreis</th>
              <th className="pb-2 pr-2 text-right">MwSt %</th>
              <th className="pb-2 pr-2 text-right">Gesamt</th>
              {editable && <th className="pb-2 w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {items.map((it) => (
              <tr key={it.id}>
                <td className="py-2 pr-2 text-xs text-[var(--color-muted-foreground)]">{it.position}</td>
                <td className="py-2 pr-2">{it.description}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{it.quantity}</td>
                <td className="py-2 pr-2 text-xs">{it.unit ?? ''}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatCents(it.unit_price_cents)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{it.tax_rate}</td>
                <td className="py-2 pr-2 text-right tabular-nums font-medium">{formatCents(it.gross_cents)}</td>
                {editable && (
                  <td className="py-2 text-right">
                    <RemoveLineItemButton kind={kind} parentId={parentId} itemId={it.id} />
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={editable ? 8 : 7} className="py-4 text-sm text-[var(--color-muted-foreground)]">
                  Noch keine Positionen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editable && <AddLineItemForm kind={kind} parentId={parentId} />}
    </div>
  );
}

function AddLineItemForm({ kind, parentId }: { kind: 'offer' | 'invoice'; parentId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(fd: FormData) {
    setError(null);
    start(async () => {
      try {
        await addLineItemAction(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Hinzufügen.');
      }
    });
  }

  return (
    <form
      action={handleSubmit}
      className="grid gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] p-3 md:grid-cols-[1fr_80px_60px_120px_60px_auto]"
    >
      <input type="hidden" name="document_kind" value={kind} />
      <input type="hidden" name="parent_id" value={parentId} />
      <Input name="description" placeholder="Beschreibung" required />
      <Input name="quantity" type="number" step="0.01" min="0.01" defaultValue="1" required />
      <Input name="unit" placeholder="Std." />
      <div className="relative">
        <Input
          name="unit_price_cents"
          type="number"
          step="1"
          min="0"
          defaultValue="0"
          required
          className="pr-12 text-right"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted-foreground)]">Cent</span>
      </div>
      <Select name="tax_rate" defaultValue="19">
        <option value="0">0</option>
        <option value="7">7</option>
        <option value="19">19</option>
      </Select>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        {pending ? '…' : '+ Position'}
      </button>
      {error && (
        <p className="col-span-full text-xs text-[var(--color-destructive)]" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function RemoveLineItemButton({
  kind,
  parentId,
  itemId,
}: {
  kind: 'offer' | 'invoice';
  parentId: string;
  itemId: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm('Position entfernen?')) return;
        const fd = new FormData();
        fd.set('item_id', itemId);
        fd.set('document_kind', kind);
        fd.set('parent_id', parentId);
        start(async () => {
          await removeLineItemAction(fd);
        });
      }}
      className="text-xs text-[var(--color-destructive)] hover:underline disabled:opacity-40"
    >
      {pending ? '…' : '×'}
    </button>
  );
}
