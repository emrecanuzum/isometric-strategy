-- Goods' usual prices raised half again (CLAUDE.md §9.7, "Mal dengesi"): food 0.13 → 0.2, building materials 0.2 → 0.3,
-- war materials 0.27 → 0.4. Each lobby's stored price moves with its base. Run once per lobby (marked by priceRev), a
-- missing price left alone, and every other key of the market kept.

update public.lobbies set market = market
  || case when market -> 'food' ? 'price' then jsonb_build_object('food', jsonb_set(market -> 'food', '{price}', to_jsonb((market -> 'food' ->> 'price')::numeric * 1.5))) else '{}'::jsonb end
  || case when market -> 'materials' ? 'price' then jsonb_build_object('materials', jsonb_set(market -> 'materials', '{price}', to_jsonb((market -> 'materials' ->> 'price')::numeric * 1.5))) else '{}'::jsonb end
  || case when market -> 'arms' ? 'price' then jsonb_build_object('arms', jsonb_set(market -> 'arms', '{price}', to_jsonb((market -> 'arms' ->> 'price')::numeric * 1.5))) else '{}'::jsonb end
  || jsonb_build_object('priceRev', 2)
where market is not null and jsonb_typeof(market) = 'object' and coalesce((market ->> 'priceRev')::int, 1) < 2;
