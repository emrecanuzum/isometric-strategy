-- Lobby broadcasts go on private topics: only the lobby's members receive its chat and kingdom notes, even though
-- lobby ids are listed to every player.

create or replace function public.announce_kingdom() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.state is not null then
    perform realtime.send(jsonb_build_object('id', new.id, 'version', new.version), 'kingdom',
      'lobby:' || new.lobby_id, true);
  end if;
  return null;
end $$;

create or replace function public.announce_chat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('id', new.id, 'kingdom_id', new.kingdom_id, 'name', new.name,
    'color', new.color, 'body', new.body, 'created_at', new.created_at), 'chat', 'lobby:' || new.lobby_id, true);
  return null;
end $$;

-- A topic `lobby:<uuid>` may be joined by members of that lobby only; clients send nothing on it.
create function public.lobby_of_topic(topic text) returns uuid
language sql immutable as $$
  select case when topic ~ '^lobby:[0-9a-f-]{36}$' then substring(topic from 7)::uuid end
$$;

create policy "members receive lobby broadcasts" on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.is_member(public.lobby_of_topic(realtime.topic())));
