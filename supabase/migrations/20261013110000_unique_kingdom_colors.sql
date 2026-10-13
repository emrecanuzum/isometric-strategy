-- No two kingdoms of a lobby fly the same colour (CLAUDE.md §5.1); the `command` function checks first, this settles
-- two foundings at the same moment.
create unique index kingdoms_lobby_color on public.kingdoms (lobby_id, color) where color is not null;
