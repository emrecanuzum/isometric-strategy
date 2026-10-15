-- Tributes between lords are moved by the server (CLAUDE.md §9.7): each pact keeps when it was last paid, the tick pays
-- the whole rounds since from what the payer really has, and runs while any tribute stands.

alter table public.pacts add column if not exists paid_at timestamptz;

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
    or exists (select 1 from public.lobby_towns t join public.lobbies l on l.id = t.lobby_id
               where l.season_end > now() and t.owner_id is not null)
    or exists (select 1 from public.kingdoms k join public.lobbies l on l.id = k.lobby_id
               where l.season_end > now() and k.state ? 'liege')
    or exists (select 1 from public.kingdoms k join public.lobbies l on l.id = k.lobby_id
               where l.season_end > now() and (
                 jsonb_typeof(k.state -> 'blockade') = 'object'
                 or exists (select 1 from jsonb_array_elements(coalesce(k.state -> 'navy' -> 'fleets', '[]')) f
                            where f -> 'mission' ->> 'kind' in ('blockade', 'raid', 'sortie'))))
    or exists (select 1 from public.pacts p join public.lobbies l on l.id = p.lobby_id
               where l.season_end > now() and p.kind = 'tribute' and p.ended_at is null)
$$;
revoke execute on function public.tick_due() from anon, authenticated, public;
