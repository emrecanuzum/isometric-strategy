-- When each player was last seen (CLAUDE.md §6.4): kept in the kingdom's state, shown to the lobby.
drop function public.lobby_kingdoms(uuid);
create function public.lobby_kingdoms(lobby uuid)
returns table (id bigint, name text, color text, username text, site jsonb, buildings jsonb, queen boolean, version integer, seen_at bigint)
language sql stable security definer set search_path = '' as $$
  select k.id, k.name, k.color, p.username, k.state -> 'site',
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', b -> 'id', 'kind', b -> 'kind', 'x', b -> 'x', 'y', b -> 'y', 'size', b -> 'size',
      'doneAt', b -> 'doneAt', 'level', b -> 'level', 'broken', b -> 'broken'))
      from jsonb_array_elements(k.state -> 'buildings') b), '[]'),
    coalesce((k.state ->> 'queen')::boolean, false),
    k.version,
    coalesce((k.state ->> 'lastSeenAt')::numeric::bigint, (extract(epoch from k.updated_at) * 1000)::bigint)
  from public.kingdoms k left join public.profiles p on p.user_id = k.user_id
  where k.lobby_id = lobby and k.state is not null and public.is_member(lobby)
$$;
revoke execute on function public.lobby_kingdoms(uuid) from anon, public;
grant execute on function public.lobby_kingdoms(uuid) to authenticated;

-- A lobby being deleted tells everyone in it, so their games go back to the main menu.
create function public.announce_lobby_closed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('id', old.id), 'closed', 'lobby:' || old.id::text, true);
  return old;
end $$;
create trigger lobby_closed before delete on public.lobbies
  for each row execute function public.announce_lobby_closed();
