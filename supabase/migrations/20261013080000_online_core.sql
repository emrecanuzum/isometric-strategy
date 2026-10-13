-- Online lobbies (CLAUDE.md §11.1). The server keeps time, not progress: a kingdom's economy is one JSON document
-- settled lazily by the `command` Edge Function, so nothing is written while players are away. Every change is
-- announced on the lobby's Realtime broadcast topic straight from the database.

-- ---- Lobbies --------------------------------------------------------------------------------------------------------

create table public.lobbies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  seed integer not null,
  is_public boolean not null default true,
  max_players integer not null default 10 check (max_players between 2 and 20),
  season_start timestamptz not null default now(),
  season_end timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

-- What the server needs of the world to check commands (terrain and feature per tile, gzipped). Clients build the
-- world from the seed themselves, so this is never sent to them.
create table public.lobby_worlds (
  lobby_id uuid primary key references public.lobbies (id) on delete cascade,
  size integer not null,
  tiles bytea not null
);

-- ---- Kingdoms -------------------------------------------------------------------------------------------------------

-- One per player and lobby. Before founding it holds the sites the player has been shown (at most
-- balance.economy.siteRolls); afterwards `state` is the economy document (packages/shared/src/economy.ts Kingdom).
create table public.kingdoms (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text check (char_length(name) between 1 and 32),
  color text,
  sites jsonb not null default '[]',
  state jsonb,
  version integer not null default 0,
  founded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (lobby_id, user_id)
);
create index on public.kingdoms (user_id);

create function public.is_member(lobby uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.kingdoms k where k.lobby_id = lobby and k.user_id = auth.uid())
$$;

-- What every member sees of the other kingdoms: where they stand and what they have built, never their stores.
create function public.lobby_kingdoms(lobby uuid)
returns table (id bigint, name text, color text, site jsonb, buildings jsonb, version integer)
language sql stable security definer set search_path = '' as $$
  select k.id, k.name, k.color, k.state -> 'site',
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', b -> 'id', 'kind', b -> 'kind', 'x', b -> 'x', 'y', b -> 'y', 'size', b -> 'size',
      'doneAt', b -> 'doneAt', 'level', b -> 'level'))
      from jsonb_array_elements(k.state -> 'buildings') b), '[]'),
    k.version
  from public.kingdoms k
  where k.lobby_id = lobby and k.state is not null and public.is_member(lobby)
$$;

-- The clock every client sets itself by (milliseconds since the epoch).
create function public.server_now() returns bigint
language sql volatile as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

-- ---- Chat -----------------------------------------------------------------------------------------------------------

-- Kept for the season. Each message carries the kingdom's name and colour as they were when it was written.
create table public.chat_messages (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  kingdom_id bigint not null references public.kingdoms (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  color text,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);
create index on public.chat_messages (lobby_id, id desc);

create function public.chat_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k public.kingdoms;
begin
  select * into k from public.kingdoms where id = new.kingdom_id;
  if k.user_id is distinct from auth.uid() or k.lobby_id <> new.lobby_id or k.state is null then
    raise exception 'not your kingdom';
  end if;
  if exists (select 1 from public.chat_messages m
             where m.kingdom_id = new.kingdom_id and m.created_at > now() - interval '1 second') then
    raise exception 'too fast';
  end if;
  new.user_id := auth.uid();
  new.name := k.name;
  new.color := k.color;
  new.body := btrim(new.body);
  new.created_at := now();
  return new;
end $$;
create trigger chat_stamp before insert on public.chat_messages for each row execute function public.chat_stamp();

-- ---- Broadcasts -----------------------------------------------------------------------------------------------------

-- Small notes on topic `lobby:<id>`: a kingdom changed (fetch it again if it matters), or a chat message.
create function public.announce_kingdom() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.state is not null then
    perform realtime.send(jsonb_build_object('id', new.id, 'version', new.version), 'kingdom',
      'lobby:' || new.lobby_id, false);
  end if;
  return null;
end $$;
create trigger announce_kingdom after insert or update on public.kingdoms
  for each row execute function public.announce_kingdom();

create function public.announce_chat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('id', new.id, 'kingdom_id', new.kingdom_id, 'name', new.name,
    'color', new.color, 'body', new.body, 'created_at', new.created_at), 'chat', 'lobby:' || new.lobby_id, false);
  return null;
end $$;
create trigger announce_chat after insert on public.chat_messages
  for each row execute function public.announce_chat();

-- ---- Later phases (CLAUDE.md §8, §11.1): armies, envoy orders, timed events, battles, daily history ----------------

create table public.armies (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  kingdom_id bigint not null references public.kingdoms (id) on delete cascade,
  units jsonb not null default '{}',
  -- The route as tile points; the position is computed from the times, never stored.
  path jsonb not null default '[]',
  depart_at timestamptz,
  arrive_at timestamptz,
  status text not null default 'garrison'
);
create index on public.armies (lobby_id);

create table public.orders (
  id bigint generated always as identity primary key,
  army_id bigint not null references public.armies (id) on delete cascade,
  issued_at timestamptz not null default now(),
  effective_at timestamptz not null,
  payload jsonb not null,
  applied boolean not null default false
);
create index on public.orders (effective_at) where not applied;

create table public.events (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  kind text not null,
  resolve_at timestamptz not null,
  payload jsonb not null default '{}',
  resolved boolean not null default false
);
create index on public.events (resolve_at) where not resolved;

create table public.battles (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  event_id bigint references public.events (id) on delete set null,
  fought_at timestamptz not null,
  seed integer not null,
  report jsonb not null
);
create index on public.battles (lobby_id, fought_at desc);

create table public.kingdom_daily (
  kingdom_id bigint not null references public.kingdoms (id) on delete cascade,
  day integer not null,
  stats jsonb not null,
  primary key (kingdom_id, day)
);

-- ---- Access ---------------------------------------------------------------------------------------------------------
-- Clients read; everything that changes the game goes through the `command` Edge Function (service role). The only
-- direct write is posting to the chat.

alter table public.lobbies enable row level security;
alter table public.lobby_worlds enable row level security;
alter table public.kingdoms enable row level security;
alter table public.chat_messages enable row level security;
alter table public.armies enable row level security;
alter table public.orders enable row level security;
alter table public.events enable row level security;
alter table public.battles enable row level security;
alter table public.kingdom_daily enable row level security;

create policy "lobbies are listed" on public.lobbies for select to authenticated
  using (is_public or public.is_member(id));
create policy "own kingdom" on public.kingdoms for select to authenticated
  using (user_id = (select auth.uid()));
create policy "members read the chat" on public.chat_messages for select to authenticated
  using (public.is_member(lobby_id));
create policy "members post" on public.chat_messages for insert to authenticated
  with check (public.is_member(lobby_id));
create policy "members see armies" on public.armies for select to authenticated
  using (public.is_member(lobby_id));
create policy "members see battles" on public.battles for select to authenticated
  using (public.is_member(lobby_id));

revoke all on public.lobby_worlds from anon, authenticated;
revoke insert, update, delete on public.lobbies, public.kingdoms, public.armies, public.orders, public.events,
  public.battles, public.kingdom_daily from anon, authenticated;
revoke update, delete on public.chat_messages from anon, authenticated;
revoke execute on function public.lobby_kingdoms(uuid) from anon, public;
grant execute on function public.lobby_kingdoms(uuid) to authenticated;
grant execute on function public.server_now() to anon, authenticated;
