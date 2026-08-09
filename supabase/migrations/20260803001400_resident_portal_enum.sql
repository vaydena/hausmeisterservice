-- =============================================================================
-- Bewohner-Portal (Teil 1): Enum-Erweiterungen
-- =============================================================================
-- Neue Werte im announcement_target_type müssen zuerst committed werden, bevor
-- sie in check-Constraints / Policies benutzt werden können.
-- =============================================================================

alter type public.announcement_target_type add value if not exists 'residents';
alter type public.announcement_target_type add value if not exists 'property';
