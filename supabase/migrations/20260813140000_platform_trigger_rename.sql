-- Fix: Trigger-Naming-Convention `<shortTable>_<verb>` fuer die zwei
-- `set_updated_at`-Trigger im platform-Schema. Der urspruengliche Name war
-- `set_updated_at`, was der codebase-weiten Trigger-Uniqueness widerspricht
-- (bereits mehrere Tabellen tragen Trigger dieser Art). Die urspruengliche
-- Migration 20260812081218_platform_layer_and_subscriptions.sql wurde
-- nachtraeglich auf die neuen Namen umgeschrieben (damit frische DBs den
-- Endzustand direkt bekommen); diese Fixup-Migration bringt bereits
-- deployte Prod-DBs auf denselben Stand.
--
-- Idempotent: der Rename laeuft nur, wenn der alte Trigger noch existiert.
-- Auf frischer DB (die die korrigierte Ur-Migration ausfuehrt) sind die
-- Trigger direkt korrekt benannt, der DO-Block ist ein No-Op.

do $$
begin
  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgname = 'set_updated_at'
      and n.nspname = 'platform'
      and c.relname = 'subscription_plans'
  ) then
    alter trigger set_updated_at on platform.subscription_plans
      rename to subscription_plans_set_updated_at;
  end if;

  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgname = 'set_updated_at'
      and n.nspname = 'platform'
      and c.relname = 'invoices'
  ) then
    alter trigger set_updated_at on platform.invoices
      rename to platform_invoices_set_updated_at;
  end if;

  -- Falls die urspruengliche Migration bereits mit dem Zwischennamen
  -- `invoices_set_updated_at` deployt wurde (kollidiert mit dem
  -- gleichnamigen Trigger auf public.invoices), auch dieser Fall wird
  -- auf den Endnamen `platform_invoices_set_updated_at` umgestellt.
  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgname = 'invoices_set_updated_at'
      and n.nspname = 'platform'
      and c.relname = 'invoices'
  ) then
    alter trigger invoices_set_updated_at on platform.invoices
      rename to platform_invoices_set_updated_at;
  end if;
end $$;
