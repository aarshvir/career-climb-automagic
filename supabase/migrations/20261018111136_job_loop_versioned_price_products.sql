BEGIN;

-- Provider localized-rule edits can reprice existing ready checkout sessions.
-- New catalogue admission therefore uses NEW products. Old products and every
-- stored quote/order/subscription/payment keep their original authority.
DO $$
BEGIN
  IF (SELECT count(*) FROM jobvance_private.loop_price_revisions WHERE catalog_version='loop-local-2026-10-18-v2')<>54 THEN RAISE EXCEPTION 'LOOP_PRICE_V2_CATALOG_INCOMPLETE'; END IF;
END $$;
UPDATE jobvance_private.loop_price_revisions SET active=false WHERE catalog_version='loop-local-2026-10-18-v2';

WITH products(mode,plan,product_id) AS (VALUES
  ('live','weekly','pdt_0Nq0BYq7BdjAS4guEjnZR'),
  ('live','three_weekly','pdt_0Nq0Bq1C8qWpEc09hFc9l'),
  ('live','daily','pdt_0Nq0Bu1sW9DpHx9xCgY44'),
  ('test','weekly','pdt_0Nq0BV2xKSAg0QsPs1wUB'),
  ('test','three_weekly','pdt_0Nq0BnhoTfxXqCVqJMlpM'),
  ('test','daily','pdt_0Nq0B9zr7zYSVFmTP0APS')
)
INSERT INTO jobvance_private.loop_price_revisions(mode,catalog_version,plan,product_id,currency,amount_minor,exponent,usd_base_minor,tax_inclusive,provenance,active)
SELECT old.mode,'loop-local-2026-10-18-v3',old.plan,p.product_id,old.currency,old.amount_minor,old.exponent,old.usd_base_minor,old.tax_inclusive,
  old.provenance||jsonb_build_object('previousCatalogVersion',old.catalog_version,'productPolicy','new-immutable-provider-products-v3','priceDirection','Whole-unit v2 amounts preserved; old provider products and checkout sessions unchanged'),true
FROM jobvance_private.loop_price_revisions old JOIN products p ON p.mode=old.mode AND p.plan=old.plan
WHERE old.catalog_version='loop-local-2026-10-18-v2';

DO $$
BEGIN
  IF (SELECT count(*) FROM jobvance_private.loop_price_revisions WHERE catalog_version='loop-local-2026-10-18-v3')<>54
    OR (SELECT count(DISTINCT product_id) FROM jobvance_private.loop_price_revisions WHERE catalog_version='loop-local-2026-10-18-v3')<>6
    OR EXISTS(SELECT 1 FROM jobvance_private.loop_price_revisions fresh JOIN jobvance_private.loop_price_revisions old ON old.product_id=fresh.product_id AND old.catalog_version<>'loop-local-2026-10-18-v3' WHERE fresh.catalog_version='loop-local-2026-10-18-v3')
    THEN RAISE EXCEPTION 'LOOP_PRICE_NEW_PRODUCTS_REQUIRED'; END IF;
END $$;
COMMIT;
