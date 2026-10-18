BEGIN;

-- Apply the owner's whole-unit prices to NEW quotes only. Immutable v1 quotes,
-- orders, subscriptions, accounting observations and paid periods stay intact.
DO $$
BEGIN
  IF (SELECT count(*) FROM jobvance_private.loop_price_revisions WHERE catalog_version='loop-local-2026-10-18-v1')<>54 THEN RAISE EXCEPTION 'LOOP_PRICE_V1_CATALOG_INCOMPLETE'; END IF;
END $$;
UPDATE jobvance_private.loop_price_revisions SET active=false WHERE catalog_version='loop-local-2026-10-18-v1';

WITH prices(currency,weekly,three_weekly,daily,exponent) AS (VALUES
  ('USD',2900,5900,9900,2),
  ('EUR',2600,5200,8800,2),
  ('GBP',2200,4400,7400,2),
  ('INR',299900,599900,899900,2),
  ('AED',10900,21900,35900,2),
  ('CAD',4100,8400,13900,2),
  ('AUD',4200,8500,13900,2),
  ('SGD',3700,7500,12900,2),
  ('JPY',4999,8999,15999,0)
)
INSERT INTO jobvance_private.loop_price_revisions(mode,catalog_version,plan,product_id,currency,amount_minor,exponent,usd_base_minor,tax_inclusive,provenance,active)
SELECT old.mode,'loop-local-2026-10-18-v2',old.plan,old.product_id,old.currency,
  CASE old.plan WHEN 'weekly' THEN p.weekly WHEN 'three_weekly' THEN p.three_weekly ELSE p.daily END,
  p.exponent,old.usd_base_minor,old.tax_inclusive,
  old.provenance||jsonb_build_object('publishedAt','2026-10-18','roundingPolicy','owner-whole-unit-endings-v2','previousCatalogVersion',old.catalog_version,'priceDirection','Owner-approved whole major units; INR ends in 999; USD base unchanged'),true
FROM jobvance_private.loop_price_revisions old JOIN prices p ON p.currency=old.currency
WHERE old.catalog_version='loop-local-2026-10-18-v1';

COMMIT;
