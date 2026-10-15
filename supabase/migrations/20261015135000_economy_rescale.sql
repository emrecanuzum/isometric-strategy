-- The economy rebalanced (CLAUDE.md §6.4): the goods' base prices dropped (food 1.7 → 0.4, building materials
-- 2.5 → 0.6, war materials 3.4 → 0.8). Each lobby's stored prices are scaled by the same ratio, so a market stays as
-- far above or below its base as it was.

update public.lobbies set market = jsonb_build_object(
  'food', jsonb_set(market -> 'food', '{price}', to_jsonb(((market -> 'food' ->> 'price')::numeric * 0.4 / 1.7))),
  'materials', jsonb_set(market -> 'materials', '{price}', to_jsonb(((market -> 'materials' ->> 'price')::numeric * 0.6 / 2.5))),
  'arms', jsonb_set(market -> 'arms', '{price}', to_jsonb(((market -> 'arms' ->> 'price')::numeric * 0.8 / 3.4)))
)
where market ? 'food' and market ? 'materials' and market ? 'arms';

-- Merchant trips to a free city are three times longer now (30 s + 0.36 s a tile instead of 10 s + 0.12 s), and the
-- season's sales are put on the new price scale so the lobby's trade shares read in today's gold.
update public.kingdoms set
  state = jsonb_set(state, '{trade,city,tripMs}', to_jsonb(((state #>> '{trade,city,tripMs}')::numeric * 3)::bigint)),
  version = version + 1
where state #> '{trade,city,tripMs}' is not null;

update public.kingdoms set
  state = jsonb_set(state, '{trade,ledger,gold}', to_jsonb(round((state #>> '{trade,ledger,gold}')::numeric * 0.4 / 1.7))),
  version = version + 1
where state #> '{trade,ledger,gold}' is not null;

-- Tribute between lords is paid every round; with taxes and trade a fifth of what they were, so is every tribute
-- already agreed (at least one gold a round).
update public.kingdoms set
  state = jsonb_set(state, '{tributes}', (
    select coalesce(jsonb_agg(jsonb_set(t, '{gold}', to_jsonb(greatest(1, round((t ->> 'gold')::numeric / 5))))), '[]'::jsonb)
    from jsonb_array_elements(state -> 'tributes') t)),
  version = version + 1
where jsonb_typeof(state -> 'tributes') = 'array' and jsonb_array_length(state -> 'tributes') > 0;
update public.pacts set gold = greatest(1, round(gold / 5)) where kind = 'tribute' and ended_at is null and gold is not null;
