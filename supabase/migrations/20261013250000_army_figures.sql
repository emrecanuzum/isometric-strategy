-- More figures for bigger armies: about one for every three soldiers, 2 to 12 (CLAUDE.md §9.7).
create or replace function public.lobby_armies(lobby uuid)
returns table (id bigint, kingdom_id bigint, soldiers integer, units jsonb, path jsonb, depart_at timestamptz,
  arrive_at timestamptz, status text, goal jsonb, morale real, familiarity real, camp jsonb, figures integer, catapults boolean,
  contact_until timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.kingdom_id,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.soldiers end,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.units end,
    a.path, a.depart_at, a.arrive_at, a.status,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.goal else jsonb_build_object('kind', a.goal ->> 'kind') end,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.morale end,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.familiarity end,
    a.camp,
    least(12, greatest(2, ceil(a.soldiers / 3.0)))::integer,
    coalesce((a.units ->> 'catapult')::int, 0) > 0,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.contact_until end
  from public.armies a where a.lobby_id = lobby and public.is_member(lobby)
$$;
