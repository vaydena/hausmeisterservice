-- ============================================================================
-- Audit-Trigger: keinen audit_log-Eintrag schreiben, wenn der Mandant gerade
-- gelöscht wird (Fix für 500 „Etwas ist schiefgelaufen" beim Tenant-Löschen)
-- ============================================================================
-- BEFUND: deleteTenantAction (src/app/platform/tenants/actions.ts) löscht einen
-- Mandanten per einfachem `delete from public.tenants`. Der ON DELETE CASCADE
-- räumt die Kind-Tabellen (memberships, roles, role_permissions, user_roles,
-- tenant_modules …) ab; deren AFTER-DELETE-Audit-Trigger app_auth.log_change()
-- feuert dabei und will eine audit_log-Zeile mit dem tenant_id des sterbenden
-- Mandanten schreiben. Zu diesem Zeitpunkt ist die tenants-Zeile bereits weg →
-- Verstoß gegen audit_log_tenant_id_fkey → die Server-Action wirft → der Nutzer
-- sieht die generische Fehlerseite. Der Löschknopf funktionierte damit für KEINEN
-- befüllten Mandanten. (Beobachtet in postgres_logs am 2026-08-18 ~13:10 bei zwei
-- Löschversuchen: „insert or update on table \"audit_log\" violates foreign key
-- constraint \"audit_log_tenant_id_fkey\"".)
--
-- FIX (an der Wurzel, nicht pro Aufrufer): In log_change() beim DELETE prüfen, ob
-- der Mandant überhaupt noch existiert. Wenn nicht (die Cascade-Löschung des
-- Mandanten läuft gerade), den Audit-Eintrag überspringen — er würde wegen
-- audit_log.tenant_id ON DELETE CASCADE ohnehin sofort wieder mitgelöscht.
-- Normale Einzel-Deletes (Mandant existiert weiter) werden unverändert auditiert.
-- Dadurch muss KEIN Aufrufer mehr die Audit-Trigger händisch deaktivieren.
--
-- Body ist identisch zur Vorversion, nur ergänzt um den DELETE-Guard direkt nach
-- der v_tenant_id-Auflösung.
-- ============================================================================

create or replace function app_auth.log_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
  v_data jsonb := coalesce(v_new, v_old);
  v_tenant_id uuid;
  v_row_id uuid;
  v_changed text[];
  v_ignore text[] := array['updated_at', 'updated_by'];
begin
  v_tenant_id := case TG_TABLE_NAME
    when 'tenants' then (v_data->>'id')::uuid
    when 'role_permissions' then (
      select r.tenant_id from public.roles r
      where r.id = (v_data->>'role_id')::uuid
    )
    else (v_data->>'tenant_id')::uuid
  end;

  if v_tenant_id is null then
    return null;
  end if;

  -- Beim Cascade-Löschen eines Mandanten ist die tenants-Zeile bereits entfernt,
  -- während die Kind-Zeilen (und die tenants-Zeile selbst) noch AUDIT auslösen.
  -- Ein audit_log-Insert mit diesem tenant_id würde gegen audit_log_tenant_id_fkey
  -- verstoßen. Existiert der Mandant nicht mehr, überspringen wir den Eintrag.
  if TG_OP = 'DELETE'
     and not exists (select 1 from public.tenants t where t.id = v_tenant_id) then
    return null;
  end if;

  if v_data ? 'id' then
    v_row_id := (v_data->>'id')::uuid;
  end if;

  if TG_OP = 'UPDATE' then
    select coalesce(array_agg(k), array[]::text[])
      into v_changed
    from jsonb_object_keys(v_new) k
    where (v_new -> k) is distinct from (v_old -> k)
      and k <> all(v_ignore);

    if v_changed is null or array_length(v_changed, 1) is null then
      return null;
    end if;
  end if;

  insert into public.audit_log
    (tenant_id, occurred_at, actor_id, table_name, row_id, action, old_data, new_data, changed_columns)
  values
    (v_tenant_id, now(), auth.uid(), TG_TABLE_NAME, v_row_id, TG_OP, v_old, v_new, v_changed);

  return null;
end;
$function$;
