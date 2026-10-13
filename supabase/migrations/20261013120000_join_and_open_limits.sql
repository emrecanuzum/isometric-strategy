-- Joining and opening lobbies are checked and written in one locked step, so simultaneous requests cannot pass a
-- limit together: a lobby never holds more kingdoms than its places, a player never has more than 3 open lobbies,
-- and a lobby password can only be guessed a few times.

create table public.lobby_join_failures (
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  failed_at timestamptz not null default now()
);
create index on public.lobby_join_failures (user_id, failed_at);
alter table public.lobby_join_failures enable row level security;
revoke all on public.lobby_join_failures from anon, authenticated;

-- Returns 'ok' (joined, or already in), or why not: 'lobby', 'tries', 'password', 'full'.
create function public.join_lobby(lobby uuid, player uuid, first_site jsonb, password text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare l public.lobbies;
begin
  -- One join at a time per lobby.
  select * into l from public.lobbies where id = lobby for update;
  if l.id is null or l.season_end < now() then return 'lobby'; end if;
  if exists (select 1 from public.kingdoms k where k.lobby_id = lobby and k.user_id = player) then return 'ok'; end if;
  if l.password_hash is not null then
    if (select count(*) from public.lobby_join_failures f
        where f.user_id = player and f.failed_at > now() - interval '10 minutes') >= 5 then
      return 'tries';
    end if;
    if l.password_hash <> extensions.crypt(coalesce(password, ''), l.password_hash) then
      insert into public.lobby_join_failures (lobby_id, user_id) values (lobby, player);
      return 'password';
    end if;
  end if;
  if (select count(*) from public.kingdoms k where k.lobby_id = lobby) >= l.max_players then return 'full'; end if;
  insert into public.kingdoms (lobby_id, user_id, sites) values (lobby, player, jsonb_build_array(first_site));
  return 'ok';
end $$;

-- As before, but the open-lobby limit is counted under a per-player lock.
create or replace function public.open_lobby(owner uuid, lobby_name text, lobby_seed integer, players integer, password text)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 0));
  if (select count(*) from public.lobbies l where l.created_by = owner and l.season_end > now()) >= 3 then
    raise exception 'lobbies' using errcode = 'P0001';
  end if;
  insert into public.lobbies (name, seed, max_players, created_by, password_hash)
  values (lobby_name, lobby_seed, players, owner,
    case when coalesce(password, '') = '' then null else extensions.crypt(password, extensions.gen_salt('bf')) end)
  returning lobbies.id into id;
  return id;
end $$;

revoke execute on function public.join_lobby(uuid, uuid, jsonb, text) from anon, authenticated, public;
grant execute on function public.join_lobby(uuid, uuid, jsonb, text) to service_role;
revoke execute on function public.open_lobby(uuid, text, integer, integer, text) from anon, authenticated, public;
grant execute on function public.open_lobby(uuid, text, integer, integer, text) to service_role;
drop function public.lobby_password_ok(uuid, text);
