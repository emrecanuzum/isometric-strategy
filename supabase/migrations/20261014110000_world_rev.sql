-- The way a lobby's world was made from its seed (worldgen WORLD_REV): lobbies opened before the free cities keep
-- revision 1, so every player still makes the same world the server checks commands against.
alter table public.lobbies add column if not exists world_rev smallint not null default 1;
alter table public.lobbies alter column world_rev set default 2;
grant select (world_rev) on public.lobbies to authenticated;
