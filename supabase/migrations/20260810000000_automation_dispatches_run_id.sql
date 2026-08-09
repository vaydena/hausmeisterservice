-- Automation-Dispatches werden nun mit ihrem auslösenden Run verknüpft.
-- Erlaubt die Run-Detail-View: „welche Entities wurden bei diesem Lauf
-- tatsächlich benachrichtigt?" (heute nur Aggregate in automation_runs).
--
-- run_id ist nullable: alte Dispatches (vor dieser Migration) haben keinen Run,
-- und bei ON DELETE SET NULL bleibt der Dispatch (= „bereits ausgelöst")
-- erhalten, auch wenn der Run gelöscht wird. Der PK (rule_id, entity_type,
-- entity_id, dispatch_key) bleibt die Dedup-Grundlage.

alter table automation_dispatches
  add column run_id uuid references automation_runs(id) on delete set null;

create index automation_dispatches_run_idx on automation_dispatches(run_id)
  where run_id is not null;
