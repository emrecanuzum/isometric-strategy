-- Envoys may carry insults too (CLAUDE.md §9.7).
alter table public.envoys drop constraint envoys_kind_check;
alter table public.envoys add constraint envoys_kind_check check (kind in ('improve', 'gift', 'tribute', 'alliance', 'peace', 'insult'));
