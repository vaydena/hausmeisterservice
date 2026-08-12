-- Sprint 10.9 · Neue Tenants sollen automatisch mit 14-Tage-Trial starten.
--
-- Der explizite update in 20260812081218_platform_layer_and_subscriptions
-- gilt nur für existierende Zeilen zum Zeitpunkt der Migration. Frisch
-- angelegte Tenants (via provision_signup_tenant) hatten sonst
-- trial_ends_at = NULL und wären damit unbeschränkt in der Testphase.

alter table public.tenants
  alter column trial_ends_at set default now() + interval '14 days';
