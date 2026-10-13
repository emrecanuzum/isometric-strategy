-- One spy per kingdom and topic, held by the database (CLAUDE.md §9.7): two requests at once can no longer both get
-- through. Spies already doubled up on a topic are called home first (the extras, keeping the oldest), and their
-- owners get them back.
with extra as (
  select id, owner_id from (
    select id, owner_id, row_number() over (partition by owner_id, target_id, topic order by started_at, id) as n
    from public.spy_missions where ended_at is null
  ) ranked where n > 1
), ended as (
  update public.spy_missions set ended_at = now(), end_reason = 'recalled'
  where id in (select id from extra) returning owner_id
), counts as (
  select owner_id, count(*)::int as n from ended group by owner_id
)
update public.kingdoms k set
  state = jsonb_set(
    jsonb_set(k.state, '{spies}', to_jsonb(coalesce((k.state ->> 'spies')::int, 0) + c.n)),
    '{spiesAway}', to_jsonb(greatest(0, coalesce((k.state ->> 'spiesAway')::int, 0) - c.n))),
  version = k.version + 1
from counts c
where k.id = c.owner_id and k.state is not null;

create unique index spy_missions_one_per_topic on public.spy_missions (owner_id, target_id, topic) where ended_at is null;
