import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOwnerContext } from '@/lib/owner-portal/current';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { OwnerDefectForm } from './owner-defect-form';

export const metadata: Metadata = { title: 'Mangel melden · Eigentümer-Portal' };

export default async function OwnerMaengelNeuPage() {
  const ctx = await getOwnerContext();
  if (!ctx) redirect('/owner/login');

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Mangel melden"
        description="Beschreiben Sie den Mangel — Ihre Hausverwaltung wird informiert."
      />

      {ctx.properties.length === 0 ? (
        <EmptyState
          title="Kein Objekt zugeordnet"
          description="Sobald Ihnen ein Objekt zugeordnet ist, können Sie hier Mängel melden."
        />
      ) : (
        <Card>
          <CardBody>
            <OwnerDefectForm properties={ctx.properties} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
