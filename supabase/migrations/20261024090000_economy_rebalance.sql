-- Economy rebalance (CLAUDE.md §6.4, §9.7):
-- 1. Goods' usual prices raised by half (food 0.2 → 0.3, building materials 0.3 → 0.45, war materials 0.4 → 0.6) as
--    the merchant carries half as much a trip. Each lobby's stored price moves with its base; run once per lobby
--    (marked by priceRev 3), a missing price left alone, every other key of the market kept.
-- 2. Tribute between lords is now gold an hour (20–150) instead of gold a production round (1–4, i.e. 360–1440 an
--    hour). Standing pacts, the lords' own lists of them and the demands still on the road are brought over at a
--    tenth of what they cost before (× 36).

update public.lobbies set market = market
  || case when market -> 'food' ? 'price' then jsonb_build_object('food', jsonb_set(market -> 'food', '{price}', to_jsonb((market -> 'food' ->> 'price')::numeric * 1.5))) else '{}'::jsonb end
  || case when market -> 'materials' ? 'price' then jsonb_build_object('materials', jsonb_set(market -> 'materials', '{price}', to_jsonb((market -> 'materials' ->> 'price')::numeric * 1.5))) else '{}'::jsonb end
  || case when market -> 'arms' ? 'price' then jsonb_build_object('arms', jsonb_set(market -> 'arms', '{price}', to_jsonb((market -> 'arms' ->> 'price')::numeric * 1.5))) else '{}'::jsonb end
  || jsonb_build_object('priceRev', 3)
where market is not null and jsonb_typeof(market) = 'object' and coalesce((market ->> 'priceRev')::int, 1) < 3;

update public.pacts set gold = gold * 36
where kind = 'tribute' and ended_at is null and gold is not null and gold <= 4;

update public.envoys set gold = gold * 36
where kind = 'tribute' and status in ('traveling', 'pending') and gold is not null and gold <= 4;

update public.envoys set terms = jsonb_set(terms, '{gold}', to_jsonb((terms ->> 'gold')::numeric * 36))
where kind = 'peace' and status in ('traveling', 'pending') and terms ->> 'kind' = 'tribute' and (terms ->> 'gold')::numeric <= 4;

update public.kingdoms set state = jsonb_set(state, '{tributes}', (
  select coalesce(jsonb_agg(case when (t ->> 'gold')::numeric <= 4 then jsonb_set(t, '{gold}', to_jsonb((t ->> 'gold')::numeric * 36)) else t end), '[]'::jsonb)
  from jsonb_array_elements(state -> 'tributes') t
))
where state is not null and jsonb_typeof(state -> 'tributes') = 'array' and jsonb_array_length(state -> 'tributes') > 0;
