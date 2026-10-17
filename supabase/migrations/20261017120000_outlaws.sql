-- Bandits on the trade roads and pirate boats on the water (CLAUDE.md §7.9, §8.5). Where they are follows from the
-- lobby's seed and the clock (packages/shared/src/outlaws.ts); only what happened to them is kept, one row per band or
-- boat once anything has (absent: as it was made, at large).
--   kind: 'band' (bandits on a road) or 'boat' (pirates); idx: its number in the lobby (outlaws.ts bandSpots/boatSpots).
--   gen: times beaten (a band comes back a little stronger); down_until: beaten and gone until then (ms).
--   battle: the battle a band is fighting now; shift: how long fights have held it back (ms); losses: soldiers it lost
--   in fights it won since it last came back.
--   battles.kind 'outlaw': a lord's army against a band of bandits.

create table if not exists public.lobby_outlaws (
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  kind text not null check (kind in ('band', 'boat')),
  idx integer not null,
  gen integer not null default 0,
  down_until bigint,
  battle bigint,
  shift bigint not null default 0,
  losses integer not null default 0,
  primary key (lobby_id, kind, idx)
);

alter table public.lobby_outlaws enable row level security;
drop policy if exists "members see outlaws" on public.lobby_outlaws;
create policy "members see outlaws" on public.lobby_outlaws for select to authenticated using (public.is_member(lobby_id));
revoke insert, update, delete on public.lobby_outlaws from anon, authenticated;

drop trigger if exists announce_change on public.lobby_outlaws;
create trigger announce_change after insert or update or delete on public.lobby_outlaws
  for each row execute function public.announce_change();

alter table public.battles drop constraint if exists battles_kind_check;
alter table public.battles add constraint battles_kind_check check (kind in ('field', 'siege', 'revolt', 'pretender', 'usurp', 'outlaw'));

-- The minute's tick (as in 20261017100000_house_intrigue, keeping its pretender and camp conditions) also runs while a band or boat is down and due back, a band is in a fight,
-- an army or fleet is chasing one, or a lord's share of the bandits' and pirates' hold has not been worked out yet.
create or replace function public.tick_due() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.envoys where status = 'traveling' and arrive_at <= now())
    or exists (select 1 from public.envoys where status = 'pending' and expires_at <= now())
    or exists (select 1 from public.spy_missions where ended_at is null and caught_at <= now())
    or exists (select 1 from public.army_orders where applied_at is null and effective_at <= now() + interval '90 seconds')
    or exists (select 1 from public.armies where status in ('moving', 'battle'))
    or exists (select 1 from public.armies a where a.goal ->> 'kind' in ('siege', 'town', 'camp', 'chase'))
    or exists (select 1 from public.battles where not resolved)
    or exists (select 1 from public.lobby_towns where siege is not null)
    or exists (select 1 from public.lobby_towns t join public.lobbies l on l.id = t.lobby_id
               where l.season_end > now() and t.owner_id is not null)
    or exists (select 1 from public.kingdoms k join public.lobbies l on l.id = k.lobby_id
               where l.season_end > now() and k.state ? 'liege')
    or exists (select 1 from public.kingdoms k join public.lobbies l on l.id = k.lobby_id
               where l.season_end > now() and (
                 k.state ? 'pretender'
                 or jsonb_array_length(coalesce(k.state -> 'dynasty' -> 'siblings', '[]'::jsonb)) > 0))
    or exists (select 1 from public.kingdoms k join public.lobbies l on l.id = k.lobby_id
               where l.season_end > now() and (
                 jsonb_typeof(k.state -> 'blockade') = 'object'
                 or exists (select 1 from jsonb_array_elements(coalesce(k.state -> 'navy' -> 'fleets', '[]')) f
                            where f -> 'mission' ->> 'kind' in ('blockade', 'raid', 'sortie') or f ? 'chase')))
    or exists (select 1 from public.pacts p join public.lobbies l on l.id = p.lobby_id
               where l.season_end > now() and p.kind = 'tribute' and p.ended_at is null)
    or exists (select 1 from public.lobby_outlaws o join public.lobbies l on l.id = o.lobby_id
               where l.season_end > now() and (o.battle is not null
                 or (o.down_until is not null and o.down_until > (extract(epoch from now()) * 1000)::bigint - 180000)))
    or exists (select 1 from public.kingdoms k join public.lobbies l on l.id = k.lobby_id
               where l.season_end > now() and k.state is not null and not (k.state ? 'outlaws'))
$$;
revoke execute on function public.tick_due() from anon, authenticated, public;
