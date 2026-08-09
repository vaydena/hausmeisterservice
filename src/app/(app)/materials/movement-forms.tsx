'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { MOVEMENT_KINDS, KIND_LABEL, type MovementKind } from '@/lib/schemas/materials';
import { recordMovementAction } from './actions';

function toLocalInputValue(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type PropertyOption = { id: string; name: string; code: string | null };
type WorkOrderOption = { id: string; title: string; code: string | null };
type UserOption = { id: string; display_name: string | null };

export function MovementForm({
  materialId,
  unit,
  currentStock,
  properties,
  workOrders,
  users,
  defaultKind = 'issue',
}: {
  materialId: string;
  unit: string;
  currentStock: number;
  properties: PropertyOption[];
  workOrders: WorkOrderOption[];
  users: UserOption[];
  defaultKind?: MovementKind;
}) {
  const [kind, setKind] = useState<MovementKind>(defaultKind);

  const showIssueFields = kind === 'issue';
  const showAdjustmentDirection = kind === 'adjustment';
  const showPriceField = kind === 'receipt' || kind === 'adjustment';

  return (
    <form action={recordMovementAction} className="flex flex-col gap-3 p-4">
      <input type="hidden" name="material_id" value={materialId} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Bewegungsart" htmlFor={`mv-kind-${materialId}`}>
          <Select
            id={`mv-kind-${materialId}`}
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as MovementKind)}
          >
            {MOVEMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={`Menge (${unit})`}
          htmlFor={`mv-qty-${materialId}`}
          hint={`Aktueller Bestand: ${currentStock.toLocaleString('de-DE')}`}
        >
          <Input
            id={`mv-qty-${materialId}`}
            name="quantity"
            type="number"
            step="0.001"
            min="0.001"
            required
            placeholder="1"
          />
        </Field>

        <Field label="Zeitpunkt" htmlFor={`mv-when-${materialId}`}>
          <Input
            id={`mv-when-${materialId}`}
            name="occurred_at"
            type="datetime-local"
            defaultValue={toLocalInputValue(null)}
            required
          />
        </Field>
      </div>

      {showAdjustmentDirection && (
        <Field label="Richtung" htmlFor={`mv-dir-${materialId}`}>
          <Select id={`mv-dir-${materialId}`} name="direction" defaultValue="increase">
            <option value="increase">Bestand erhöhen (+)</option>
            <option value="decrease">Bestand mindern (−)</option>
          </Select>
        </Field>
      )}

      {showPriceField && (
        <Field
          label="Stückpreis (EUR)"
          htmlFor={`mv-cost-${materialId}`}
          optional
          hint="Nur zur Kostenerfassung"
        >
          <Input
            id={`mv-cost-${materialId}`}
            name="unit_cost_at_time"
            type="number"
            step="0.01"
            min="0"
          />
        </Field>
      )}

      {showIssueFields && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Objekt" htmlFor={`mv-prop-${materialId}`} optional>
            <Select id={`mv-prop-${materialId}`} name="property_id" defaultValue="">
              <option value="">— kein Bezug —</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `${p.code} · ${p.name}` : p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Empfänger" htmlFor={`mv-user-${materialId}`} optional>
            <Select id={`mv-user-${materialId}`} name="assignee_user_id" defaultValue="">
              <option value="">— nicht zugewiesen —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name ?? u.id.slice(0, 8)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Auftrag" htmlFor={`mv-wo-${materialId}`} optional>
            <Select id={`mv-wo-${materialId}`} name="work_order_id" defaultValue="">
              <option value="">— kein Auftrag —</option>
              {workOrders.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code ? `${w.code} · ${w.title}` : w.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <Field label="Notiz" htmlFor={`mv-note-${materialId}`} optional>
        <Textarea id={`mv-note-${materialId}`} name="note" rows={2} />
      </Field>

      <div className="flex justify-end">
        <Button type="submit">Bewegung buchen</Button>
      </div>
    </form>
  );
}
