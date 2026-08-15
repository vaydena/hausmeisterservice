import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface ResidentContext {
  userId: string;
  email: string | null;
  residentId: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  // Vertragsname aus residents.first_name + last_name. Bleibt der Anker
  // fuer Audit-/Legal-Kontexte (defect_reports.reporter_name etc.) — wird
  // nur durch den Admin ueber die Residents-CRUD veraendert.
  displayName: string;
  // Sprint 44: Vom Bewohner selbst gewaehlter Anzeigename aus
  // users.display_name. Nur gesetzt, wenn der User ihn explizit
  // gepflegt hat — d.h. wenn er weder leer noch identisch mit der
  // E-Mail ist (die Auth-Trigger belegen display_name initial mit
  // der E-Mail). UI verwendet `preferredDisplayName ?? displayName`.
  preferredDisplayName: string | null;
  propertyId: string;
  propertyName: string | null;
  buildingId: string | null;
  buildingName: string | null;
  unitId: string | null;
  unitCode: string | null;
  movedIn: string | null;
  movedOut: string | null;
}

/**
 * Liest den aktuellen User + verknüpften Resident-Record + Objektdetails.
 * Rückgabe null wenn kein Login oder kein aktiver Resident-Datensatz für user.
 */
export const getResidentContext = cache(async (): Promise<ResidentContext | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: resident } = await supabase
    .from('residents')
    .select(
      'id, tenant_id, first_name, last_name, property_id, building_id, unit_id, moved_in, moved_out',
    )
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('moved_in', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!resident || !resident.property_id) return null;
  const propertyId = resident.property_id;

  const [propertyRes, buildingRes, unitRes, profileRes] = await Promise.all([
    supabase.from('properties').select('name').eq('id', propertyId).maybeSingle(),
    resident.building_id
      ? supabase.from('buildings').select('name').eq('id', resident.building_id).maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
    resident.unit_id
      ? supabase.from('units').select('code').eq('id', resident.unit_id).maybeSingle()
      : Promise.resolve({ data: null as { code: string } | null }),
    supabase.from('users').select('display_name').eq('id', user.id).maybeSingle(),
  ]);

  // preferredDisplayName ist nur dann "vom Bewohner gepflegt", wenn er
  // sich vom Auth-Trigger-Default (E-Mail) unterscheidet. Sonst null,
  // damit die UI auf den Vertragsnamen zurueckfaellt.
  const rawPreferred = (profileRes.data?.display_name ?? '').trim();
  const preferredDisplayName =
    rawPreferred && rawPreferred.toLowerCase() !== (user.email ?? '').toLowerCase()
      ? rawPreferred
      : null;

  return {
    userId: user.id,
    email: user.email ?? null,
    residentId: resident.id,
    tenantId: resident.tenant_id,
    firstName: resident.first_name,
    lastName: resident.last_name,
    displayName: `${resident.first_name} ${resident.last_name}`.trim(),
    preferredDisplayName,
    propertyId,
    propertyName: propertyRes.data?.name ?? null,
    buildingId: resident.building_id,
    buildingName: buildingRes.data?.name ?? null,
    unitId: resident.unit_id,
    unitCode: unitRes.data?.code ?? null,
    movedIn: resident.moved_in,
    movedOut: resident.moved_out,
  };
});

export async function requireResidentContext(): Promise<ResidentContext> {
  const ctx = await getResidentContext();
  if (!ctx) {
    throw new Error('NOT_RESIDENT');
  }
  return ctx;
}
