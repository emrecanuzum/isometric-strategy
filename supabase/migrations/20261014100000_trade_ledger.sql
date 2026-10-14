-- The lobby's trade shares (CLAUDE.md §7.6): what each kingdom's merchant has sold this season, per good, and the gold
-- it brought, and what it sells now. Others see the totals rounded (goods to 25, gold to 50): roughly who rules the
-- trade, never the exact stores.

drop function public.lobby_kingdoms(uuid);
create function public.lobby_kingdoms(lobby uuid)
returns table (id bigint, name text, color text, username text, site jsonb, buildings jsonb, queen boolean, version integer, seen_at bigint, trade_damaged boolean, shield_until bigint, score jsonb, trade_good text, trade_ledger jsonb)
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
        'gold', round(coalesce((k.state -> 'trade' -> 'ledger' ->> 'gold')::numeric, 0) / 50) * 50) end
  from public.kingdoms k left join public.profiles p on p.user_id = k.user_id
  where k.lobby_id = lobby and k.state is not null and public.is_member(lobby)
$$;
revoke execute on function public.lobby_kingdoms(uuid) from anon, public;
grant execute on function public.lobby_kingdoms(uuid) to authenticated;
