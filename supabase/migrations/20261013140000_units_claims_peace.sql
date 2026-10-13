-- Kinds of soldier in armies, peace offers with terms, and claims (casus belli): CLAUDE.md §9.7.

alter table public.armies add column units jsonb not null default '{}';
update public.armies set units = jsonb_build_object('spear', soldiers) where units = '{}';

alter table public.envoys add column terms jsonb;

-- A grievance one kingdom holds against another for a while: with it, war may be declared at a milder enmity and
-- without the other kingdoms holding it against the declarer.
create table public.claims (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  holder_id bigint not null references public.kingdoms (id) on delete cascade,
  target_id bigint not null references public.kingdoms (id) on delete cascade,
  reason text not null,
  expires_at timestamptz not null
);
create index on public.claims (lobby_id);
alter table public.claims enable row level security;
create policy "members see claims" on public.claims for select to authenticated using (public.is_member(lobby_id));
revoke insert, update, delete on public.claims from anon, authenticated;
create trigger announce_change after insert or update or delete on public.claims for each row execute function public.announce_change();

-- Armies as the lobby sees them: the kinds of soldier only for the player's own.
drop function public.lobby_armies(uuid);
create function public.lobby_armies(lobby uuid)
returns table (id bigint, kingdom_id bigint, soldiers integer, units jsonb, path jsonb, depart_at timestamptz,
  arrive_at timestamptz, status text, goal jsonb, morale real, familiarity real, camp jsonb)
language sql stable security definer set search_path = '' as $$
  select a.id, a.kingdom_id,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.soldiers end,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.units end,
    a.path, a.depart_at, a.arrive_at, a.status,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.goal else jsonb_build_object('kind', a.goal ->> 'kind') end,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.morale end,
    case when a.kingdom_id = public.my_kingdom(lobby) then a.familiarity end,
    a.camp
  from public.armies a where a.lobby_id = lobby and public.is_member(lobby)
$$;
revoke execute on function public.lobby_armies(uuid) from anon, public;
grant execute on function public.lobby_armies(uuid) to authenticated;
