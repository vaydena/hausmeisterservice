import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/platform/require-admin';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { formatDate, formatEUR } from '@/lib/format';
import { StatusBadge } from '@/components/platform/status-badge';
import { Button } from '@/components/ui/button';
import { createPlatformServiceClient } from '@/lib/supabase/platform';
import {
  extendTrialAction,
  setTenantStatusAction,
  changeTenantPlanAction,
  deleteTenantAction,
} from '../actions';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PlatformTenantDetailPage({ params }: Props) {
  await requirePlatformAdmin();
  const { id } = await params;

  const service = createSupabaseServiceClient();

  const [{ data: tenant }, { data: memberships }, { data: plans }, { data: invoices }] =
    await Promise.all([
      service.from('tenants').select('*').eq('id', id).maybeSingle(),
      service
        .from('memberships')
        .select('id, is_owner, status, user_id, created_at')
        .eq('tenant_id', id)
        .order('created_at', { ascending: true }),
      createPlatformServiceClient().from('subscription_plans').select('*').order('sort_order'),
      createPlatformServiceClient()
        .from('invoices')
        .select('id, invoice_number, total_cents, status, paid_at, issued_at, period_start, period_end')
        .eq('tenant_id', id)
        .order('issued_at', { ascending: false })
        .limit(20),
    ]);

  if (!tenant) notFound();

  // Owner-Email nachladen
  const ownerId = memberships?.find((m) => m.is_owner)?.user_id;
  let ownerEmail: string | null = null;
  if (ownerId) {
    const { data: authUser } = await service.auth.admin.getUserById(ownerId);
    ownerEmail = authUser?.user?.email ?? null;
  }

  const currentPlan = plans?.find((p) => p.id === tenant.subscription_plan_id);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex items-start justify-between">
        <div>
          <Link
            href="/platform/tenants"
            className="text-xs text-[var(--color-muted-foreground)] hover:underline"
          >
            ← Agenturen
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{tenant.name}</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            /{tenant.slug} · {ownerEmail ?? 'kein Owner'}
          </p>
        </div>
        <StatusBadge status={tenant.subscription_status} />
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <InfoCard label="Aktueller Plan">
          <div className="text-lg font-medium">{currentPlan?.name ?? '—'}</div>
          {currentPlan && (
            <div className="text-sm text-[var(--color-muted-foreground)]">
              {tenant.subscription_interval === 'yearly'
                ? `${formatEUR(currentPlan.yearly_price_cents)}/Jahr`
                : `${formatEUR(currentPlan.monthly_price_cents)}/Monat`}
            </div>
          )}
        </InfoCard>
        <InfoCard label="Zeitraum">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--color-muted-foreground)]">Testphase bis:</dt>
              <dd>{formatDate(tenant.trial_ends_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-muted-foreground)]">Aktuelle Periode:</dt>
              <dd>{formatDate(tenant.current_period_start)} – {formatDate(tenant.current_period_end)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--color-muted-foreground)]">Angelegt:</dt>
              <dd>{formatDate(tenant.created_at)}</dd>
            </div>
          </dl>
        </InfoCard>
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
          Aktionen
        </h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <form action={extendTrialAction} className="flex flex-col gap-2">
            <label className="text-sm font-medium">Testphase verlängern</label>
            <input type="hidden" name="tenantId" value={tenant.id} />
            <div className="flex gap-2">
              <input
                type="number"
                name="days"
                defaultValue={14}
                min={1}
                max={365}
                className="w-20 rounded-md border border-[var(--color-border)] px-2 py-1 text-sm"
              />
              <span className="self-center text-sm text-[var(--color-muted-foreground)]">Tage</span>
              <Button variant="secondary" size="sm" type="submit">Verlängern</Button>
            </div>
          </form>

          <form action={setTenantStatusAction} className="flex flex-col gap-2">
            <label className="text-sm font-medium">Status setzen</label>
            <input type="hidden" name="tenantId" value={tenant.id} />
            <div className="flex gap-2">
              <select
                name="status"
                defaultValue={tenant.subscription_status}
                className="rounded-md border border-[var(--color-border)] px-2 py-1 text-sm"
              >
                <option value="trial">Testphase</option>
                <option value="active">Aktiv</option>
                <option value="past_due">Zahlung offen</option>
                <option value="suspended">Suspendiert</option>
                <option value="canceled">Gekündigt</option>
              </select>
              <Button variant="secondary" size="sm" type="submit">Setzen</Button>
            </div>
          </form>

          <form action={changeTenantPlanAction} className="flex flex-col gap-2 md:col-span-2">
            <label className="text-sm font-medium">Plan wechseln</label>
            <input type="hidden" name="tenantId" value={tenant.id} />
            <div className="flex flex-wrap gap-2">
              <select
                name="planId"
                defaultValue={tenant.subscription_plan_id ?? ''}
                required
                className="rounded-md border border-[var(--color-border)] px-2 py-1 text-sm"
              >
                <option value="" disabled>— Plan wählen —</option>
                {plans?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select
                name="interval"
                defaultValue={tenant.subscription_interval ?? 'monthly'}
                className="rounded-md border border-[var(--color-border)] px-2 py-1 text-sm"
              >
                <option value="monthly">Monatlich</option>
                <option value="yearly">Jährlich</option>
              </select>
              <Button variant="secondary" size="sm" type="submit">Plan setzen</Button>
            </div>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
          Letzte Rechnungen
        </h2>
        {invoices && invoices.length > 0 ? (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase text-[var(--color-muted-foreground)]">
              <tr>
                <th className="py-2">Nummer</th>
                <th className="py-2">Ausgestellt</th>
                <th className="py-2">Zeitraum</th>
                <th className="py-2">Betrag</th>
                <th className="py-2">Status</th>
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
                    ) : (
                      <span className="text-amber-700">offen</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">Noch keine Rechnungen.</p>
        )}
      </section>

      <section className="rounded-2xl border border-red-200 bg-red-50/40 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-red-700">
          Gefahrenzone
        </h2>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          Löscht die Agentur unwiderruflich mit allen Daten (Objekte, Mitarbeiter, Aufträge, Storage).
          Zur Bestätigung den exakten Firmennamen eintragen.
        </p>
        <form action={deleteTenantAction} className="mt-3 flex flex-wrap gap-2">
          <input type="hidden" name="tenantId" value={tenant.id} />
          <input
            type="text"
            name="confirmName"
            required
            placeholder={tenant.name}
            className="rounded-md border border-red-300 bg-white px-2 py-1 text-sm"
          />
          <Button variant="destructive" size="sm" type="submit">
            Agentur endgültig löschen
          </Button>
        </form>
      </section>
    </div>
  );
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
