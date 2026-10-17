-- A word with the rival crown's tribute collectors (CLAUDE.md §7.8): once a visit, the lord's replies to their captain
-- and what came of them (the factor on the demand, whether he left angry, the amount first asked). Written by the
-- server only, with the visit's amount changed to the talked demand.

alter table public.patrol_visits add column talk jsonb;
