import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';

export interface TenantContext {
  userId: string;
  tenantId: string;
  /**
   * Sprint 123: Der Firmenname des Mandanten, in dem der User gerade
   * arbeitet. Steht im Benutzermenue ueber der Rolle.
   *
   * Klingt nach Kosmetik, ist aber die Antwort auf eine echte Verwechslung:
   * der Betreiber hat unter derselben E-Mail einen eigenen Mandanten UND
   * den Plattform-Bereich; ein Kunde hat seinen eigenen. Ohne den Namen
   * sieht jede dieser Ansichten gleich aus, und die Frage "in wessen Firma
   * bin ich hier eigentlich?" ist aus der Oberflaeche nicht zu beantworten.
   *
   * Kommt ohne zusaetzlichen Roundtrip: als Embedded Resource an der
   * Membership-Query, die ohnehin laeuft.
   */
  tenantName: string;
  membershipId: string;
  isOwner: boolean;
  displayName: string | null;
  email: string | null;
}

/**
 * Liest den aktuellen User + seine primäre Tenant-Membership.
 * `cache()` sorgt dafür, dass wir das pro Request nur einmal aus der DB holen.
 *
 * Multi-Tenant-Switch (User gehört zu mehreren Tenants) kommt später über
 * einen JWT-Custom-Claim `app_tenant_id`. Bis dahin nehmen wir die erste
 * aktive Membership (gleich wie `app_auth.current_tenant_id()` als Fallback).
 */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Sprint 104: Von allen Staff-Queries ist das die folgenreichste — das
  // Gegenstueck zu getResidentContext() im Portal. `null` heisst hier
  // "dieser User gehoert zu keinem Mandanten", und requireTenantContext()
  // bzw. das App-Layout schicken ihn daraufhin auf /no-access. Solange der
  // Fehler verschluckt wurde, hat also jede Stoerung an dieser einen Query
  // einem zahlenden Kunden mitgeteilt, er habe keinen Zugang zu seiner
  // eigenen Firma. unwrapMaybeRow trennt die beiden Faelle: kein Treffer
  // liefert weiterhin null, ein Query-Fehler wirft.
  const membership = unwrapMaybeRow(
    await supabase
      .from('memberships')
      .select('id, tenant_id, is_owner, tenants(name)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    'Tenant-Kontext: Membership',
  );

  if (!membership) return null;

  const profile = unwrapMaybeRow(
    await supabase.from('users').select('display_name').eq('id', user.id).maybeSingle(),
    'Tenant-Kontext: Anzeigename',
  );

  return {
    userId: user.id,
    tenantId: membership.tenant_id,
    // Fallback statt Fehler: ohne Namen fehlt eine Beschriftung, ohne
    // Kontext fehlt der Zugang. Das eine ist ein Schoenheitsfehler, das
    // andere sperrt den Kunden aus seiner Firma aus.
    tenantName: membership.tenants?.name ?? 'Ihr Unternehmen',
    membershipId: membership.id,
    isOwner: membership.is_owner,
    displayName: profile?.display_name ?? null,
    email: user.email ?? null,
  };
});

export async function requireTenantContext(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) {
    // Kein throw — sonst 500 statt sauberer Redirect. Ein Bewohner ohne
    // Staff-Membership landet über das App-Layout ohnehin im Portal.
    // Ein eingeloggter User ohne jede Rolle darf NICHT nach /login, weil
    // der Proxy ihn dort sofort wieder auf /dashboard schickt
    // (ERR_TOO_MANY_REDIRECTS). Wer gar nicht eingeloggt ist, wird vom
    // Proxy schon vorher abgefangen; /no-access rendert dann trotzdem
    // sauber (die Seite prüft die Session erneut).
    redirect('/no-access');
  }
  return ctx;
}
