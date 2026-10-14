-- The crown kingdoms' patrols (CLAUDE.md §7.8): each visit of a patrol to a lord, once, with what came of it: a tip
-- left at the house of entertainment, or tribute demanded (pending until paid, refused or let run out).

create table public.patrol_visits (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  crown integer not null,
  patrol integer not null,
  slot bigint not null,
  kingdom_id bigint not null references public.kingdoms (id) on delete cascade,
  kind text not null check (kind in ('tip', 'tribute', 'visit')),
  amount integer not null default 0,
  status text not null check (status in ('done', 'pending', 'paid', 'refused', 'expired')),
  visit_at timestamptz not null,
  expires_at timestamptz,
  unique (lobby_id, crown, patrol, slot)
);
create index on public.patrol_visits (lobby_id, slot desc);
create index on public.patrol_visits (expires_at) where status = 'pending';

alter table public.patrol_visits enable row level security;
create policy "my patrol visits" on public.patrol_visits for select to authenticated using (kingdom_id = public.my_kingdom(lobby_id));
revoke insert, update, delete on public.patrol_visits from anon, authenticated;

-- The minute's tick also runs while lords are sworn to a crown (its patrols ride), and while a demand is open.
create or replace function public.tick_due() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.envoys where status = 'traveling' and arrive_at <= now())
    or exists (select 1 from public.envoys where status = 'pending' and expires_at <= now())
    or exists (select 1 from public.spy_missions where ended_at is null and caught_at <= now())
    or exists (select 1 from public.army_orders where applied_at is null and effective_at <= now() + interval '90 seconds')
    or exists (select 1 from public.armies where status in ('moving', 'battle'))
    or exists (select 1 from public.armies a where a.goal ->> 'kind' in ('siege', 'town'))
    or exists (select 1 from public.battles where not resolved)
    or exists (select 1 from public.lobby_towns where siege is not null)
    or exists (select 1 from public.kingdoms k join public.lobbies l on l.id = k.lobby_id
               where l.season_end > now() and k.state ? 'liege')
$$;
revoke execute on function public.tick_due() from anon, authenticated, public;
