-- A site's food multiplier is never below 0.8 (CLAUDE.md §6.4, economy.json → yield.foodMin): lordships founded on
-- poorer land before the floor are raised to it (their yields were fixed at founding).

update public.kingdoms set state = jsonb_set(state, '{yields,food}', to_jsonb(0.8))
where state is not null and jsonb_typeof(state -> 'yields') = 'object' and (state -> 'yields' ->> 'food')::numeric < 0.8;
