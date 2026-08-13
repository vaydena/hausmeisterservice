-- Sprint 26: MFA-Recovery-Codes.
--
-- Supabase Auth hat KEINE nativen Recovery-Codes fuer MFA — wenn ein User
-- sein Handy verliert und keinen zweiten TOTP-Faktor registriert hat, ist
-- der Account ohne Admin-Eingriff unbrauchbar. Diese Migration liefert den
-- Escape-Hatch: 10 einmalige Codes pro User, generiert im Konto-Bereich
-- (Klartext EINMAL beim Generieren sichtbar), bcrypt-gehashed in der DB.
-- Beim Login-MFA-Prompt kann der User alternativ einen Code eingeben; die
-- consume-Function markiert ihn als used und die aufrufende Server-Action
-- entfernt ALLE MFA-Faktoren des Users (Session faellt damit auf aal1
-- zurueck, User muss direkt danach MFA neu einrichten).
--
-- Bcrypt via pgcrypto (bereits in Supabase enabled) — der Rate-Limit
-- (mfa-recovery: 5/15min per IP) ist der eigentliche Schutz gegen Online-
-- Brute-Force; bcrypt kostet zusaetzlich CPU, falls der DB-Dump je in
-- fremde Haende faellt.

create extension if not exists pgcrypto;

create table if not exists public.auth_mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),

  -- Owner. on delete cascade: wenn der User geloescht wird, verschwinden
  -- die Codes mit. auth.users ist die Supabase-verwaltete User-Tabelle.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- bcrypt-Hash (crypt(plaintext, gen_salt('bf'))). Klartext ist NIE in
  -- der DB — nur der TS-Layer sieht die Codes im Moment der Generierung
  -- und gibt sie einmalig an den User zurueck.
  code_hash text not null,

  -- Wann der Batch generiert wurde. Ein User kann jederzeit neu generieren
  -- (loescht alle alten Codes vorher).
  generated_at timestamptz not null default now(),

  -- Wann der Code eingeloest wurde. null = noch verwendbar.
  used_at timestamptz,

  -- IP-Adresse (best-effort) beim Einloesen — fuer Forensik, falls ein
  -- User einen "unerwarteten" used_at bemerkt.
  used_ip text
);

comment on table public.auth_mfa_recovery_codes is
  'Einmalige MFA-Recovery-Codes pro User. Sprint 26. bcrypt-gehashed, RLS deny-all, Zugriff ausschliesslich ueber die drei SECURITY DEFINER Functions generate_mfa_recovery_codes_for_user / consume_mfa_recovery_code / count_unused_mfa_recovery_codes. Beim Einloesen (consume_*) entfernt die aufrufende Server-Action ausserdem alle MFA-Faktoren des Users, damit aal2 wegfaellt und ein neuer Faktor eingerichtet werden kann.';

-- Ein User hat max 10 Zeilen — trotzdem ein Index auf user_id, damit die
-- consume-Function nicht per Seq-Scan ueber die ganze Tabelle geht (mit
-- 1000+ Usern waeren das im schlechten Fall 10.000 Zeilen).
create index if not exists auth_mfa_recovery_codes_user_id_idx
  on public.auth_mfa_recovery_codes(user_id);

-- RLS: dicht. Kein authenticated/anon-Zugriff. Die Functions unten sind
-- SECURITY DEFINER und laufen als Owner (bypassing RLS); execute-Grant
-- ausschliesslich an service_role.
alter table public.auth_mfa_recovery_codes enable row level security;

-- ---------------------------------------------------------------------------
-- generate_mfa_recovery_codes_for_user(user_id, plaintext_codes[])
--
-- Loescht alle alten Codes des Users und legt fuer jeden uebergebenen
-- Klartext einen bcrypt-gehashten Eintrag an. Der Aufrufer generiert die
-- Klartext-Codes in TS (via crypto.randomBytes) — der Grund fuer die
-- Trennung: TS hat besseren Zufall und kann die Codes formatieren, SQL
-- hat pgcrypto fuer den bcrypt-Hash.
--
-- Idempotent im Sinne: mehrfacher Aufruf loescht immer alle vorhandenen
-- Codes und legt einen frischen Batch an. Das ist Absicht — "regenerate"
-- ist der einzige Weg, alte Codes zu invalidieren.
-- ---------------------------------------------------------------------------
create or replace function public.generate_mfa_recovery_codes_for_user(
  p_user_id uuid,
  p_plaintext_codes text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if p_plaintext_codes is null or array_length(p_plaintext_codes, 1) is null then
    raise exception 'p_plaintext_codes must be a non-empty array';
  end if;

  delete from public.auth_mfa_recovery_codes where user_id = p_user_id;

  foreach v_code in array p_plaintext_codes loop
    insert into public.auth_mfa_recovery_codes (user_id, code_hash)
    values (p_user_id, crypt(v_code, gen_salt('bf', 10)));
  end loop;
end;
$$;

comment on function public.generate_mfa_recovery_codes_for_user is
  'Ersetzt alle MFA-Recovery-Codes eines Users durch einen frisch gehashten Batch. Klartext-Codes werden vom Aufrufer (TS-Server-Action) generiert und danach einmalig dem User angezeigt.';

-- ---------------------------------------------------------------------------
-- consume_mfa_recovery_code(user_id, plaintext, used_ip) -> boolean
--
-- Sucht einen unused Code des Users, dessen bcrypt-Hash zum Klartext
-- passt (crypt(plaintext, code_hash) = code_hash — der pgcrypto-Trick).
-- Bei Match wird used_at + used_ip gesetzt und true zurueckgegeben.
-- Kein Match: false.
--
-- Der Aufrufer (Server-Action /login/mfa/recovery) entfernt bei true=TRUE
-- ausserdem alle MFA-Faktoren des Users via supabase.auth.admin.mfa.*,
-- damit die aal2-Anforderung wegfaellt und der User weiterkann.
-- ---------------------------------------------------------------------------
create or replace function public.consume_mfa_recovery_code(
  p_user_id uuid,
  p_plaintext text,
  p_used_ip text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matched_id uuid;
begin
  select id into v_matched_id
  from public.auth_mfa_recovery_codes
  where user_id = p_user_id
    and used_at is null
    and code_hash = crypt(p_plaintext, code_hash)
  limit 1
  for update;

  if v_matched_id is null then
    return false;
  end if;

  update public.auth_mfa_recovery_codes
  set used_at = now(),
      used_ip = p_used_ip
  where id = v_matched_id;

  return true;
end;
$$;

comment on function public.consume_mfa_recovery_code is
  'Verifiziert einen MFA-Recovery-Code und markiert ihn als eingeloest. Rueckgabe: true bei Match. Der Aufrufer muss bei Erfolg alle MFA-Faktoren des Users entfernen (aal2-Downgrade), damit der User weiterkann.';

-- ---------------------------------------------------------------------------
-- count_unused_mfa_recovery_codes(user_id) -> integer
--
-- Wie viele unused Codes hat der User noch? Fuer die Konto-UI, damit der
-- User weiss ob er neu generieren sollte (empfohlen bei <= 2).
-- ---------------------------------------------------------------------------
create or replace function public.count_unused_mfa_recovery_codes(
  p_user_id uuid
) returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer from public.auth_mfa_recovery_codes
  where user_id = p_user_id and used_at is null;
$$;

comment on function public.count_unused_mfa_recovery_codes is
  'Anzahl noch nicht eingeloester MFA-Recovery-Codes eines Users. Fuer die Konto-UI.';

-- Grants: nur service_role darf die Functions aufrufen.
revoke all on function public.generate_mfa_recovery_codes_for_user(uuid, text[]) from public;
revoke all on function public.consume_mfa_recovery_code(uuid, text, text) from public;
revoke all on function public.count_unused_mfa_recovery_codes(uuid) from public;

grant execute on function public.generate_mfa_recovery_codes_for_user(uuid, text[]) to service_role;
grant execute on function public.consume_mfa_recovery_code(uuid, text, text) to service_role;
grant execute on function public.count_unused_mfa_recovery_codes(uuid) to service_role;

-- Lockdown gegen den automatischen anon/authenticated-EXECUTE-Grant, den
-- Postgres/Supabase neuen public-Functions verpasst (siehe Sprint 21).
revoke execute on function public.generate_mfa_recovery_codes_for_user(uuid, text[]) from anon, authenticated;
revoke execute on function public.consume_mfa_recovery_code(uuid, text, text) from anon, authenticated;
revoke execute on function public.count_unused_mfa_recovery_codes(uuid) from anon, authenticated;
