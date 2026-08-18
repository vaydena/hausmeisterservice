import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';
import { ownerDisplayName, type OwnerKind } from '@/lib/schemas/owners';

export interface OwnerPropertySummary {
  id: string;
  name: string | null;
  code: string | null;
}

export interface OwnerContext {
  userId: string;
  email: string | null;
  ownerId: string;
  tenantId: string;
  kind: OwnerKind;
  // Vertrags-/Firmenname aus dem owners-Datensatz. Anker fuer Audit-/Legal-
  // Kontexte (defect_reports.reporter_name) — nur vom Mandanten ueber die
  // Owners-CRUD veraenderbar.
  displayName: string;
  // Sprint 44-Muster (wie Bewohnerportal): selbst gepflegter Anzeigename aus
  // users.display_name. Nur gesetzt, wenn er weder leer noch identisch mit der
  // E-Mail ist (Auth-Trigger belegen display_name initial mit der E-Mail).
  preferredDisplayName: string | null;
  // Die Objekte dieses Eigentuemers. Kommt RLS-gefiltert aus `properties`
  // (properties_select_owner) — daher kein Zugriff auf owner_properties noetig,
  // fuer das es bewusst keine Portal-Policy gibt.
  properties: OwnerPropertySummary[];
  propertyIds: string[];
}

/**
 * Liest den aktuellen Auth-User + den verknuepften owners-Datensatz + die
 * ihm zugeordneten Objekte. Rueckgabe null, wenn kein Login oder kein
 * aktiver owners-Datensatz fuer diesen User existiert.
 *
 * Gegenstueck zu getResidentContext() im Bewohnerportal. Ein reiner
 * Portal-Eigentuemer hat KEINE Membership — die Sicht auf den eigenen
 * owners-Datensatz kommt ueber owners_select_own (user_id = auth.uid()),
 * die Objekte ueber properties_select_owner.
 */
export const getOwnerContext = cache(async (): Promise<OwnerContext | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Folgenreichste Query des Portals: jede Owner-Portal-Seite macht
  // `if (!ctx) redirect('/owner/login')`. Ein verschluckter DB-Fehler wuerde
  // den Eigentuemer auf die Login-Seite zurueckwerfen, von der er kommt —
  // aus einer Stoerung wuerde scheinbar "Ihr Zugang funktioniert nicht".
  // unwrapMaybeRow trennt "kein Eigentuemer" (null → Redirect) vom echten
  // Fehler (wirft, landet sichtbar in error.tsx + Sentry).
  const owner = unwrapMaybeRow(
    await supabase
      .from('owners')
      .select('id, tenant_id, kind, first_name, last_name, company_name')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle(),
    'Eigentümerportal: Eigentümer-Kontext',
  );

  if (!owner) return null;

  const [propertiesRes, profileRes] = await Promise.all([
    supabase.from('properties').select('id, name, code').order('name', { ascending: true }),
    supabase.from('users').select('display_name').eq('id', user.id).maybeSingle(),
  ]);

  const properties = unwrapRows(propertiesRes, 'Eigentümerportal: Objekte').map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
  }));

  const rawPreferred = (profileRes.data?.display_name ?? '').trim();
  const preferredDisplayName =
    rawPreferred && rawPreferred.toLowerCase() !== (user.email ?? '').toLowerCase()
      ? rawPreferred
      : null;

  return {
    userId: user.id,
    email: user.email ?? null,
    ownerId: owner.id,
    tenantId: owner.tenant_id,
    kind: owner.kind as OwnerKind,
    displayName: ownerDisplayName(owner),
    preferredDisplayName,
    properties,
    propertyIds: properties.map((p) => p.id),
  };
});

export async function requireOwnerContext(): Promise<OwnerContext> {
  const ctx = await getOwnerContext();
  if (!ctx) {
    throw new Error('NOT_OWNER');
  }
  return ctx;
}
