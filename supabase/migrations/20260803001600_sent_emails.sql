-- Sent-Emails — Audit-Log für ausgehende Transaktions-Mails
-- (Rechnungen, Angebote, später Erinnerungen usw.)
--
-- Wir speichern nur Metadaten + Subject + Hash des Bodies (DSGVO: möglichst wenig).
-- Der Provider-Response (message_id) hilft beim späteren Zustellungs-Tracking.

create type sent_email_status as enum ('queued', 'sent', 'failed');
create type sent_email_entity as enum ('invoice', 'offer');

create table sent_emails (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  entity_type sent_email_entity,
  entity_id uuid,
  provider text not null,
  status sent_email_status not null default 'queued',
  to_addresses text[] not null,
  cc_addresses text[],
  subject text not null,
  body_hash text,
  attachment_names text[],
  provider_message_id text,
  error text,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint sent_emails_to_not_empty check (array_length(to_addresses, 1) >= 1),
  constraint sent_emails_subject_not_empty check (length(trim(subject)) > 0),
  constraint sent_emails_entity_pair check (
    (entity_type is null and entity_id is null)
    or (entity_type is not null and entity_id is not null)
  ),
  constraint sent_emails_status_sent_at check (
    (status <> 'sent') or (sent_at is not null)
  )
);

create index sent_emails_tenant_created_idx on sent_emails(tenant_id, created_at desc);
create index sent_emails_entity_idx on sent_emails(entity_type, entity_id)
  where entity_type is not null;
create index sent_emails_sender_idx on sent_emails(sent_by);

-- ============================================================================
-- RLS
-- ============================================================================

alter table sent_emails enable row level security;

-- SELECT: Tenant-Member mit billing.view (Audit rund um Belege)
create policy "sent_emails.select"
on sent_emails
for select
using (
  app_auth.is_tenant_member(tenant_id)
  and app_auth.has_permission('billing.view')
);

-- INSERT: Tenant-Member mit billing.edit (also nur wer Belege ändern darf)
create policy "sent_emails.insert"
on sent_emails
for insert
with check (
  app_auth.is_tenant_member(tenant_id)
  and tenant_id = app_auth.current_tenant_id()
  and app_auth.has_permission('billing.edit')
);

-- UPDATE: Der:die ursprüngliche Absender:in darf status/message_id/error updaten
-- (z. B. wenn Provider asynchron antwortet).
create policy "sent_emails.update"
on sent_emails
for update
using (
  app_auth.is_tenant_member(tenant_id)
  and (sent_by = auth.uid() or app_auth.has_permission('billing.edit'))
)
with check (app_auth.is_tenant_member(tenant_id));

-- DELETE ist absichtlich verboten — Audit-Log soll immutable sein.
