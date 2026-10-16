-- Wider rivers (worldgen WORLD_REV 6). A lobby that was running when they came keeps the rectangles its rivers had to
-- leave dry (its kingdoms' buildings and dock plots, its towns) as [[x, y, w, h], ...]; clients make the same world
-- from the seed, the revision and these. Null for lobbies opened since.
alter table public.lobbies add column if not exists river_keep jsonb;
grant select (river_keep) on public.lobbies to authenticated;
alter table public.lobbies alter column world_rev set default 6;
