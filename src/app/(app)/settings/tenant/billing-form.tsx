'use client';

import { useActionState } from 'react';
import type { TenantAddress, TenantInvoiceData } from '@/lib/schemas/tenant';
import { updateTenantBillingAction, type BillingFormState } from './actions';

const INITIAL: BillingFormState = { ok: false, message: null, fieldErrors: {} };

interface Props {
  address: TenantAddress;
  invoiceData: TenantInvoiceData;
  disabled?: boolean;
}

export function TenantBillingForm({ address, invoiceData, disabled }: Props) {
  const [state, formAction, pending] = useActionState(updateTenantBillingAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <fieldset disabled={disabled || pending} className="contents">
        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Anschrift
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Straße + Hausnr." name="address.street" defaultValue={address.street ?? ''} error={state.fieldErrors['address.street']} />
            <Field label="Land" name="address.country" defaultValue={address.country ?? ''} error={state.fieldErrors['address.country']} />
            <Field label="PLZ" name="address.zip" defaultValue={address.zip ?? ''} error={state.fieldErrors['address.zip']} />
            <Field label="Ort" name="address.city" defaultValue={address.city ?? ''} error={state.fieldErrors['address.city']} />
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Firmen- & Steuerdaten
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Firmenname (rechtlich)" name="invoice_data.legal_name" defaultValue={invoiceData.legal_name ?? ''} error={state.fieldErrors['invoice_data.legal_name']} />
            <Field label="Website" name="invoice_data.website" defaultValue={invoiceData.website ?? ''} error={state.fieldErrors['invoice_data.website']} />
            <Field label="Steuernummer" name="invoice_data.tax_id" defaultValue={invoiceData.tax_id ?? ''} error={state.fieldErrors['invoice_data.tax_id']} />
            <Field label="USt-IdNr." name="invoice_data.vat_id" defaultValue={invoiceData.vat_id ?? ''} error={state.fieldErrors['invoice_data.vat_id']} />
            <Field label="E-Mail" name="invoice_data.email" type="email" defaultValue={invoiceData.email ?? ''} error={state.fieldErrors['invoice_data.email']} />
            <Field label="Telefon" name="invoice_data.phone" defaultValue={invoiceData.phone ?? ''} error={state.fieldErrors['invoice_data.phone']} />
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Bankverbindung
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Bank" name="invoice_data.bank_name" defaultValue={invoiceData.bank_name ?? ''} error={state.fieldErrors['invoice_data.bank_name']} />
            <Field label="BIC" name="invoice_data.bic" defaultValue={invoiceData.bic ?? ''} error={state.fieldErrors['invoice_data.bic']} />
            <div className="sm:col-span-2">
              <Field label="IBAN" name="invoice_data.iban" defaultValue={invoiceData.iban ?? ''} error={state.fieldErrors['invoice_data.iban']} />
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Rechnungs-Voreinstellungen
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Zahlungsziel (Tage)" name="invoice_data.payment_terms_days" type="number" defaultValue={invoiceData.payment_terms_days?.toString() ?? '14'} error={state.fieldErrors['invoice_data.payment_terms_days']} />
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
              Fußnote (PDF-Fuß)
            </label>
            <textarea
              name="invoice_data.footer_note"
              defaultValue={invoiceData.footer_note ?? ''}
              rows={2}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
            />
            {state.fieldErrors['invoice_data.footer_note'] && (
              <p className="mt-1 text-xs text-[var(--color-destructive)]">{state.fieldErrors['invoice_data.footer_note']}</p>
            )}
          </div>
        </div>

        {state.message && (
          <p
            className={
              'text-sm ' +
              (state.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-destructive)]')
            }
          >
            {state.message}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-[var(--color-primary-foreground)] disabled:opacity-60"
          >
            {pending ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function Field({
  label,
  name,
  type = 'text',
  defaultValue,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  error?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
      />
      {error && <p className="mt-1 text-xs text-[var(--color-destructive)]">{error}</p>}
    </div>
  );
}
