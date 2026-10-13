-- Others see only what the map and the battles already show of a kingdom (growth, glory) and its total rounded to 50: the
-- treasury, people and army parts would give away its stores and soldiers, which only spies may estimate.

drop function public.lobby_kingdoms(uuid);
create function public.lobby_kingdoms(lobby uuid)
returns table (id bigint, name text, color text, username text, site jsonb, buildings jsonb, queen boolean, version integer, seen_at bigint, trade_damaged boolean, shield_until bigint, score jsonb)
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
      else jsonb_build_object('total', round((k.score ->> 'total')::numeric / 50) * 50, 'growth', k.score -> 'growth', 'glory', k.score -> 'glory') end
  from public.kingdoms k left join public.profiles p on p.user_id = k.user_id
  where k.lobby_id = lobby and k.state is not null and public.is_member(lobby)
$$;
revoke execute on function public.lobby_kingdoms(uuid) from anon, public;
grant execute on function public.lobby_kingdoms(uuid) to authenticated;
