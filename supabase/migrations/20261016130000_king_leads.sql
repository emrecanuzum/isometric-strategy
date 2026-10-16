-- The lord at the head of an army (CLAUDE.md §8.2.1): the person id of the ruler leading it. Its own kingdom sees who;
-- everyone sees that a lord rides with it (the royal banner on the map).
alter table public.armies add column led_by integer;

drop function public.lobby_armies(uuid);
create function public.lobby_armies(lobby uuid)
returns table (id bigint, kingdom_id bigint, soldiers integer, units jsonb, path jsonb, depart_at timestamptz,
  arrive_at timestamptz, status text, goal jsonb, morale real, familiarity real, camp jsonb, figures integer, catapults boolean,
  contact_until timestamptz, led_by integer, royal boolean)
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
    a.led_by is not null
  from public.armies a where a.lobby_id = lobby and public.is_member(lobby)
$$;
revoke execute on function public.lobby_armies(uuid) from anon, public;
grant execute on function public.lobby_armies(uuid) to authenticated;
