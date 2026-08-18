-- ============================================================================
-- Eigentümerportal — Selbst-Lesezugriff auf den eigenen owners-Datensatz
-- ============================================================================
-- Nachtrag zu 20260817130000_owner_portal.sql. Dort kamen die *_owner-Policies
-- auf die Objekt-, Auftrags- und Belegtabellen — aber NICHT auf `owners`
-- selbst. Ohne Selbst-Lese-Policy sieht ein reiner Portal-Eigentümer seinen
-- eigenen owners-Datensatz nicht (owners_select verlangt is_tenant_member +
-- owners.view — beides hat ein externer Eigentümer nicht), und
-- getOwnerContext() liefert dauerhaft null: das Portal-Login wäre unmöglich.
--
-- Beim Bewohnerportal ist derselbe Pfad direkt in residents_select
-- einge-ODER-t: "... OR (user_id = (select auth.uid()))". Wir bleiben bei der
-- additiven Strategie und legen die Sicht als eigene permissive Policy dazu,
-- statt die funktionierende owners_select anzufassen.
-- ============================================================================

create policy owners_select_own on public.owners
  for select to authenticated
  using (
    deleted_at is null
    and user_id = (select auth.uid())
  );
