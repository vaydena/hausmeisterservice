import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

/**
 * Demo-Daten sind an einem Präfix "[Demo]" im name/title erkennbar.
 * Damit brauchen wir keinen zusätzlichen boolean im Schema und der Owner
 * kann alles wieder loswerden, ohne dass "richtige" Daten mit gelöscht werden.
 */
export const DEMO_PREFIX = '[Demo]';

interface DemoProperty {
  name: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  property_type: string;
  notes: string;
}

const PROPERTIES: DemoProperty[] = [
  {
    name: '[Demo] Mustergasse 1',
    street: 'Mustergasse',
    house_number: '1',
    postal_code: '10115',
    city: 'Berlin',
    property_type: 'wohnhaus',
    notes: '12 WE, Bj. 1984, saniert 2019. Aufzug im Bestand.',
  },
  {
    name: '[Demo] Beispielweg 42',
    street: 'Beispielweg',
    house_number: '42',
    postal_code: '80331',
    city: 'München',
    property_type: 'wohnhaus',
    notes: '8 WE, Reihenhaus-Ensemble, gemeinschaftlicher Garten.',
  },
  {
    name: '[Demo] Hauptstraße 7 (Büro)',
    street: 'Hauptstraße',
    house_number: '7',
    postal_code: '20095',
    city: 'Hamburg',
    property_type: 'gewerbe',
    notes: 'Bürogebäude, 3 Etagen, Reinigungsvertrag inklusive.',
  },
];

const WORK_ORDERS: Array<{
  title: string;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'done';
  category: string;
  propertyIndex: number;
}> = [
  {
    title: '[Demo] Wasserhahn Küche 2. OG tropft',
    description: 'Bewohner meldet, dass die Küchenarmatur tropft. Bitte Dichtung tauschen.',
    priority: 'normal',
    status: 'open',
    category: 'sanitaer',
    propertyIndex: 0,
  },
  {
    title: '[Demo] Winterdienst — Vertrag prüfen',
    description: 'Anbieter-Angebote für Saison 2026/27 einholen.',
    priority: 'low',
    status: 'open',
    category: 'organisation',
    propertyIndex: 1,
  },
  {
    title: '[Demo] Aufzug Wartung überfällig',
    description: 'TÜV-Prüfung war am 05.08. — Nachweis einholen und ablegen.',
    priority: 'high',
    status: 'in_progress',
    category: 'wartung',
    propertyIndex: 0,
  },
  {
    title: '[Demo] Fassadenreinigung Ostseite',
    description: 'Angebot erstellen für Reinigung inkl. Gerüst.',
    priority: 'normal',
    status: 'done',
    category: 'reinigung',
    propertyIndex: 2,
  },
];

export async function loadDemoDataForTenant(tenantId: string, userId: string): Promise<{
  properties: number;
  workOrders: number;
}> {
  const service = createSupabaseServiceClient();

  const { data: existing } = await service
    .from('properties')
    .select('id')
    .eq('tenant_id', tenantId)
    .like('name', `${DEMO_PREFIX}%`);
  if (existing && existing.length > 0) {
    return { properties: 0, workOrders: 0 };
  }

  const propInserts = PROPERTIES.map((p) => ({
    ...p,
    tenant_id: tenantId,
    created_by: userId,
  }));
  const { data: insertedProps, error: pErr } = await service
    .from('properties')
    .insert(propInserts)
    .select('id, name');
  if (pErr) throw pErr;
  if (!insertedProps) return { properties: 0, workOrders: 0 };

  const orderedByName = PROPERTIES.map(
    (p) => insertedProps.find((x) => x.name === p.name)!,
  );

  const woInserts = WORK_ORDERS.map((w) => {
    const prop = orderedByName[w.propertyIndex];
    if (!prop) throw new Error(`Demo-Objekt ${w.propertyIndex} nicht gefunden.`);
    return {
      title: w.title,
      description: w.description,
      priority: w.priority,
      status: w.status,
      category: w.category,
      property_id: prop.id,
      tenant_id: tenantId,
      created_by: userId,
    };
  });
  const { data: insertedWos, error: wErr } = await service
    .from('work_orders')
    .insert(woInserts)
    .select('id');
  if (wErr) throw wErr;

  return {
    properties: insertedProps.length,
    workOrders: insertedWos?.length ?? 0,
  };
}

export async function removeDemoDataFromTenant(tenantId: string): Promise<{
  properties: number;
  workOrders: number;
}> {
  const service = createSupabaseServiceClient();

  // Zuerst Aufträge, damit die FK-Kaskade nicht auf einen bereits gelöschten
  // Property greift (auch wenn ON DELETE cascade greifen würde, ist es sauberer).
  const { data: wos } = await service
    .from('work_orders')
    .select('id')
    .eq('tenant_id', tenantId)
    .like('title', `${DEMO_PREFIX}%`);
  if (wos && wos.length > 0) {
    await service
      .from('work_orders')
      .delete()
      .in(
        'id',
        wos.map((w) => w.id),
      );
  }

  const { data: props } = await service
    .from('properties')
    .select('id')
    .eq('tenant_id', tenantId)
    .like('name', `${DEMO_PREFIX}%`);
  if (props && props.length > 0) {
    await service
      .from('properties')
      .delete()
      .in(
        'id',
        props.map((p) => p.id),
      );
  }

  return {
    properties: props?.length ?? 0,
    workOrders: wos?.length ?? 0,
  };
}

export async function countDemoDataForTenant(tenantId: string): Promise<number> {
  const service = createSupabaseServiceClient();
  const { count } = await service
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .like('name', `${DEMO_PREFIX}%`);
  return count ?? 0;
}
