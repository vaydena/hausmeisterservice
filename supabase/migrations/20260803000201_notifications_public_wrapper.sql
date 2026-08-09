-- =============================================================================
-- Public Wrapper für app_auth.enqueue_notification
-- =============================================================================
-- PostgREST/Supabase-RPC bedient nur das public-Schema. Der Wrapper delegiert
-- 1:1 an die SECURITY DEFINER Funktion im app_auth-Schema, damit Server-Actions
-- Notifications via supabase.rpc() erzeugen können.
-- =============================================================================

create or replace function public.enqueue_notification(
  p_user_id uuid,
  p_kind text,
  p_subject text,
  p_body text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_url text default null
) returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_auth.enqueue_notification(p_user_id, p_kind, p_subject, p_body, p_entity_type, p_entity_id, p_url);
$$;

grant execute on function public.enqueue_notification(uuid, text, text, text, text, uuid, text) to authenticated;

comment on function public.enqueue_notification is
  'Public-Wrapper für app_auth.enqueue_notification (damit via PostgREST/RPC aufrufbar).';
