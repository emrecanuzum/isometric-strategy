-- The rectangles a running lobby's widened rivers leave dry are where its lords' buildings stood: only the lobby's own
-- players read them, through this function (the column's grant is taken back once clients use it, next migration).

create or replace function public.lobby_river_keep(lobby uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select l.river_keep
  from public.lobbies l
  where l.id = lobby
    and exists (select 1 from public.kingdoms k where k.lobby_id = l.id and k.user_id = auth.uid())
$$;

revoke execute on function public.lobby_river_keep(uuid) from anon, public;
grant execute on function public.lobby_river_keep(uuid) to authenticated;
