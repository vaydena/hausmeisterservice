import { redirect } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { getTenantBillingContext } from '@/lib/platform/billing';
import { getBankDetails, paymentReferenceForInvoice } from '@/lib/platform/bank-transfer';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { formatDate, formatEUR } from '@/lib/format';
import { StatusBadge } from '@/components/platform/status-badge';
import { Button } from '@/components/ui/button';
import { createPlatformServiceClient } from '@/lib/supabase/platform';
import { FEATURE_KEYS, FEATURE_LABEL } from '@/lib/tenant/feature-map';
import { generateSepaQrSvg } from '@/lib/platform/sepa-qr';
import { isPaypalConfigured } from '@/lib/platform/paypal';
import {
  selectPlanAction,
  requestBankTransferInvoiceAction,
  switchPaymentMethodAction,
  startPaypalPaymentAction,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await requireTenantContext();
  if (!ctx.isOwner) redirect('/dashboard');

  const [billing, plansRes, invoicesRes] = await Promise.all([
    getTenantBillingContext(ctx.tenantId),
    createPlatformServiceClient()
      .from('subscription_plans')
      .select('*')
      .eq('is_public', true)
      .order('sort_order'),
    createPlatformServiceClient()
      .from('invoices')
      .select(
        'id, invoice_number, total_cents, status, paid_at, issued_at, due_at, period_start, period_end',
      )
      .eq('tenant_id', ctx.tenantId)
      .order('issued_at', { ascending: false })
      .limit(10),
  ]);

  if (!billing) redirect('/dashboard');
  // Sprint 112: Bezahlt wird ausschliesslich per Ueberweisung. Die offene
  // Rechnung ist damit der einzige Traeger des Verwendungszwecks — faellt die
  // Abfrage aus, steht hier "keine Rechnungen", der Ueberweisungsblock
  // erscheint nicht, und der Kunde kann nicht zahlen. Am Ende dieser Kette
  // steht das Zahlungs-Gate aus Sprint 10.8, das ihn aussperrt.
  const plans = unwrapRows(plansRes, 'Abo: verfuegbare Tarife');
  const invoices = unwrapRows(invoicesRes, 'Abo: eigene Rechnungen');
  const bank = getBankDetails();
  const latestOpen = invoices.find((i) => !i.paid_at && i.status === 'open');
  const paypalConfigured = isPaypalConfigured();

  // GiroCode zur offenen Überweisung: der Zahler scannt ihn mit seiner
  // Banking-App und muss IBAN/Betrag/Verwendungszweck nicht abtippen. Fällt
  // die Erzeugung aus (ungültige Daten), bleibt es bei den Klartext-Bankdaten.
  const sepaQrSvg =
    bank && latestOpen
      ? await generateSepaQrSvg({
          holder: bank.holder,
          iban: bank.iban,
          bic: bank.bic,
          amount: latestOpen.total_cents / 100,
          reference: paymentReferenceForInvoice(latestOpen.invoice_number, billing.tenantSlug),
        })
      : null;

  const sp = await searchParams;
  const paypalStatus = typeof sp.paypal === 'string' ? sp.paypal : null;
  const paypalMeldung = typeof sp.meldung === 'string' ? sp.meldung : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Abo &amp; Rechnungen</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Wähle deinen Plan und verwalte deine Zahlungen.
          </p>
        </div>
        <StatusBadge status={billing.status} />
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Aktueller Plan
          </div>
          <div className="mt-2 text-lg font-medium">{billing.planName ?? 'Kein Plan gewählt'}</div>
          {billing.planId && (
            <div className="text-sm text-[var(--color-muted-foreground)]">
              {billing.interval === 'yearly'
                ? `${formatEUR(billing.planYearlyCents ?? 0)}/Jahr`
                : `${formatEUR(billing.planMonthlyCents ?? 0)}/Monat`}
            </div>
          )}
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Zeitraum
          </div>
          <dl className="mt-2 space-y-1 text-sm">
            {billing.status === 'trial' && (
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted-foreground)]">Testphase bis:</dt>
                <dd>{formatDate(billing.trialEndsAt)}</dd>
              </div>
            )}
            {billing.currentPeriodEnd && (
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted-foreground)]">Läuft bis:</dt>
                <dd>{formatDate(billing.currentPeriodEnd)}</dd>
              </div>
            )}
          </dl>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
          Plan wählen
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const active = plan.id === billing.planId;
            return (
              <div
                key={plan.id}
                className={`rounded-xl border p-4 ${active ? 'border-[var(--color-brand)] ring-1 ring-[var(--color-brand)]' : 'border-[var(--color-border)]'}`}
              >
                <div className="text-lg font-semibold">{plan.name}</div>
                <div className="text-xs text-[var(--color-muted-foreground)]">
                  {plan.description}
                </div>
                <div className="mt-3 text-2xl font-semibold">
                  {formatEUR(plan.monthly_price_cents)}
                  <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
                    /M
                  </span>
                </div>
                <div className="text-xs text-[var(--color-muted-foreground)]">
                  oder {formatEUR(plan.yearly_price_cents)} pro Jahr
                </div>
                <ul className="mt-3 space-y-1 text-xs">
                  <li>• bis {plan.max_employees ?? '∞'} Mitarbeiter</li>
                  <li>• bis {plan.max_properties ?? '∞'} Objekte</li>
                  {/*
                    Sprint 140: bis hierher standen die fuenf Feature-Namen
                    hier ein zweites Mal, von Hand. Sprint 115 hat das
                    Vokabular fuer /preise und die Sperrseite an eine Stelle
                    gezogen und diese Liste uebersehen — der Kunde las auf der
                    Preisseite "GPS-Tracking & Touren" und hier "GPS-Tracking",
                    also zwei Zusagen fuer denselben Schalter. Jetzt dieselbe
                    Quelle wie ueberall sonst.
                  */}
                  {plan.features && typeof plan.features === 'object' && (
                    <>
                      {FEATURE_KEYS.filter(
                        (key) => (plan.features as Record<string, boolean>)[key],
                      ).map((key) => (
                        <li key={key}>• {FEATURE_LABEL[key]}</li>
                      ))}
                    </>
                  )}
                </ul>
                <form action={selectPlanAction} className="mt-4 flex flex-col gap-2">
                  <input type="hidden" name="planId" value={plan.id} />
                  <select
                    name="interval"
                    defaultValue={active ? billing.interval : 'monthly'}
                    className="rounded-md border border-[var(--color-border)] px-2 py-1 text-sm"
                  >
                    <option value="monthly">Monatlich zahlen</option>
                    <option value="yearly">Jährlich zahlen</option>
                  </select>
                  <Button variant={active ? 'secondary' : 'primary'} size="sm" type="submit">
                    {active ? 'Aktueller Plan' : `Zu ${plan.name} wechseln`}
                  </Button>
                </form>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
            Zahlungsart
          </h2>
          <div className="flex gap-2">
            <form action={switchPaymentMethodAction}>
              <input type="hidden" name="method" value="bank_transfer" />
              <Button
                variant={billing.paymentMethod === 'bank_transfer' ? 'primary' : 'secondary'}
                size="sm"
                type="submit"
              >
                Banküberweisung
              </Button>
            </form>
            {paypalConfigured && (
              <form action={switchPaymentMethodAction}>
                <input type="hidden" name="method" value="paypal" />
                <Button
                  variant={billing.paymentMethod === 'paypal' ? 'primary' : 'secondary'}
                  size="sm"
                  type="submit"
                >
                  PayPal
                </Button>
              </form>
            )}
          </div>
        </div>

        {paypalStatus === 'erfolgreich' && (
          <p className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
            Zahlung erfolgreich — dein Abo ist aktiv. Danke!
          </p>
        )}
        {paypalStatus === 'abgebrochen' && (
          <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
            Die PayPal-Zahlung wurde abgebrochen. Du kannst es jederzeit erneut versuchen.
          </p>
        )}
        {paypalStatus === 'bereits-bezahlt' && (
          <p className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm">
            Diese Rechnung war bereits bezahlt.
          </p>
        )}
        {paypalStatus === 'fehler' && (
          <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-800">
            PayPal-Zahlung fehlgeschlagen{paypalMeldung ? `: ${paypalMeldung}` : '.'}
          </p>
        )}

        {billing.paymentMethod === 'bank_transfer' && (
          <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4">
            {bank ? (
              <>
                {latestOpen ? (
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2 text-sm">
                      <div className="font-medium">
                        Offene Rechnung: {latestOpen.invoice_number}
                      </div>
                      <div className="text-2xl font-semibold">
                        {formatEUR(latestOpen.total_cents)}
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-1 text-sm md:grid-cols-2">
                        <div>
                          <span className="text-[var(--color-muted-foreground)]">Empfänger:</span>{' '}
                          {bank.holder}
                        </div>
                        <div>
                          <span className="text-[var(--color-muted-foreground)]">Fällig:</span>{' '}
                          {formatDate(latestOpen.due_at)}
                        </div>
                        <div>
                          <span className="text-[var(--color-muted-foreground)]">IBAN:</span>{' '}
                          <span className="font-mono">{bank.iban}</span>
                        </div>
                        <div>
                          <span className="text-[var(--color-muted-foreground)]">BIC:</span>{' '}
                          <span className="font-mono">{bank.bic}</span>
                        </div>
                        <div className="md:col-span-2">
                          <span className="text-[var(--color-muted-foreground)]">
                            Verwendungszweck:
                          </span>{' '}
                          <span className="font-mono">
                            {paymentReferenceForInvoice(
                              latestOpen.invoice_number,
                              billing.tenantSlug,
                            )}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                        Nach Zahlungseingang schaltet der Betreiber deinen Zugang aktiv (i. d. R.
                        innerhalb von 1-2 Werktagen).
                      </p>
                    </div>
                    {sepaQrSvg && (
                      <figure className="shrink-0 self-center text-center lg:self-start">
                        <div
                          className="mx-auto size-32 rounded-lg bg-white p-2 ring-1 ring-[var(--color-border)]"
                          // Der SVG kommt aus generateSepaQrSvg() über selbst
                          // gebaute Bankdaten — kein Fremdinhalt.
                          dangerouslySetInnerHTML={{ __html: sepaQrSvg }}
                        />
                        <figcaption className="mt-1.5 text-[11px] leading-tight text-[var(--color-muted-foreground)]">
                          Mit Banking-App scannen
                        </figcaption>
                      </figure>
                    )}
                  </div>
                ) : (
                  <form action={requestBankTransferInvoiceAction}>
                    <p className="text-sm">
                      Fordere eine Rechnung für den aktuellen Plan an. Du bekommst dann die
                      Bankdaten, einen QR-Code und einen Verwendungszweck angezeigt.
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      type="submit"
                      className="mt-3"
                      disabled={!billing.planId}
                    >
                      Rechnung anfordern
                    </Button>
                    {!billing.planId && (
                      <p className="mt-1 text-xs text-red-700">
                        Bitte oben zuerst einen Plan wählen.
                      </p>
                    )}
                  </form>
                )}
              </>
            ) : (
              <p className="text-sm text-amber-800">
                Der Betreiber hat noch keine Bankverbindung hinterlegt. Bitte den Support
                kontaktieren.
              </p>
            )}
          </div>
        )}

        {billing.paymentMethod === 'paypal' && (
          <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4">
            {paypalConfigured ? (
              <form action={startPaypalPaymentAction} className="space-y-3">
                <p className="text-sm">
                  {latestOpen
                    ? `Offene Rechnung ${latestOpen.invoice_number} über ${formatEUR(latestOpen.total_cents)} — jetzt mit PayPal bezahlen und sofort freischalten.`
                    : 'Zahle dein Abo bequem mit PayPal. Du wirst zur PayPal-Freigabe weitergeleitet und danach automatisch freigeschaltet.'}
                </p>
                <Button variant="primary" size="sm" type="submit" disabled={!billing.planId}>
                  Mit PayPal bezahlen
                </Button>
                {!billing.planId && (
                  <p className="text-xs text-red-700">Bitte oben zuerst einen Plan wählen.</p>
                )}
              </form>
            ) : (
              <p className="text-sm text-amber-800">
                PayPal ist noch nicht konfiguriert. Bitte den Support kontaktieren.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
          Rechnungsverlauf
        </h2>
        {invoices.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
            Noch keine Rechnungen.
          </p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase text-[var(--color-muted-foreground)]">
              <tr>
                <th className="py-2">Nummer</th>
                <th className="py-2">Datum</th>
                <th className="py-2">Zeitraum</th>
                <th className="py-2">Betrag</th>
                <th className="py-2">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="py-2 font-mono text-xs">{inv.invoice_number}</td>
                  <td className="py-2">{formatDate(inv.issued_at)}</td>
                  <td className="py-2 text-[var(--color-muted-foreground)]">
                    {formatDate(inv.period_start)} – {formatDate(inv.period_end)}
                  </td>
                  <td className="py-2">{formatEUR(inv.total_cents)}</td>
                  <td className="py-2">
                    {inv.paid_at ? (
                      <span className="text-emerald-700">bezahlt</span>
                    ) : inv.status === 'open' ? (
                      <span className="text-amber-700">offen</span>
                    ) : (
                      inv.status
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <a
                      href={`/api/platform/invoices/${inv.id}/pdf`}
                      className="text-xs text-[var(--color-brand)] hover:underline"
                    >
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
