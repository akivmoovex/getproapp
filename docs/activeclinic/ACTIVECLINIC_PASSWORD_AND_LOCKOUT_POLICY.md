# ActiveClinic V6 — Password and Lockout Policy

**Stage:** AC-V6-08

## Password policy

Matches BlessBoard / platform admin policy:

- Minimum length **10**
- Maximum length **200**
- Hashing: **bcryptjs**, cost **12**
- Never log or return password values or hashes

## Platform identity fields

| Column | Purpose |
|--------|---------|
| `password_hash` | Optional platform credential |
| `must_change_password` | Restrict to change-password + logout |
| `failed_sign_in_count` | Failed attempts |
| `sign_in_locked_until` | Temporary lockout end |
| `locked_at` | Manual/admin lock |
| `last_sign_in_at` | Last successful sign-in |
| `credentials_updated_at` | Last password change |

## Lockout

- Threshold: **8** failed attempts
- Duration: **15 minutes** (`sign_in_locked_until`)
- Successful login clears failure count and temporary lock
- Public responses remain generic (`invalid_credentials`)
- HTTP rate limit: 20 attempts / 15 minutes per identifier+IP (raised in test)

## Forced password change

When `must_change_password` is true:

- `/app` redirects to `/account/change-password`
- Current password required; new password confirmed and policy-checked
- Other ActiveClinic sessions for the identity in the deployment are revoked
- BlessBoard sessions are not revoked by default
