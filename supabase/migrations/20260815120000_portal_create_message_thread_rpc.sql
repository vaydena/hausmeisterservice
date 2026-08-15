-- Sprint 53: Portal-Bewohner startet neuen Message-Thread mit der Hausverwaltung.
--
-- Bisher: message_threads.insert-Policy verlangt has_permission('messaging.create').
-- Bewohner haben diese Permission nicht. Ausserdem verlangt
-- message_thread_participants.insert, dass der Caller selbst bereits Participant
-- ist — Henne-Ei-Problem beim initialen Anlegen mehrerer Empfaenger.
--
-- Loesung: SECURITY DEFINER RPC, die atomar (a) den Thread anlegt, (b) alle
-- aktiven Staff-Members im Tenant mit messaging.create-Permission als
-- Empfaenger eintraegt und (c) die erste Nachricht postet. Der Bewohner selbst
-- wird durch den bestehenden add_thread_creator-Trigger als Participant
-- ergaenzt.
--
-- Sicherheits-Modell:
--   * Tenant kommt aus dem aktiven residents-Record des Callers, nicht aus
--     einem Parameter — kein Cross-Tenant-Missbrauch moeglich.
--   * Empfaenger werden ausschliesslich aus memberships des Tenants gewaehlt
--     (mit passender Permission) — kein Bewohner-zu-Bewohner-Threading.
--   * SECURITY DEFINER bypasst RLS, aber alle Inserts nutzen v_tenant_id,
--     das aus dem Residents-Record stammt. execute geht nur an authenticated.
--
-- Wenn keine Staff-User mit messaging.create existieren, wird der Thread
-- trotzdem angelegt (mit nur dem Bewohner als Participant). Sichtbarkeit fuer
-- Staff ist dann eingeschraenkt, aber das ist ein Setup-Problem des Tenants
-- (Rolle ohne messaging.create), nicht ein Fehler dieser RPC.

create or replace function public.create_portal_message_thread(
  p_subject text,
  p_body text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_thread_id uuid;
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if length(v_subject) < 3 or length(v_subject) > 200 then
    raise exception 'Betreff muss zwischen 3 und 200 Zeichen liegen.'
      using errcode = '22023';
  end if;
  if length(v_body) < 1 or length(v_body) > 4000 then
    raise exception 'Nachricht muss zwischen 1 und 4000 Zeichen liegen.'
      using errcode = '22023';
  end if;

  select r.tenant_id into v_tenant_id
  from public.residents r
  where r.user_id = v_user_id
    and r.deleted_at is null
    and (r.moved_out is null or r.moved_out > current_date)
  order by r.moved_in desc nulls last
  limit 1;

  if v_tenant_id is null then
    raise exception 'Kein aktiver Bewohner-Datensatz.' using errcode = '42501';
  end if;

  -- Trigger app_auth.add_thread_creator ergaenzt den Bewohner als Participant.
  insert into public.message_threads (tenant_id, subject, created_by, updated_by)
  values (v_tenant_id, v_subject, v_user_id, v_user_id)
  returning id into v_thread_id;

  insert into public.message_thread_participants (tenant_id, thread_id, user_id, added_by)
  select v_tenant_id, v_thread_id, staff.user_id, v_user_id
  from (
    select distinct m.user_id
    from public.memberships m
    join public.user_roles ur
      on ur.user_id = m.user_id and ur.tenant_id = m.tenant_id
    join public.role_permissions rp
      on rp.role_id = ur.role_id
    where m.tenant_id = v_tenant_id
      and m.status = 'active'
      and rp.permission_key = 'messaging.create'
      and m.user_id <> v_user_id
  ) staff
  on conflict (thread_id, user_id) do nothing;

  insert into public.messages (tenant_id, thread_id, author_user_id, body)
  values (v_tenant_id, v_thread_id, v_user_id, v_body);

  -- Ersteller (Bewohner) direkt als gelesen markieren.
  update public.message_thread_participants
     set last_read_at = now()
   where thread_id = v_thread_id
     and user_id = v_user_id;

  return v_thread_id;
end;
$$;

revoke execute on function public.create_portal_message_thread(text, text) from public;
grant execute on function public.create_portal_message_thread(text, text) to authenticated;

comment on function public.create_portal_message_thread(text, text) is
  'Portal-Bewohner startet neuen Message-Thread. Fuegt automatisch alle aktiven Staff-Members mit messaging.create-Permission als Empfaenger hinzu. Sprint 53.';
