-- Lobbies opened from now on have their free cities on the shore of a big lake (worldgen WORLD_REV 4). The command
-- function also writes the revision it made the world with; the default only covers lobbies made some other way.
alter table public.lobbies alter column world_rev set default 4;
