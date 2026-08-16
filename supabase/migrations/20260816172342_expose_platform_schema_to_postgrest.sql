-- Sprint 137 · Das `platform`-Schema für PostgREST sichtbar machen.
--
-- Bis heute war es das nicht, und das war kein Schönheitsfehler: JEDE
-- Abfrage über createPlatformServiceClient() bekam
--
--   PGRST106 — Invalid schema: platform.
--   Only the following schemas are exposed: public, graphql_public
--
-- Gemessene Folgen in der Produktiv-Datenbank am 16.08.2026:
--
--   * requirePlatformAdmin() liest platform.admins über unwrapMaybeRow und
--     wirft deshalb. /platform, /platform/tenants, /platform/payments waren
--     für den Betreiber allesamt Fehlerseiten — seine komplette Verwaltung.
--   * /preise zeigte "Die Tarife lassen sich gerade nicht laden", obwohl
--     alle drei Tarife in der Tabelle stehen.
--   * ensure-tenant.ts schlägt den im Signup gewählten Tarif in
--     platform.subscription_plans nach. Der Fehler wurde dort bewusst nicht
--     geworfen (der Mandant existiert an der Stelle schon), sondern an
--     Sentry gemeldet — die Tarifwahl ging still verloren. Nachweis:
--     "Firma ABC" hat am 16.08. `starter/monthly` gewählt, der Wunsch steht
--     im user_metadata, tenants.subscription_plan_id ist null.
--
-- Warum das hier als Migration steht und nicht als Klick im Supabase-
-- Dashboard unter "Exposed schemas": ein Klick hinterlässt keine Spur im
-- Repo. Task #556 stand genau deshalb wochenlang offen — die Anweisung
-- existierte, aber nichts im Projekt konnte prüfen, ob sie je ausgeführt
-- wurde. Als Migration ist der Zustand ablesbar und reproduzierbar, auch
-- für eine neue Supabase-Instanz.
--
-- Zwei getrennte Caches, beide müssen angestoßen werden — die Reihenfolge
-- der Fehlermeldungen hat das bewiesen: nach 'reload config' allein kam
-- PGRST205 ("not found in schema cache") statt PGRST106, das Schema war
-- also bekannt, seine Tabellen aber noch nicht.
--
-- Idempotent: ALTER ROLE ... SET überschreibt, NOTIFY ist zustandslos.
-- Rückgängig mit: alter role authenticator reset pgrst.db_schemas;

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, platform';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
