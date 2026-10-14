-- Small towns on the map (CLAUDE.md §8.4): free until a kingdom's army takes one in a siege; held towns send their lord
-- something every round until another lord at war with him takes them. Placed once per lobby by the server.

create table public.lobby_towns (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  idx integer not null,
  x integer not null,
  y integer not null,
  kind text not null check (kind in ('gold', 'food', 'materials', 'arms', 'people')),
  name text not null,
  owner_id bigint references public.kingdoms (id) on delete set null,
  garrison integer not null default 0 check (garrison >= 0),
  -- The siege under way: {army, kingdom, startedAt, endsAt} (milliseconds); null when none.
  siege jsonb,
  taken_at timestamptz,
  unique (lobby_id, idx)
);
create index on public.lobby_towns (lobby_id);

alter table public.lobby_towns enable row level security;
create policy "members see towns" on public.lobby_towns for select to authenticated using (public.is_member(lobby_id));
revoke insert, update, delete on public.lobby_towns from anon, authenticated;

create trigger announce_change after insert or update or delete on public.lobby_towns
  for each row execute function public.announce_change();

-- The minute's tick also runs while a town is under siege.
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
$$;
revoke execute on function public.tick_due() from anon, authenticated, public;
