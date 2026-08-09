-- FK-Coverage-Indexe für time_entry_corrections. `decided_by` ist bereits
-- gedeckt; die drei restlichen FKs bekommen jeweils einen Index (die beiden
-- proposed_*-FKs partiell, da meist NULL).

create index time_corr_entry_user_idx
  on public.time_entry_corrections(entry_user_id);
create index time_corr_proposed_property_idx
  on public.time_entry_corrections(proposed_property_id)
  where proposed_property_id is not null;
create index time_corr_proposed_work_order_idx
  on public.time_entry_corrections(proposed_work_order_id)
  where proposed_work_order_id is not null;
