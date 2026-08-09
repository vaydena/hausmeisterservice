import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Checklisten' };

export default async function ChecklistTemplatesPage() {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const [{ data: templates }, { data: itemCounts }] = await Promise.all([
    supabase
      .from('checklist_templates')
      .select('id, code, title, description, category, active')
      .is('deleted_at', null)
      .order('active', { ascending: false })
      .order('title'),
    supabase.from('checklist_template_items').select('template_id'),
  ]);

  const items = templates ?? [];
  const countByTemplate = new Map<string, number>();
  for (const row of itemCounts ?? [])
    countByTemplate.set(row.template_id, (countByTemplate.get(row.template_id) ?? 0) + 1);

  const canCreate = permissions.has('checklists.create');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Checklisten"
        description="Vorlagen für wiederkehrende Prüf- und Wartungsaufgaben."
        action={
          canCreate ? <LinkButton href="/checklists/new">Neue Checkliste</LinkButton> : undefined
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Noch keine Checklisten angelegt"
          description={
            'Erstellen Sie Vorlagen wie „Rauchmelder-Wartung" oder „Objekt-Übergabe" mit einzelnen Prüfpunkten.'
          }
          action={
            canCreate ? (
              <LinkButton href="/checklists/new">Erste Vorlage anlegen</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {items.map((t) => {
              const count = countByTemplate.get(t.id) ?? 0;
              return (
                <li key={t.id}>
                  <Link
                    href={`/checklists/${t.id}`}
                    className="flex flex-col gap-2 p-4 transition hover:bg-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {t.code && <Badge tone="muted">{t.code}</Badge>}
                        <span className="truncate font-medium">{t.title}</span>
                        {t.category && (
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            {t.category}
                          </span>
                        )}
                        {!t.active && <Badge tone="muted">Inaktiv</Badge>}
                      </div>
                      {t.description && (
                        <p className="line-clamp-1 text-xs text-[var(--color-muted-foreground)]">
                          {t.description}
                        </p>
                      )}
                    </div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">
                      {count} {count === 1 ? 'Prüfpunkt' : 'Prüfpunkte'}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
