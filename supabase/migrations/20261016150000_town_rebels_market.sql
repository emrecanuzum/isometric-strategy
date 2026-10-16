-- Towns rise with rebels at their gates and sell a good of their own to the armies that come to buy (CLAUDE.md §8.4).
--   lobby_towns.rebels: the rebels camped at a held town in revolt, {count, since, battle} (ms); null when none.
--   lobby_towns.market_stock / market_at: the town market's stock left after the last sale and when that was (ms);
--     null while nothing was ever sold (full). The stock in between is worked out from the time.
--   armies.cargo: goods bought at a town, {food, materials, arms}, delivered when the army comes home.
--   battles.kind 'revolt': a lord's army against the rebels of his own town.

alter table public.lobby_towns add column if not exists rebels jsonb;
alter table public.lobby_towns add column if not exists market_stock double precision;
alter table public.lobby_towns add column if not exists market_at bigint;

alter table public.armies add column if not exists cargo jsonb;

alter table public.battles drop constraint if exists battles_kind_check;
alter table public.battles add constraint battles_kind_check check (kind in ('field', 'siege', 'revolt'));

-- The army list as before (with the king at its head, 20261016130000), with the cargo of the player's own armies (others see none).
drop function public.lobby_armies(uuid);
create function public.lobby_armies(lobby uuid)
returns table (id bigint, kingdom_id bigint, soldiers integer, units jsonb, path jsonb, depart_at timestamptz,
  arrive_at timestamptz, status text, goal jsonb, morale real, familiarity real, camp jsonb, figures integer, catapults boolean,
  contact_until timestamptz, led_by integer, royal boolean, cargo jsonb)
language sql stable security definer set search_path = '' as $$
  select a.id, a.kingdom_id,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.soldiers end,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.units end,
    a.path, a.depart_at, a.arrive_at, a.status,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.goal else jsonb_build_object('kind', a.goal ->> 'kind') end,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.morale end,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.familiarity end,
    a.camp,
    least(20, greatest(2, ceil(a.soldiers / 2.0)))::integer,
    coalesce((a.units ->> 'catapult')::int, 0) > 0,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.contact_until end,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.led_by end,
    a.led_by is not null,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.cargo end
  from public.armies a where a.lobby_id = lobby and public.is_member(lobby)
$$;
revoke execute on function public.lobby_armies(uuid) from anon, public;
grant execute on function public.lobby_armies(uuid) to authenticated;
