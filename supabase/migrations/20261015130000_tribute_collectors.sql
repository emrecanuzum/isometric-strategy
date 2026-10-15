-- Tribute collectors (CLAUDE.md §7.8): every tribute slot each rival crown calls on every lord, so a slot holds a
-- visit per lord. Collectors' visits are written with patrol = -1; a patrol's visits stay one per crown, patrol and slot.

alter table public.patrol_visits drop constraint patrol_visits_lobby_id_crown_patrol_slot_key;
alter table public.patrol_visits add constraint patrol_visits_visit_key unique (lobby_id, crown, patrol, slot, kingdom_id);
