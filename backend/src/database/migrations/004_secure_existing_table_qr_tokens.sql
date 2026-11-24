BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

WITH token_updates AS (
  SELECT
    id,
    replace(replace(replace(encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'), '=', '') AS qr_token
  FROM restaurant_tables
  WHERE qr_token LIKE 'table-%-secure-token'
     OR qr_code_data IS NULL
     OR qr_code_data NOT LIKE '/menu/%/%'
)
UPDATE restaurant_tables
SET qr_token = token_updates.qr_token,
    qr_code_data = '/menu/' || restaurant_tables.table_number || '/' || token_updates.qr_token
FROM token_updates
WHERE restaurant_tables.id = token_updates.id;

COMMIT;
