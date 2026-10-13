-- How big an army looks and whether it drags catapults, for every screen (CLAUDE.md §9.7): the figures drawn grow with
-- its soldiers (3 to 9, a coarse size; the exact count stays with its owner and spies).
drop function public.lobby_armies(uuid);
create function public.lobby_armies(lobby uuid)
returns table (id bigint, kingdom_id bigint, soldiers integer, units jsonb, path jsonb, depart_at timestamptz,
  arrive_at timestamptz, status text, goal jsonb, morale real, familiarity real, camp jsonb, figures integer, catapults boolean)
language sql stable security definer set search_path = '' as $$
  select a.id, a.kingdom_id,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.soldiers end,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.units end,
    a.path, a.depart_at, a.arrive_at, a.status,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.goal else jsonb_build_object('kind', a.goal ->> 'kind') end,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.morale end,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.familiarity end,
    a.camp,
    least(9, 3 + a.soldiers / 10),
    coalesce((a.units ->> 'catapult')::int, 0) > 0
  from public.armies a where a.lobby_id = lobby and public.is_member(lobby)
$$;
revoke execute on function public.lobby_armies(uuid) from anon, public;
grant execute on function public.lobby_armies(uuid) to authenticated;
