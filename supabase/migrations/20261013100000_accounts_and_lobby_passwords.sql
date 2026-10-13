-- Accounts (email + password), each with a profile that keeps the player's name and settings, and lobbies that
-- players open themselves, optionally behind a password.

-- ---- Profiles -------------------------------------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[[:alnum:]_.\- ]{3,20}$'),
  -- Per-player settings (music etc.); see apps/web/src/net/settings.ts.
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Every new account gets its profile, named as given at sign-up (or after the email's first part).
create function public.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  wanted text := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1));
  name text := left(regexp_replace(wanted, '[^[:alnum:]_.\- ]', '', 'g'), 20);
begin
  if char_length(name) < 3 then name := 'oyuncu'; end if;
  -- A taken name gets a number.
  while exists (select 1 from public.profiles p where lower(p.username) = lower(name)) loop
    name := left(name, 15) || floor(random() * 10000)::int;
  end loop;
  insert into public.profiles (user_id, username) values (new.id, name);
  return new;
end $$;
create trigger create_profile after insert on auth.users for each row execute function public.create_profile();

alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "own settings" on public.profiles for update to authenticated using (user_id = (select auth.uid()));
revoke insert, delete, update on public.profiles from anon, authenticated;
grant update (settings) on public.profiles to authenticated;

-- ---- Lobbies opened by players, with an optional password ----------------------------------------------------------

alter table public.lobbies
  add column created_by uuid references auth.users (id) on delete set null,
  add column password_hash text,
  add column has_password boolean generated always as (password_hash is not null) stored;

-- The hash never leaves the database: clients read every other column.
revoke select on public.lobbies from anon, authenticated;
grant select (id, name, seed, is_public, max_players, season_start, season_end, created_at, created_by, has_password)
  on public.lobbies to authenticated;

drop policy "lobbies are listed" on public.lobbies;
create policy "lobbies are listed" on public.lobbies for select to authenticated using (true);

-- The lobby browser: open lobbies with how full they are, who opened them and whether the player is in already.
create function public.list_lobbies()
returns table (id uuid, name text, max_players integer, season_start timestamptz, season_end timestamptz,
  has_password boolean, players integer, owner text, joined boolean)
language sql stable security definer set search_path = '' as $$
  select l.id, l.name, l.max_players, l.season_start, l.season_end, l.has_password,
    (select count(*)::int from public.kingdoms k where k.lobby_id = l.id),
    (select p.username from public.profiles p where p.user_id = l.created_by),
    exists (select 1 from public.kingdoms k where k.lobby_id = l.id and k.user_id = auth.uid())
  from public.lobbies l
  where l.season_end > now() and auth.uid() is not null
  order by 9 desc, l.created_at desc
$$;
revoke execute on function public.list_lobbies() from anon, public;
grant execute on function public.list_lobbies() to authenticated;

-- Used by the `command` Edge Function (service role) only.
create function public.open_lobby(owner uuid, lobby_name text, lobby_seed integer, players integer, password text)
returns uuid
language sql volatile security definer set search_path = '' as $$
  insert into public.lobbies (name, seed, max_players, created_by, password_hash)
  values (lobby_name, lobby_seed, players, owner,
    case when coalesce(password, '') = '' then null else extensions.crypt(password, extensions.gen_salt('bf')) end)
  returning id
$$;

create function public.lobby_password_ok(lobby uuid, password text) returns boolean
language sql stable security definer set search_path = '' as $$
  select l.password_hash is null or l.password_hash = extensions.crypt(coalesce(password, ''), l.password_hash)
  from public.lobbies l where l.id = lobby
$$;

revoke execute on function public.open_lobby(uuid, text, integer, integer, text) from anon, authenticated, public;
revoke execute on function public.lobby_password_ok(uuid, text) from anon, authenticated, public;
grant execute on function public.open_lobby(uuid, text, integer, integer, text) to service_role;
grant execute on function public.lobby_password_ok(uuid, text) to service_role;

-- Functions created earlier are callable by anyone with the publishable key unless revoked.
revoke execute on function public.is_member(uuid) from anon, public;
grant execute on function public.is_member(uuid) to authenticated;
revoke execute on function public.server_now() from public;
