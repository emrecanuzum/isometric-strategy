-- Goods rebalanced (CLAUDE.md §6.4, "Mal dengesi"): a merchant selling a good at full load now outsells even the
-- biggest production of it. Loads are four times what they were and the base prices about a third (food 0.4 → 0.13,
-- building materials 0.6 → 0.2, war materials 0.8 → 0.27). Each lobby's stored prices follow the base, and a load a
-- lord set below the whole is scaled with it.

update public.lobbies set market = jsonb_build_object(
  'food', jsonb_set(market -> 'food', '{price}', to_jsonb(((market -> 'food' ->> 'price')::numeric * 0.13 / 0.4))),
  'materials', jsonb_set(market -> 'materials', '{price}', to_jsonb(((market -> 'materials' ->> 'price')::numeric * 0.2 / 0.6))),
  'arms', jsonb_set(market -> 'arms', '{price}', to_jsonb(((market -> 'arms' ->> 'price')::numeric * 0.27 / 0.8)))
)
where market ? 'food' and market ? 'materials' and market ? 'arms';

update public.kingdoms set
  state = jsonb_set(state, '{trade,amount}', to_jsonb(((state #>> '{trade,amount}')::int * 4))),
  version = version + 1
where jsonb_typeof(state #> '{trade,amount}') = 'number';
