import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';

/**
 * Namen der Rollen, die dem User im aktuellen Mandanten zugewiesen sind —
 * so, wie der Mandant sie benannt hat, nicht wie die Vorlage hiess. Ein
 * Betrieb, der "Hausmeister" in "Objektbetreuer" umbenennt, soll auch
 * "Objektbetreuer" lesen.
 *
 * Zwei Queries statt eines Embeds, analog zu getEffectivePermissions: die
 * PostgREST-Einbettung liefert je nach Join-Form nullable Typen, und der
 * Umweg ueber role_id ist hier ohnehin nur ein zweiter Index-Zugriff.
 *
 * `cache()` haelt es pro Request bei einem Durchlauf, auch wenn Layout und
 * Seite beide fragen.
 */
export const getUserRoleNames = cache(
  async (userId: string, tenantId: string): Promise<string[]> => {
    const supabase = await createSupabaseServerClient();

    const assignments = unwrapRows(
      await supabase
        .from('user_roles')
        .select('role_id')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId),
      'Rollen-Anzeige: Zuweisungen',
    );

    const roleIds = [...new Set(assignments.map((a) => a.role_id))];
    if (roleIds.length === 0) return [];

    const roles = unwrapRows(
      await supabase.from('roles').select('name').in('id', roleIds).order('name'),
      'Rollen-Anzeige: Rollennamen',
    );

    return roles.map((r) => r.name);
  },
);
