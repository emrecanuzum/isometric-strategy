-- Three more mini-games for the lordship's first buildings (CLAUDE.md §6.5): splitting logs at the lumber camp, the
-- harvest at the farm and hauling the net at the dock. Their runs go on the same leaderboards.

alter table public.minigame_scores drop constraint if exists minigame_scores_game_check;
alter table public.minigame_scores add constraint minigame_scores_game_check
  check (game in ('fishing', 'archery', 'anvil', 'caravan', 'woodsplit', 'harvest', 'net'));
