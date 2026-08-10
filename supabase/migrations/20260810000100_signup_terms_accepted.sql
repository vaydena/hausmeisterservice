-- Sprint 3 · Self-Signup: DSGVO-Nachweis der T&C-/Datenschutz-Zustimmung des
-- Tenant-Owners beim Signup. Nullable, damit Bestand-Memberships (per Seed
-- oder Invite angelegt) nicht brechen; im Signup-Callback wird das Feld
-- einmalig gesetzt.
alter table public.memberships
  add column if not exists terms_accepted_at timestamptz;

comment on column public.memberships.terms_accepted_at is
  'Zeitpunkt der T&C- und Datenschutz-Zustimmung. Beim Self-Signup gesetzt, sonst NULL.';
