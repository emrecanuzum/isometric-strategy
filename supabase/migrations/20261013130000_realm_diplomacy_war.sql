-- The layer between kingdoms (CLAUDE.md §9.7): the lobby's market, relations, pacts (tributes, alliances, wars),
-- envoys, spy missions, armies with their delayed orders, battles and each kingdom's inbox of notices. Clients only
-- read; the `command` function writes what players do and the `tick` function (called by pg_cron, see the end) what
-- comes due on its own: envoys arriving, spies caught, orders reaching armies, armies meeting and battles ending.

-- ---- Helpers --------------------------------------------------------------------------------------------------------

-- The player's own kingdom in a lobby.
create function public.my_kingdom(lobby uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select k.id from public.kingdoms k where k.lobby_id = lobby and k.user_id = auth.uid()
$$;
revoke execute on function public.my_kingdom(uuid) from anon, public;
grant execute on function public.my_kingdom(uuid) to authenticated;

-- ---- Market and chat ------------------------------------------------------------------------------------------------

alter table public.lobbies add column market jsonb, add column sim_at timestamptz;
grant select (market) on public.lobbies to authenticated;

alter table public.chat_messages add column username text;

create or replace function public.chat_stamp() returns trigger
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
  new.username := (select p.username from public.profiles p where p.user_id = auth.uid());
  new.body := btrim(new.body);
  new.created_at := now();
  return new;
end $$;

create or replace function public.announce_chat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('id', new.id, 'kingdom_id', new.kingdom_id, 'name', new.name,
    'color', new.color, 'username', new.username, 'body', new.body, 'created_at', new.created_at), 'chat',
    'lobby:' || new.lobby_id, true);
  return null;
end $$;

-- Every kingdom as the others see it: who plays it, where it stands, what it has built, whether it has a queen.
drop function public.lobby_kingdoms(uuid);
create function public.lobby_kingdoms(lobby uuid)
returns table (id bigint, name text, color text, username text, site jsonb, buildings jsonb, queen boolean, version integer)
language sql stable security definer set search_path = '' as $$
  select k.id, k.name, k.color, p.username, k.state -> 'site',
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', b -> 'id', 'kind', b -> 'kind', 'x', b -> 'x', 'y', b -> 'y', 'size', b -> 'size',
      'doneAt', b -> 'doneAt', 'level', b -> 'level', 'broken', b -> 'broken'))
      from jsonb_array_elements(k.state -> 'buildings') b), '[]'),
    coalesce((k.state ->> 'queen')::boolean, false),
    k.version
  from public.kingdoms k left join public.profiles p on p.user_id = k.user_id
  where k.lobby_id = lobby and k.state is not null and public.is_member(lobby)
$$;
revoke execute on function public.lobby_kingdoms(uuid) from anon, public;
grant execute on function public.lobby_kingdoms(uuid) to authenticated;

create function public.announce_lobby() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.market is distinct from old.market then
    perform realtime.send(jsonb_build_object('market', new.market), 'market', 'lobby:' || new.id, true);
  end if;
  return null;
end $$;
create trigger announce_lobby after update on public.lobbies for each row execute function public.announce_lobby();

-- ---- Relations and pacts (public within the lobby) ------------------------------------------------------------------

create table public.relations (
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  a bigint not null references public.kingdoms (id) on delete cascade,
  b bigint not null references public.kingdoms (id) on delete cascade,
  value real not null default 0,
  at timestamptz not null default now(),
  improved_at timestamptz,
  primary key (a, b),
  check (a < b)
);
create index on public.relations (lobby_id);

create table public.pacts (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  kind text not null check (kind in ('tribute', 'alliance', 'war')),
  from_id bigint not null references public.kingdoms (id) on delete cascade,
  to_id bigint not null references public.kingdoms (id) on delete cascade,
  gold real,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by bigint
);
create index on public.pacts (lobby_id) where ended_at is null;

-- ---- Envoys (seen by their two kingdoms; the target once arrived) ---------------------------------------------------

create table public.envoys (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  from_id bigint not null references public.kingdoms (id) on delete cascade,
  to_id bigint not null references public.kingdoms (id) on delete cascade,
  kind text not null check (kind in ('improve', 'gift', 'tribute', 'alliance', 'peace')),
  gold real,
  sent_at timestamptz not null default now(),
  arrive_at timestamptz not null,
  expires_at timestamptz,
  status text not null default 'traveling' check (status in ('traveling', 'pending', 'accepted', 'rejected', 'expired', 'done')),
  resolved_at timestamptz
);
create index on public.envoys (arrive_at) where status = 'traveling';
create index on public.envoys (expires_at) where status = 'pending';
create index on public.envoys (lobby_id);

-- ---- Spy missions (seen by their owner) -----------------------------------------------------------------------------

create table public.spy_missions (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  owner_id bigint not null references public.kingdoms (id) on delete cascade,
  target_id bigint not null references public.kingdoms (id) on delete cascade,
  topic text not null check (topic in ('stores', 'army', 'diplomacy')),
  started_at timestamptz not null default now(),
  -- When it will be caught, drawn at the start (null: never).
  caught_at timestamptz,
  ended_at timestamptz,
  end_reason text
);
create index on public.spy_missions (caught_at) where ended_at is null;
create index on public.spy_missions (lobby_id);

-- ---- Armies, orders and battles -------------------------------------------------------------------------------------

drop table public.battles;
drop table public.events;
drop table public.orders;
drop table public.armies;

create table public.armies (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  kingdom_id bigint not null references public.kingdoms (id) on delete cascade,
  soldiers integer not null check (soldiers >= 0),
  path jsonb not null,
  depart_at timestamptz not null,
  arrive_at timestamptz not null,
  status text not null default 'idle' check (status in ('idle', 'moving', 'battle')),
  goal jsonb not null default '{"kind":"move"}',
  morale real not null default 100,
  familiarity real not null default 0,
  camp jsonb not null,
  -- Seconds spent in reach of enemy watchtowers not yet paid for in soldiers.
  exposure real not null default 0
);
create index on public.armies (lobby_id);

create table public.army_orders (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  army_id bigint not null references public.armies (id) on delete cascade,
  kingdom_id bigint not null references public.kingdoms (id) on delete cascade,
  issued_at timestamptz not null default now(),
  effective_at timestamptz not null,
  payload jsonb not null,
  applied_at timestamptz
);
create index on public.army_orders (effective_at) where applied_at is null;

create table public.battles (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  kind text not null check (kind in ('field', 'siege')),
  x real not null,
  y real not null,
  started_at timestamptz not null,
  ends_at timestamptz not null,
  -- Who fought on each side: [{kingdom, army, soldiers, morale, familiarity}], and the plan (rounds, losses).
  attackers jsonb not null,
  defenders jsonb not null,
  besieged bigint,
  plan jsonb not null,
  seed integer not null,
  resolved boolean not null default false,
  report jsonb
);
create index on public.battles (lobby_id, started_at desc);
create index on public.battles (ends_at) where not resolved;

-- ---- Notices: each kingdom's inbox for the envoy's dialogs ----------------------------------------------------------

create table public.notices (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  kingdom_id bigint not null references public.kingdoms (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  -- Shown from this moment (a battle planned a little ahead starts later).
  show_at timestamptz not null default now(),
  seen boolean not null default false
);
create index on public.notices (kingdom_id, show_at desc);

-- ---- Access ---------------------------------------------------------------------------------------------------------

alter table public.relations enable row level security;
alter table public.pacts enable row level security;
alter table public.envoys enable row level security;
alter table public.spy_missions enable row level security;
alter table public.armies enable row level security;
alter table public.army_orders enable row level security;
alter table public.battles enable row level security;
alter table public.notices enable row level security;

create policy "members see relations" on public.relations for select to authenticated using (public.is_member(lobby_id));
create policy "members see pacts" on public.pacts for select to authenticated using (public.is_member(lobby_id));
create policy "envoys of mine" on public.envoys for select to authenticated using (
  from_id = public.my_kingdom(lobby_id) or (to_id = public.my_kingdom(lobby_id) and status <> 'traveling'));
create policy "my spies" on public.spy_missions for select to authenticated using (owner_id = public.my_kingdom(lobby_id));
create policy "members see battles" on public.battles for select to authenticated using (public.is_member(lobby_id));
create policy "my army orders" on public.army_orders for select to authenticated using (kingdom_id = public.my_kingdom(lobby_id));
create policy "my notices" on public.notices for select to authenticated using (kingdom_id = public.my_kingdom(lobby_id));
create policy "mark my notices seen" on public.notices for update to authenticated using (kingdom_id = public.my_kingdom(lobby_id));

revoke insert, update, delete on public.relations, public.pacts, public.envoys, public.spy_missions, public.armies,
  public.army_orders, public.battles, public.notices from anon, authenticated;
grant update (seen) on public.notices to authenticated;
-- Armies are read through lobby_armies (others' strength is hidden).
revoke select on public.armies from anon, authenticated;

create function public.lobby_armies(lobby uuid)
returns table (id bigint, kingdom_id bigint, soldiers integer, path jsonb, depart_at timestamptz, arrive_at timestamptz,
  status text, goal jsonb, morale real, familiarity real, camp jsonb)
language sql stable security definer set search_path = '' as $$
  select a.id, a.kingdom_id, case when a.kingdom_id = public.my_kingdom(lobby) then a.soldiers end, a.path,
    a.depart_at, a.arrive_at, a.status,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.goal else jsonb_build_object('kind', a.goal ->> 'kind') end,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.morale end,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.familiarity end,
    a.camp
  from public.armies a where a.lobby_id = lobby and public.is_member(lobby)
$$;
revoke execute on function public.lobby_armies(uuid) from anon, public;
grant execute on function public.lobby_armies(uuid) to authenticated;

-- ---- Broadcasts: short notes, the clients fetch what they may see ---------------------------------------------------

create function public.announce_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  row_lobby uuid := coalesce(new.lobby_id, old.lobby_id);
  note jsonb := jsonb_build_object('table', tg_table_name);
begin
  if tg_table_name = 'notices' then note := note || jsonb_build_object('kingdom', new.kingdom_id); end if;
  perform realtime.send(note, 'change', 'lobby:' || row_lobby, true);
  return null;
end $$;

create trigger announce_change after insert or update or delete on public.relations for each row execute function public.announce_change();
create trigger announce_change after insert or update or delete on public.pacts for each row execute function public.announce_change();
create trigger announce_change after insert or update or delete on public.envoys for each row execute function public.announce_change();
create trigger announce_change after insert or update or delete on public.armies for each row execute function public.announce_change();
create trigger announce_change after insert or update or delete on public.battles for each row execute function public.announce_change();
create trigger announce_change after insert on public.notices for each row execute function public.announce_change();

-- ---- The tick: pg_cron calls the `tick` function each minute while something is under way -------------------------

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Where the tick function lives and the secret it expects; filled in by `bun run tick:setup`, never in git.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.tick_config (
  id boolean primary key default true check (id),
  url text not null,
  secret text not null
);

create function public.tick_due() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.envoys where status = 'traveling' and arrive_at <= now())
    or exists (select 1 from public.envoys where status = 'pending' and expires_at <= now())
    or exists (select 1 from public.spy_missions where ended_at is null and caught_at <= now())
    or exists (select 1 from public.army_orders where applied_at is null and effective_at <= now() + interval '90 seconds')
    or exists (select 1 from public.armies where status in ('moving', 'battle'))
    or exists (select 1 from public.armies a where a.goal ->> 'kind' = 'siege')
    or exists (select 1 from public.battles where not resolved)
$$;
revoke execute on function public.tick_due() from anon, authenticated, public;

create function public.maybe_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare c private.tick_config;
begin
  select * into c from private.tick_config;
  if c.url is null or not public.tick_due() then return; end if;
  perform net.http_post(url := c.url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-tick-secret', c.secret),
    body := '{}'::jsonb, timeout_milliseconds := 30000);
end $$;
revoke execute on function public.maybe_tick() from anon, authenticated, public;

select cron.schedule('game-tick', '* * * * *', 'select public.maybe_tick()');
