-- Sprint 116: Schreibrecht auf platform.invoices vom Client zurueckziehen.
--
-- Anlass ist der Befund, dass das Schema `platform` in PostgREST nie
-- exponiert war (PGRST106). Solange das so bleibt, ist unten stehendes
-- Grant unerreichbar — sobald der Betreiber das Schema exponiert, damit
-- /preise und /platform ueberhaupt funktionieren, wird es scharf. Deshalb
-- raeumen wir vorher auf, nicht nachher.
--
-- `authenticated` hatte INSERT auf platform.invoices, flankiert von der
-- Policy invoices_insert (Plattform-Admin ODER aktiver Inhaber des eigenen
-- Mandanten). Die App braucht davon nichts: die einzige Stelle, die eine
-- Plattform-Rechnung anlegt, ist die "Zahlung melden"-Action in
-- src/app/(app)/settings/subscription/actions.ts, und die schreibt ueber
-- createPlatformServiceClient() — also service_role, das RLS ohnehin
-- umgeht. Das Grant war nie ein Pfad, den der Code benutzt.
--
-- Was es dagegen erlauben wuerde: ein Inhaber setzt per Roh-REST eine
-- eigene Rechnung mit beliebigem Betrag und status='paid' in die Liste,
-- die der Betreiber unter /platform/payments zur Bestaetigung vorgelegt
-- bekommt. Das hebelt keine Sperre direkt aus — der Zugang haengt an
-- public.tenants.subscription_status, nicht an dieser Tabelle, und UPDATE
-- bleibt Plattform-Admins vorbehalten. Es ist aber eine Einladung an den
-- Betreiber, eine Zahlung zu bestaetigen, die nie auf dem Konto lag.
--
-- SELECT bleibt: der Inhaber muss seine eigenen Rechnungen sehen und als
-- PDF ziehen koennen.

begin;

revoke insert on table platform.invoices from authenticated;

-- Die Policy ohne Grant waere wirkungslos, aber missverstaendlich: sie
-- beschriebe weiterhin einen Schreibpfad, den es nicht gibt. Und faende
-- jemand spaeter das Grant wieder ein, wuerde die verbliebene Policy es
-- stillschweigend legitimieren. Ohne Policy ist "RLS an" deny-all — der
-- Fehler faellt dann sofort auf statt Monate spaeter.
drop policy if exists invoices_insert on platform.invoices;

comment on table platform.invoices is
  'Plattform-Rechnungen an Mandanten. Schreibzugriff ausschliesslich ueber service_role (Sprint 116); authenticated darf nur die Rechnungen des eigenen Mandanten lesen.';

commit;
