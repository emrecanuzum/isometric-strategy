-- A fleet's way over the water (CLAUDE.md §8.5): the lobby sees where each lord's fleets sail and ride at anchor.
drop function public.lobby_kingdoms(uuid);
create function public.lobby_kingdoms(lobby uuid)
returns table (id bigint, name text, color text, username text, site jsonb, buildings jsonb, queen boolean, version integer, seen_at bigint, trade_damaged boolean, shield_until bigint, score jsonb, trade_good text, trade_ledger jsonb, liege smallint, navy jsonb, blockade jsonb)
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
    -- Fleets as the map shows them: how many ships (rounded up to an even number for others, the exact count is for
    -- spies), whether galleys are among them, what they are doing and where, and their way over the water.
    case when k.state -> 'navy' is null then null else jsonb_build_object(
      'harbour', (select case when k.id = public.my_kingdom(lobby) then coalesce(sum(v::int), 0) else ceil(coalesce(sum(v::int), 0) / 2.0) * 2 end
        from jsonb_each_text(coalesce(k.state -> 'navy' -> 'harbour', '{}')) h(s, v)),
      'fleets', coalesce((select jsonb_agg(jsonb_build_object(
          'id', f -> 'id',
          'ships', case when k.id = public.my_kingdom(lobby) then s.n else ceil(s.n / 2.0) * 2 end,
          'galleys', coalesce((f -> 'ships' ->> 'galley')::int, 0) > 0,
          'mission', f -> 'mission' ->> 'kind',
          'target', f -> 'mission' -> 'target',
          'arriveAt', f -> 'mission' -> 'arriveAt',
          'departedAt', f -> 'mission' -> 'departedAt',
          'tripMs', f -> 'mission' -> 'tripMs',
          'sail', f -> 'sail'))
        from jsonb_array_elements(coalesce(k.state -> 'navy' -> 'fleets', '[]')) f,
          lateral (select coalesce(sum(v::int), 0) as n from jsonb_each_text(coalesce(f -> 'ships', '{}')) x(s, v)) s), '[]'))
    end,
    case when jsonb_typeof(k.state -> 'blockade') = 'object' then k.state -> 'blockade' else null end
  from public.kingdoms k left join public.profiles p on p.user_id = k.user_id
  where k.lobby_id = lobby and k.state is not null and public.is_member(lobby)
$$;
revoke execute on function public.lobby_kingdoms(uuid) from anon, public;
grant execute on function public.lobby_kingdoms(uuid) to authenticated;
