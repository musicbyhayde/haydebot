-- Give every existing quote (leads.Quote_Data.quotes[*]) a random public-link token.
-- Not needed while QUOTE_LEGACY_ID_LINKS=true (old /quote/<lead id> links still work and the
-- app adds tokens on the next save). Run it BEFORE setting QUOTE_LEGACY_ID_LINKS=false so the
-- dashboard can share token links for quotes nobody edited. Existing tokens are kept.
-- Token: 24 random bytes, base64url -> 32 chars (same format as app/services/quote_links.py).
-- Undo: tokens are additive; old id links work again by setting QUOTE_LEGACY_ID_LINKS=true.

-- Dry run (read-only): quotes that would get a token
SELECT count(*) AS leads, sum(n) AS quotes FROM (
  SELECT (SELECT count(*) FROM jsonb_array_elements(l."Quote_Data"->'quotes') q
           WHERE jsonb_typeof(q) = 'object' AND NOT (q ? 'token')) AS n
  FROM public.leads l
  WHERE jsonb_typeof(l."Quote_Data"->'quotes') = 'array'
) x WHERE n > 0;

BEGIN;
UPDATE public.leads l
SET "Quote_Data" = jsonb_set(l."Quote_Data", '{quotes}', (
      SELECT jsonb_agg(
               CASE WHEN jsonb_typeof(q) = 'object' AND NOT (q ? 'token')
                    THEN q || jsonb_build_object('token',
                           translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'))
                    ELSE q END
               ORDER BY ord)
      FROM jsonb_array_elements(l."Quote_Data"->'quotes') WITH ORDINALITY AS e(q, ord)))
WHERE jsonb_typeof(l."Quote_Data"->'quotes') = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(l."Quote_Data"->'quotes') q
              WHERE jsonb_typeof(q) = 'object' AND NOT (q ? 'token'));
SELECT count(*) AS quotes_without_token FROM public.leads l, jsonb_array_elements(l."Quote_Data"->'quotes') q
 WHERE jsonb_typeof(l."Quote_Data"->'quotes') = 'array' AND NOT (q ? 'token');   -- expect 0
COMMIT;
