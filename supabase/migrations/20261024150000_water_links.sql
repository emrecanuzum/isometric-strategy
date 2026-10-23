-- All the water joined (worldgen revision 7 for running lobbies, 8 for new ones). A lobby that was running when it
-- came keeps the channels cut to join its waters (worldgen carveLinks) as [{points: [{x, y}, ...], width}, ...]; clients
-- make the same world from the seed, the revision, river_keep and these. Only the lobby's own players read them,
-- through lobby_water_links (they run round the lords' buildings). Null for every other lobby.
alter table public.lobbies add column if not exists water_links jsonb;
alter table public.lobbies alter column world_rev set default 8;

create or replace function public.lobby_water_links(lobby uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select l.water_links
  from public.lobbies l
  where l.id = lobby
    and exists (select 1 from public.kingdoms k where k.lobby_id = l.id and k.user_id = auth.uid())
$$;

revoke execute on function public.lobby_water_links(uuid) from anon, public;
grant execute on function public.lobby_water_links(uuid) to authenticated;
