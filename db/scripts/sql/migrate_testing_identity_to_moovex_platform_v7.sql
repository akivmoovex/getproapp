-- TESTING-ONLY identity key rename (manual / controlled).
-- DO NOT run against production.
-- Preferred: npm run db:identity:migrate-testing-to-moovex-v7 -- --confirm migrate-testing-identity-to-moovex-platform-v7
-- Prerequisites:
--   1. DATABASE_URL points at the testing database (project distinct from production)
--   2. SELECT identity_key, environment_code FROM platform.database_identity WHERE id = 1
--      shows environment_code = 'testing' and identity_key = 'blessboard-platform-v5'
--   3. Application / Hostinger expect DATABASE_IDENTITY_EXPECTED=moovex-platform-v7
-- Rollback:
--   UPDATE platform.database_identity
--   SET identity_key = 'blessboard-platform-v5', updated_at = now()
--   WHERE id = 1 AND environment_code = 'testing' AND identity_key = 'moovex-platform-v7';

UPDATE platform.database_identity
SET identity_key = 'moovex-platform-v7',
    updated_at = now()
WHERE id = 1
  AND environment_code = 'testing'
  AND identity_key = 'blessboard-platform-v5';
