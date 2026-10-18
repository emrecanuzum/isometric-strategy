-- The pirates' havens (CLAUDE.md §8.5): a lobby's havens follow from its seed (packages/shared/src/havens.ts); what
-- happens to them is kept as rows of lobby_outlaws of kind 'haven' (idx: the haven's index):
--   pop / pop_at: its people at that moment (ms); from there it grows back over time, or dwindles while blockaded;
--   held: the blockade on it ({kingdom, fleet, name, color, since}), or null.
-- Only the server writes; the lords read every column (the haven and its blockade are plain to see).

alter table public.lobby_outlaws drop constraint if exists lobby_outlaws_kind_check;
alter table public.lobby_outlaws add constraint lobby_outlaws_kind_check check (kind in ('band', 'boat', 'clan', 'haven'));
alter table public.lobby_outlaws add column if not exists pop real;
alter table public.lobby_outlaws add column if not exists pop_at bigint;
alter table public.lobby_outlaws add column if not exists held jsonb;

grant select (lobby_id, kind, idx, gen, down_until, battle, shift, losses, born_at, fallen, pop, pop_at, held) on public.lobby_outlaws to authenticated;
