-- Mini-games and their leaderboards (CLAUDE.md §6.5). Every row is a run the server has played again from its seed and
-- the player's presses (the `command` function), never written by a client. Each row keeps the lord's name and colour,
-- the player's name and the lobby's name as they were, so the boards read right after a rename or a wipe: a lobby's
-- rows lose their lobby and kingdom when it is deleted, but stay on the all-time board.

create table public.minigame_scores (
  id bigint generated always as identity primary key,
  lobby_id uuid references public.lobbies (id) on delete set null,
  kingdom_id bigint references public.kingdoms (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  game text not null check (game in ('fishing', 'archery', 'anvil', 'caravan')),
  score integer not null check (score >= 0),
  at timestamptz not null default now(),
  name text,
  color text,
  username text,
  lobby_name text
);
create index on public.minigame_scores (lobby_id, game, score desc);
create index on public.minigame_scores (game, score desc);

-- The player's and the lobby's names are stamped on the row as it goes in.
create function public.minigame_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.username := (select p.username from public.profiles p where p.user_id = new.user_id);
  new.lobby_name := (select l.name from public.lobbies l where l.id = new.lobby_id);
  new.at := now();
  return new;
end $$;
create trigger minigame_stamp before insert on public.minigame_scores for each row execute function public.minigame_stamp();

-- Read only through minigame_board; written only by the server.
alter table public.minigame_scores enable row level security;
revoke insert, update, delete on public.minigame_scores from anon, authenticated;

-- One game's board: the best run of each lord in the lobby ('lobby', members only), or the best run of each player
-- across every lobby ('all'), the top `size` of them, and the caller's own best row wherever it ranks (`mine`).
create function public.minigame_board(lobby uuid, which text, scope text, size integer default 10)
returns table (rank bigint, name text, color text, username text, lobby_name text, score integer, at timestamptz, mine boolean)
language sql stable security definer set search_path = '' as $$
  with bests as (
    select distinct on (case when scope = 'lobby' then s.kingdom_id::text else s.user_id::text end)
      s.kingdom_id, s.user_id, s.name, s.color, s.username, s.lobby_name, s.score, s.at
    from public.minigame_scores s
    where s.game = which
      and (scope = 'all' or (s.lobby_id = lobby and s.kingdom_id is not null and public.is_member(lobby)))
    order by case when scope = 'lobby' then s.kingdom_id::text else s.user_id::text end, s.score desc, s.at asc
  ),
  ranked as (
    select rank() over (order by b.score desc, b.at asc) as rank, b.*,
      case when scope = 'lobby' then b.kingdom_id = public.my_kingdom(lobby) else b.user_id = auth.uid() end as mine
    from bests b
  )
  select r.rank, r.name, r.color, r.username, r.lobby_name, r.score, r.at, coalesce(r.mine, false)
  from ranked r
  where r.rank <= least(greatest(size, 1), 50) or r.mine
  order by r.rank
$$;
revoke execute on function public.minigame_board(uuid, text, text, integer) from anon, public;
grant execute on function public.minigame_board(uuid, text, text, integer) to authenticated;
