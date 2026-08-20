-- PayPal als dritte Abo-Zahlungsart (neben Banküberweisung / Stripe).
--
-- Zwei Dinge:
--   1. Die CHECK-Constraints auf payment_method (public.tenants UND
--      platform.invoices) um 'paypal' erweitern. Die Constraints wurden in
--      20260812081218 inline ohne eigenen Namen angelegt — wir lösen sie
--      deshalb namensunabhängig über pg_constraint (statt auf den
--      auto-generierten Namen zu wetten) und setzen sie mit explizitem Namen neu.
--   2. platform.invoices um paypal_order_id / paypal_capture_id ergänzen:
--      die Order-ID wird vor der Freigabe gespeichert (Zuordnung bei Rückkehr),
--      die Capture-ID nach erfolgreicher Zahlung.

-- 1a. public.tenants.payment_method
do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.tenants'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%payment_method%';
  if c is not null then
    execute format('alter table public.tenants drop constraint %I', c);
  end if;
end $$;

alter table public.tenants
  add constraint tenants_payment_method_check
  check (payment_method in ('bank_transfer', 'stripe', 'paypal'));

-- 1b. platform.invoices.payment_method
do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'platform.invoices'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%payment_method%';
  if c is not null then
    execute format('alter table platform.invoices drop constraint %I', c);
  end if;
end $$;

alter table platform.invoices
  add constraint invoices_payment_method_check
  check (payment_method in ('bank_transfer', 'stripe', 'paypal'));

-- 2. PayPal-Referenzen auf der Rechnung.
alter table platform.invoices
  add column if not exists paypal_order_id   text,
  add column if not exists paypal_capture_id text;
