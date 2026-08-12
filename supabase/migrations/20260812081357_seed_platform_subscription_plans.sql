-- Sprint 10.3 · Seed 3 Basis-Preispläne (Starter / Business / Enterprise)
--
-- Idempotent via ON CONFLICT — Preise/Features/Limits werden bei jedem Push
-- aus dieser Datei überschrieben. Für Anpassungen "per Kunde" oder Ad-hoc
-- benutzt der Betreiber /platform/plans (schreibt in dieselbe Tabelle).
--
-- Feature-Flags (jsonb):
--   gps         — GPS-Tracking + Touren
--   portal      — Bewohner-/Eigentümer-Portal
--   vehicles    — Fuhrpark
--   automations — Automatisierungs-Regeln
--   api         — Öffentliche API (kommt später)

insert into platform.subscription_plans
  (code, name, description, monthly_price_cents, yearly_price_cents,
   max_employees, max_properties, features, sort_order, is_public)
values
  ('starter',
   'Starter',
   'Für kleine Hausmeisterbetriebe bis 5 Mitarbeiter.',
   4900, 49000,
   5, 20,
   '{"gps":false,"portal":false,"vehicles":false,"automations":false,"api":false}'::jsonb,
   10, true),
  ('business',
   'Business',
   'Für wachsende Agenturen mit GPS-Touren, Bewohnerportal und Fuhrpark.',
   14900, 149000,
   25, 100,
   '{"gps":true,"portal":true,"vehicles":true,"automations":false,"api":false}'::jsonb,
   20, true),
  ('enterprise',
   'Enterprise',
   'Für große Betriebe mit vollem Funktionsumfang und API-Zugang.',
   34900, 349000,
   null, null,
   '{"gps":true,"portal":true,"vehicles":true,"automations":true,"api":true}'::jsonb,
   30, true)
on conflict (code) do update set
  name                = excluded.name,
  description         = excluded.description,
  monthly_price_cents = excluded.monthly_price_cents,
  yearly_price_cents  = excluded.yearly_price_cents,
  max_employees       = excluded.max_employees,
  max_properties      = excluded.max_properties,
  features            = excluded.features,
  sort_order          = excluded.sort_order,
  is_public           = excluded.is_public,
  updated_at          = now();
