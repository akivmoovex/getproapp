-- Read-only AC-V6-04 identity link audit queries.
-- Do not mutate rows. Do not select password_hash or raw secrets.
-- Run against a non-production database unless explicitly approved.

-- 1) Duplicate normalized phones on blessboard.users (global, any verification)
SELECT phone_normalized, count(*) AS user_count
  FROM blessboard.users
 WHERE phone_normalized IS NOT NULL
 GROUP BY phone_normalized
HAVING count(*) > 1
 ORDER BY user_count DESC, phone_normalized;

-- 2) Duplicate normalized emails on blessboard.users
SELECT email_normalized, count(*) AS user_count
  FROM blessboard.users
 WHERE email_normalized IS NOT NULL
 GROUP BY email_normalized
HAVING count(*) > 1
 ORDER BY user_count DESC, email_normalized;

-- 3) Users missing both phone and email (should be rare after contact_required)
SELECT id, status, created_at
  FROM blessboard.users
 WHERE email_normalized IS NULL
   AND phone_normalized IS NULL
 ORDER BY created_at;

-- 4) Conflicting verified phones (verified_at set, duplicated)
SELECT phone_normalized, count(*) AS user_count
  FROM blessboard.users
 WHERE phone_normalized IS NOT NULL
   AND phone_verified_at IS NOT NULL
 GROUP BY phone_normalized
HAVING count(*) > 1
 ORDER BY user_count DESC;

-- 5) Candidate deterministic links: unique verified phone, not yet linked
SELECT u.id AS blessboard_user_id,
       u.phone_normalized,
       u.phone_verified_at,
       u.platform_identity_id
  FROM blessboard.users u
 WHERE u.platform_identity_id IS NULL
   AND u.phone_normalized IS NOT NULL
   AND u.phone_verified_at IS NOT NULL
   AND u.phone_normalized IN (
     SELECT phone_normalized
       FROM blessboard.users
      WHERE phone_normalized IS NOT NULL
        AND phone_verified_at IS NOT NULL
      GROUP BY phone_normalized
     HAVING count(*) = 1
   )
 ORDER BY u.created_at;

-- 6) Candidate deterministic links: unique email (email-only uniqueness proxy;
--    prefer verified email when that column exists product-side)
SELECT u.id AS blessboard_user_id,
       u.email_normalized,
       u.platform_identity_id
  FROM blessboard.users u
 WHERE u.platform_identity_id IS NULL
   AND u.email_normalized IS NOT NULL
   AND u.email_normalized IN (
     SELECT email_normalized
       FROM blessboard.users
      WHERE email_normalized IS NOT NULL
      GROUP BY email_normalized
     HAVING count(*) = 1
   )
 ORDER BY u.created_at;

-- 7) Existing session owners (deployment-scoped; no token hashes)
SELECT ds.deployment_code,
       ds.user_id,
       ds.platform_identity_id,
       count(*) AS session_count
  FROM platform.deployment_sessions ds
 WHERE ds.revoked_at IS NULL
   AND ds.expires_at > now()
 GROUP BY ds.deployment_code, ds.user_id, ds.platform_identity_id
 ORDER BY ds.deployment_code, session_count DESC;
