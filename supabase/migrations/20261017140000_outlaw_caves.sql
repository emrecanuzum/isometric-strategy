-- The bandits' caves and clans (CLAUDE.md §7.9.1). The caves follow from the lobby's seed (packages/shared/src/caves.ts);
-- the clans living in them are kept as rows of lobby_outlaws of kind 'clan' (idx: the clan's slot):
--   gen: how many clans of this slot have been wiped out; born_at: when the clan settled in its cave (ms; its bands
--   take the roads a while later, bandDelaySeconds); battle: the siege of its cave under way; losses: defenders lost in
--   sieges the cave held; fallen: the caves razed before ({cave, at, by, byName, name}); cave: the cave it lives in.
-- Which cave a clan holds is the server's secret: a lord learns it by beating the clan's bands (the trail in the lord's
-- own state), so the lords may read every column but `cave`.
--   battles.kind 'cave': a lord's army laying siege to a clan's cave.

alter table public.lobby_outlaws drop constraint if exists lobby_outlaws_kind_check;
alter table public.lobby_outlaws add constraint lobby_outlaws_kind_check check (kind in ('band', 'boat', 'clan'));
alter table public.lobby_outlaws add column if not exists born_at bigint;
alter table public.lobby_outlaws add column if not exists cave integer;
alter table public.lobby_outlaws add column if not exists fallen jsonb not null default '[]'::jsonb;

revoke select on public.lobby_outlaws from anon, authenticated;
grant select (lobby_id, kind, idx, gen, down_until, battle, shift, losses, born_at, fallen) on public.lobby_outlaws to authenticated;

alter table public.battles drop constraint if exists battles_kind_check;
alter table public.battles add constraint battles_kind_check check (kind in ('field', 'siege', 'revolt', 'pretender', 'usurp', 'outlaw', 'cave'));

-- The minute's tick (as in 20261017120000_outlaws) also runs while an army marches on a cave, for a while after a new
-- clan settles (its bands coming out onto the roads change the lords' share of the bandits' hold; 20 minutes, more
-- than clans.bandDelaySeconds), and for a lobby whose clans have not been settled yet.
create or replace function public.tick_due() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.envoys where status = 'traveling' and arrive_at <= now())
    or exists (select 1 from public.envoys where status = 'pending' and expires_at <= now())
    or exists (select 1 from public.spy_missions where ended_at is null and caught_at <= now())
    or exists (select 1 from public.army_orders where applied_at is null and effective_at <= now() + interval '90 seconds')
    or exists (select 1 from public.armies where status in ('moving', 'battle'))
    or exists (select 1 from public.armies a where a.goal ->> 'kind' in ('siege', 'town', 'camp', 'chase', 'cave'))
    or exists (select 1 from public.battles where not resolved)
    or exists (select 1 from public.lobby_towns where siege is not null)
    or exists (select 1 from public.lobby_towns t join public.lobbies l on l.id = t.lobby_id
               where l.season_end > now() and t.owner_id is not null)
    or exists (select 1 from public.kingdoms k join public.lobbies l on l.id = k.lobby_id
               where l.season_end > now() and k.state ? 'liege')
    or exists (select 1 from public.kingdoms k join public.lobbies l on l.id = k.lobby_id
               where l.season_end > now() and (
                 k.state ? 'pretender'
                 or jsonb_array_length(coalesce(k.state -> 'dynasty' -> 'siblings', '[]'::jsonb)) > 0))
    or exists (select 1 from public.kingdoms k join public.lobbies l on l.id = k.lobby_id
               where l.season_end > now() and (
                 jsonb_typeof(k.state -> 'blockade') = 'object'
                 or exists (select 1 from jsonb_array_elements(coalesce(k.state -> 'navy' -> 'fleets', '[]')) f
                            where f -> 'mission' ->> 'kind' in ('blockade', 'raid', 'sortie') or f ? 'chase')))
    or exists (select 1 from public.pacts p join public.lobbies l on l.id = p.lobby_id
               where l.season_end > now() and p.kind = 'tribute' and p.ended_at is null)
    or exists (select 1 from public.lobby_outlaws o join public.lobbies l on l.id = o.lobby_id
               where l.season_end > now() and (o.battle is not null
                 or (o.down_until is not null and o.down_until > (extract(epoch from now()) * 1000)::bigint - 180000)))
    or exists (select 1 from public.kingdoms k join public.lobbies l on l.id = k.lobby_id
               where l.season_end > now() and k.state is not null and not (k.state ? 'outlaws'))
    or exists (select 1 from public.lobby_outlaws o join public.lobbies l on l.id = o.lobby_id
               where l.season_end > now() and o.kind = 'clan' and o.born_at > (extract(epoch from now()) * 1000)::bigint - 1200000)
    or exists (select 1 from public.lobbies l where l.season_end > now()
               and exists (select 1 from public.kingdoms k where k.lobby_id = l.id and k.state is not null)
               and not exists (select 1 from public.lobby_outlaws o where o.lobby_id = l.id and o.kind = 'clan'))
$$;
revoke execute on function public.tick_due() from anon, authenticated, public;
