/**
 * Utility: prüft, ob eine Permission im effektiven Permission-Set vorhanden ist.
 * Für UI-Elemente (z.B. "Neu anlegen"-Button ausblenden, wenn keine .create-Permission).
 */
import type { PermissionKey } from '@/lib/permissions/registry';

export function can(permissions: Set<PermissionKey>, key: PermissionKey): boolean {
  return permissions.has(key);
}
