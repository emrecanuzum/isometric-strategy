-- Clients read the rectangles through lobby_river_keep now; nobody else reads the column.
revoke select (river_keep) on public.lobbies from authenticated;
