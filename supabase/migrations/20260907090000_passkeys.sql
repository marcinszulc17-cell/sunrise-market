-- 2026-09-07: logowanie Face ID / Touch ID (WebAuthn passkeys) — decyzja właściciela (bez Google: konto jest powiązane z MySunrise).
-- Passkey jest dodatkowym sposobem wejścia do TEGO SAMEGO konta Sunrise (auth.users) — rejestracja po zalogowaniu hasłem,
-- logowanie: edge fn `passkey` weryfikuje asercję i wydaje sesję (magiclink token_hash → supabase.auth.verifyOtp).
create table if not exists market.passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,               -- base64url (COSE)
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_type text,                       -- singleDevice | multiDevice
  backed_up boolean not null default false,
  device_name text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists passkeys_user_idx on market.passkeys(user_id);
alter table market.passkeys enable row level security;
drop policy if exists passkeys_own_select on market.passkeys;
create policy passkeys_own_select on market.passkeys for select to authenticated using (user_id = auth.uid());
drop policy if exists passkeys_own_delete on market.passkeys;
create policy passkeys_own_delete on market.passkeys for delete to authenticated using (user_id = auth.uid());
grant select, delete on table market.passkeys to authenticated;
grant all on table market.passkeys to service_role;

-- Wyzwania (challenge) — krótkotrwałe, tylko service_role
create table if not exists market.passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('register','login')),
  user_id uuid,
  challenge text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes'
);
alter table market.passkey_challenges enable row level security;
revoke all on table market.passkey_challenges from anon, authenticated;
grant all on table market.passkey_challenges to service_role;

-- Lista passkeys użytkownika (bez klucza publicznego)
create or replace function market.my_passkeys()
returns table(id uuid, device_name text, device_type text, backed_up boolean, created_at timestamptz, last_used_at timestamptz)
language sql security definer set search_path to '' stable as $$
  select p.id, p.device_name, p.device_type, p.backed_up, p.created_at, p.last_used_at
  from market.passkeys p where p.user_id = auth.uid() order by p.created_at desc;
$$;
revoke all on function market.my_passkeys() from public, anon;
grant execute on function market.my_passkeys() to authenticated, service_role;

create or replace function market.delete_passkey(p_id uuid)
returns boolean language plpgsql security definer set search_path to '' as $$
begin
  delete from market.passkeys where id = p_id and user_id = auth.uid();
  return found;
end $$;
revoke all on function market.delete_passkey(uuid) from public, anon;
grant execute on function market.delete_passkey(uuid) to authenticated, service_role;

-- Klucze dla e-maila (tylko service_role — login_options w edge fn `passkey`)
create or replace function market.passkeys_for_email(p_email text)
returns table(credential_id text, transports text[])
language sql security definer set search_path to '' stable as $$
  select p.credential_id, p.transports from market.passkeys p join auth.users u on u.id = p.user_id
  where lower(u.email) = lower(trim(p_email));
$$;
revoke all on function market.passkeys_for_email(text) from public, anon, authenticated;
grant execute on function market.passkeys_for_email(text) to service_role;
