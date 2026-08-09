-- =============================================================================
-- Time-Corrections — Genehmigungs-Workflow für Zeit-Korrekturen
-- =============================================================================
-- Ein Mitarbeiter beantragt Änderungen an einem eigenen (oder fremden, mit
-- edit-Permission) Zeiteintrag. Ein Approver mit time_tracking.approve
-- entscheidet: approved → Änderung wird auf time_entries angewandt (Server-
-- Action, damit updated_by korrekt gesetzt ist), rejected → Antrag bleibt
-- historisch erhalten. Der Antragsteller kann pending-Anträge selbst
-- zurückziehen (withdrawn).
--
-- Alle proposed_* Felder sind nullable — ein Antrag ändert nur, was gesetzt
-- ist. NULL heißt "keine Änderung". `proposed_end_at = ''` (leerer String)
-- ist nicht möglich; um ein Ende explizit zu entfernen (wieder offen) müsste
-- eine separate Flag gesetzt werden, das ist absichtlich NICHT unterstützt.
-- =============================================================================

create table public.time_entry_corrections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  time_entry_id uuid not null references public.time_entries(id) on delete cascade,
  entry_user_id uuid not null references auth.users(id) on delete cascade,

  requested_by uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  reason text not null check (length(reason) between 3 and 2000),

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),

  proposed_kind text check (proposed_kind is null or proposed_kind in ('work', 'break', 'travel', 'standby')),
  proposed_start_at timestamptz,
  proposed_end_at timestamptz,
  proposed_work_order_id uuid references public.work_orders(id) on delete set null,
  proposed_property_id uuid references public.properties(id) on delete set null,
  proposed_note text check (proposed_note is null or length(proposed_note) <= 1000),

  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 2000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint time_corr_end_after_start check (
    proposed_end_at is null
    or proposed_start_at is null
    or proposed_end_at > proposed_start_at
  ),
  constraint time_corr_at_least_one_change check (
    proposed_kind is not null
    or proposed_start_at is not null
    or proposed_end_at is not null
    or proposed_work_order_id is not null
    or proposed_property_id is not null
    or proposed_note is not null
  ),
  constraint time_corr_decision_shape check (
    (status = 'pending' and decided_by is null and decided_at is null)
    or (status in ('approved', 'rejected') and decided_by is not null and decided_at is not null)
    or (status = 'withdrawn' and decided_at is not null)
  )
);

create index time_corr_tenant_status_idx
  on public.time_entry_corrections(tenant_id, status, requested_at desc);
create index time_corr_entry_idx
  on public.time_entry_corrections(time_entry_id);
create index time_corr_requester_idx
  on public.time_entry_corrections(requested_by, requested_at desc);
create index time_corr_decided_by_idx
  on public.time_entry_corrections(decided_by) where decided_by is not null;

create trigger time_entry_corrections_set_updated_at
  before update on public.time_entry_corrections
  for each row execute function app_auth.set_updated_at();

alter table public.time_entry_corrections enable row level security;

-- Sehen
create policy "time_corr_select_own" on public.time_entry_corrections
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and (
      requested_by = (select auth.uid())
      or entry_user_id = (select auth.uid())
    )
  );

create policy "time_corr_select_others" on public.time_entry_corrections
  for select to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('time_tracking.approve')
  );

-- Anlegen: Antragsteller ist immer der aktuelle User. Für eigene Einträge
-- reicht time_tracking.edit; für fremde zusätzlich view_others.
create policy "time_corr_insert_own_entry" on public.time_entry_corrections
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and requested_by = (select auth.uid())
    and entry_user_id = (select auth.uid())
    and status = 'pending'
    and app_auth.has_permission('time_tracking.edit')
  );

create policy "time_corr_insert_others_entry" on public.time_entry_corrections
  for insert to authenticated
  with check (
    tenant_id = app_auth.current_tenant_id()
    and requested_by = (select auth.uid())
    and entry_user_id <> (select auth.uid())
    and status = 'pending'
    and app_auth.has_permission('time_tracking.view_others')
    and app_auth.has_permission('time_tracking.edit')
  );

-- Update: Requester kann zurückziehen (pending → withdrawn), Approver
-- entscheidet (pending → approved/rejected). Approver darf keine eigenen
-- Anträge auf eigene Einträge genehmigen (self-approval verhindern).
create policy "time_corr_withdraw_own" on public.time_entry_corrections
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and requested_by = (select auth.uid())
  )
  with check (
    app_auth.is_tenant_member(tenant_id)
    and requested_by = (select auth.uid())
    and status in ('pending', 'withdrawn')
  );

create policy "time_corr_decide" on public.time_entry_corrections
  for update to authenticated
  using (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('time_tracking.approve')
    and requested_by <> (select auth.uid())
  )
  with check (
    app_auth.is_tenant_member(tenant_id)
    and app_auth.has_permission('time_tracking.approve')
    and status in ('approved', 'rejected')
  );
