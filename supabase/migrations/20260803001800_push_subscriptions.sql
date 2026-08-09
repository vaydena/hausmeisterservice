-- =============================================================================
-- Push-Subscriptions — Web-Push (VAPID) pro User + Device
-- =============================================================================
-- Speichert die Web-Push-Subscription eines Browsers/Geräts, damit der Server
-- Push-Nachrichten senden kann. Endpoint ist der eindeutige Identifier.
--
-- RLS: User verwaltet nur eigene Subscriptions. Service-Role (Cron / Dispatch)
-- umgeht RLS und darf beliebig lesen/löschen (ungültige 410/404-Subs
-- aufräumen).
-- =============================================================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_error text,
  constraint push_subscriptions_endpoint_len_ck check (length(endpoint) between 20 and 1000),
  constraint push_subscriptions_p256dh_len_ck check (length(p256dh) between 60 and 200),
  constraint push_subscriptions_auth_len_ck check (length(auth) between 12 and 100)
);

create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
create index push_subscriptions_tenant_user_idx on public.push_subscriptions(tenant_id, user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated
  using (
    user_id = auth.uid()
    and app_auth.is_tenant_member(tenant_id)
  );

create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and tenant_id = app_auth.current_tenant_id()
  );

create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated
  using (
    user_id = auth.uid()
    and app_auth.is_tenant_member(tenant_id)
  );

comment on table public.push_subscriptions is 'Web-Push-Subscriptions pro User+Device. Endpoint ist eindeutig.';
