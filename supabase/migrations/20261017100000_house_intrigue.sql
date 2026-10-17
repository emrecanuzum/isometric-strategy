-- Intrigue in the lord's house (CLAUDE.md §9.1.1).
--   envoys.kind 'marriage': a daughter or sister offered to another lord's house (terms: {kind, bride, name, …}).
--   battles.kind 'pretender': the lord's army against his pretender brother's camp; 'usurp': the pretender's men
--     besieging the palace (besieged: the lord). Both keep the lord in plan.pretender.
--   armies.goal.kind 'camp': an army sent against its own lord's pretender's camp.
--   lobby_kingdoms.pretender: a lord's pretender camp, as everyone sees it on the map (its strength follows from the
--     time: start, lost, since, marchAt, backed).
--   tick_due: also while a pretender is out, an army marches on a camp, or a house has brothers who may rise.

alter table public.envoys drop constraint if exists envoys_kind_check;
alter table public.envoys add constraint envoys_kind_check check (kind in ('improve', 'gift', 'tribute', 'alliance', 'peace', 'insult', 'marriage'));

alter table public.battles drop constraint if exists battles_kind_check;
alter table public.battles add constraint battles_kind_check check (kind in ('field', 'siege', 'revolt', 'pretender', 'usurp'));

create or replace function public.tick_due() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.envoys where status = 'traveling' and arrive_at <= now())
    or exists (select 1 from public.envoys where status = 'pending' and expires_at <= now())
    or exists (select 1 from public.spy_missions where ended_at is null and caught_at <= now())
    or exists (select 1 from public.army_orders where applied_at is null and effective_at <= now() + interval '90 seconds')
    or exists (select 1 from public.armies where status in ('moving', 'battle'))
    or exists (select 1 from public.armies a where a.goal ->> 'kind' in ('siege', 'town', 'camp'))
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
                            where f -> 'mission' ->> 'kind' in ('blockade', 'raid', 'sortie'))))
    or exists (select 1 from public.pacts p join public.lobbies l on l.id = p.lobby_id
               where l.season_end > now() and p.kind = 'tribute' and p.ended_at is null)
$$;
revoke execute on function public.tick_due() from anon, authenticated, public;

-- The lobby's kingdoms as before (20261015220000_fleet_rough), with the pretender's camp.
drop function public.lobby_kingdoms(uuid);
create function public.lobby_kingdoms(lobby uuid)
returns table (id bigint, name text, color text, username text, site jsonb, buildings jsonb, queen boolean, version integer, seen_at bigint, trade_damaged boolean, shield_until bigint, score jsonb, trade_good text, trade_ledger jsonb, liege smallint, navy jsonb, blockade jsonb, pretender jsonb)
language sql stable security definer set search_path = '' as $$
  select k.id, k.name, k.color, p.username, k.state -> 'site',
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', b -> 'id', 'kind', b -> 'kind', 'x', b -> 'x', 'y', b -> 'y', 'size', b -> 'size',
      'doneAt', b -> 'doneAt', 'level', b -> 'level', 'broken', b -> 'broken', 'tower', b -> 'tower', 'along', b -> 'along'))
      from jsonb_array_elements(k.state -> 'buildings') b), '[]'),
    coalesce((k.state ->> 'queen')::boolean, false),
    k.version,
    coalesce((k.state ->> 'lastSeenAt')::numeric::bigint, (extract(epoch from k.updated_at) * 1000)::bigint),
    coalesce((k.state -> 'trade' ->> 'damaged')::boolean, false),
    (k.state ->> 'shieldUntil')::numeric::bigint,
    case when k.id = public.my_kingdom(lobby) or k.score is null then k.score
      else jsonb_build_object('total', round((k.score ->> 'total')::numeric / 50) * 50, 'growth', k.score -> 'growth', 'glory', k.score -> 'glory') end,
    case when coalesce((k.state -> 'trade' ->> 'idle')::boolean, false) then null else k.state -> 'trade' ->> 'good' end,
    case when k.state -> 'trade' -> 'ledger' is null then null
      when k.id = public.my_kingdom(lobby) then k.state -> 'trade' -> 'ledger'
      else jsonb_build_object(
        'food', round(coalesce((k.state -> 'trade' -> 'ledger' ->> 'food')::numeric, 0) / 25) * 25,
        'materials', round(coalesce((k.state -> 'trade' -> 'ledger' ->> 'materials')::numeric, 0) / 25) * 25,
        'arms', round(coalesce((k.state -> 'trade' -> 'ledger' ->> 'arms')::numeric, 0) / 25) * 25,
        'gold', round(coalesce((k.state -> 'trade' -> 'ledger' ->> 'gold')::numeric, 0) / 50) * 50) end,
    (k.state ->> 'liege')::smallint,
    case when k.state -> 'navy' is null then null else jsonb_build_object(
      'harbour', (select case when k.id = public.my_kingdom(lobby) then coalesce(sum(v::int), 0) else public.rough_ships(coalesce(sum(v::int), 0)::int) end
        from jsonb_each_text(coalesce(k.state -> 'navy' -> 'harbour', '{}')) h(s, v)),
      'fleets', coalesce((select jsonb_agg(jsonb_build_object(
          'id', f -> 'id',
          'ships', case when k.id = public.my_kingdom(lobby) then s.n else public.rough_ships(s.n::int) end,
          'galleys', coalesce((f -> 'ships' ->> 'galley')::int, 0) > 0,
          'kinds', case when k.id = public.my_kingdom(lobby) then (select jsonb_object_agg(x.s, x.v::int)
            from jsonb_each_text(coalesce(f -> 'ships', '{}')) x(s, v) where x.v::int > 0) else null end,
          'mission', f -> 'mission' ->> 'kind',
          'target', f -> 'mission' -> 'target',
          'arriveAt', f -> 'mission' -> 'arriveAt',
          'departedAt', f -> 'mission' -> 'departedAt',
          'tripMs', f -> 'mission' -> 'tripMs',
          'sail', f -> 'sail'))
        from jsonb_array_elements(coalesce(k.state -> 'navy' -> 'fleets', '[]')) f,
          lateral (select coalesce(sum(v::int), 0) as n from jsonb_each_text(coalesce(f -> 'ships', '{}')) x(s, v)) s), '[]'))
    end,
    case when jsonb_typeof(k.state -> 'blockade') = 'object' then k.state -> 'blockade' else null end,
    -- The pretender's camp: where, since when, how strong it started and what it has lost, when it marches, whether
    -- the crown backs him and what is being fought there; his name.
    case when jsonb_typeof(k.state -> 'pretender') = 'object' then jsonb_build_object(
      'name', k.state -> 'pretender' -> 'person' ->> 'name',
      'at', k.state -> 'pretender' -> 'at',
      'since', k.state -> 'pretender' -> 'since',
      'start', k.state -> 'pretender' -> 'start',
      'lost', k.state -> 'pretender' -> 'lost',
      'marchAt', k.state -> 'pretender' -> 'marchAt',
      'backed', k.state -> 'pretender' -> 'backed',
      'battle', k.state -> 'pretender' -> 'battle',
      'marching', k.state -> 'pretender' -> 'marching') else null end
  from public.kingdoms k left join public.profiles p on p.user_id = k.user_id
  where k.lobby_id = lobby and k.state is not null and public.is_member(lobby)
$$;
revoke execute on function public.lobby_kingdoms(uuid) from anon, public;
grant execute on function public.lobby_kingdoms(uuid) to authenticated;
