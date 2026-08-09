'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Field } from '@/components/ui/input';
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { BillingFormState } from './actions';

const INITIAL: BillingFormState = {};

type PropertyOption = { id: string; name: string };
type OwnerOption = { id: string; label: string };
type WorkOrderOption = { id: string; label: string };
type OfferOption = { id: string; label: string };

type Common = {
  id?: string;
  title?: string;
  description?: string | null;
  property_id?: string | null;
  owner_id?: string | null;
  bill_to_name?: string;
  bill_to_address?: string | null;
  issued_at?: string | null;
  notes?: string | null;
};

type OfferInitial = Common & { valid_until?: string | null };
type InvoiceInitial = Common & { due_at?: string | null; work_order_id?: string | null; offer_id?: string | null };

export function BillingDocumentForm({
  action,
  cancelHref,
  submitLabel,
  kind,
  properties,
  owners,
  workOrders,
  offers,
  initial,
}: {
  action: (prev: BillingFormState, form: FormData) => Promise<BillingFormState>;
  cancelHref: string;
  submitLabel: string;
  kind: 'offer' | 'invoice';
  properties: PropertyOption[];
  owners: OwnerOption[];
  workOrders?: WorkOrderOption[];
  offers?: OfferOption[];
  initial?: OfferInitial | InvoiceInitial;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const err = state.fieldErrors ?? {};
  const isInvoice = kind === 'invoice';
  const inv = initial as InvoiceInitial | undefined;
  const off = initial as OfferInitial | undefined;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      <Card>
        <CardHeader>
          <CardTitle>Beleg</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <Field label="Titel" htmlFor="title" error={err['title']}>
              <Input
                id="title"
                name="title"
                defaultValue={initial?.title ?? ''}
                required
                autoFocus
                placeholder={isInvoice ? 'z. B. Reparatur Aufzug WEG Musterstr. 5' : 'z. B. Angebot Winterdienst 2026'}
              />
            </Field>
            <Field label="Beschreibung" htmlFor="description" optional error={err['description']}>
              <Textarea id="description" name="description" rows={3} defaultValue={initial?.description ?? ''} />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rechnungsempfänger</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name" htmlFor="bill_to_name" error={err['bill_to_name']}>
              <Input
                id="bill_to_name"
                name="bill_to_name"
                defaultValue={initial?.bill_to_name ?? ''}
                required
                placeholder="Empfänger-Name oder Firma"
              />
            </Field>
            <Field label="Adresse" htmlFor="bill_to_address" optional error={err['bill_to_address']}>
              <Textarea
                id="bill_to_address"
                name="bill_to_address"
                rows={2}
                defaultValue={initial?.bill_to_address ?? ''}
                placeholder="Straße, PLZ Ort"
              />
            </Field>
            <Field label="Objekt" htmlFor="property_id" optional>
              <Select id="property_id" name="property_id" defaultValue={initial?.property_id ?? ''}>
                <option value="">— keins —</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Eigentümer" htmlFor="owner_id" optional>
              <Select id="owner_id" name="owner_id" defaultValue={initial?.owner_id ?? ''}>
                <option value="">— keiner —</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Termine</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Rechnungsdatum" htmlFor="issued_at" optional>
              <Input id="issued_at" name="issued_at" type="date" defaultValue={initial?.issued_at ?? ''} />
            </Field>
            {isInvoice ? (
              <Field label="Fällig am" htmlFor="due_at" optional>
                <Input id="due_at" name="due_at" type="date" defaultValue={inv?.due_at ?? ''} />
              </Field>
            ) : (
              <Field label="Gültig bis" htmlFor="valid_until" optional>
                <Input id="valid_until" name="valid_until" type="date" defaultValue={off?.valid_until ?? ''} />
              </Field>
            )}
            {isInvoice && workOrders && (
              <Field label="Auftrag" htmlFor="work_order_id" optional>
                <Select id="work_order_id" name="work_order_id" defaultValue={inv?.work_order_id ?? ''}>
                  <option value="">— keiner —</option>
                  {workOrders.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {isInvoice && offers && (
              <Field label="Basis-Angebot" htmlFor="offer_id" optional>
                <Select id="offer_id" name="offer_id" defaultValue={inv?.offer_id ?? ''}>
                  <option value="">— keins —</option>
                  {offers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notizen</CardTitle>
        </CardHeader>
        <CardBody>
          <Field label="Notizen (intern)" htmlFor="notes" optional>
            <Textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes ?? ''} />
          </Field>
        </CardBody>
        <CardFooter>
          {state.error && (
            <p role="alert" className="mr-auto text-sm text-[var(--color-destructive)]">
              {state.error}
            </p>
          )}
          <Link
            href={cancelHref}
            className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            Abbrechen
          </Link>
          <Button type="submit" disabled={pending}>
            {pending ? 'Speichern …' : submitLabel}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
