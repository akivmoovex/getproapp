# BlessBoard V5 platform-admin password reset

Restore access to the apex platform-admin console without printing secrets.

## Login path

1. `https://blessboard.org/login` (email + password)
2. `https://blessboard.org/admin`

## List existing platform administrators (read-only)

```bash
npm run blessboard:user:list-platform-admins
```

Requires `DATABASE_URL` and `DATABASE_IDENTITY_EXPECTED`. Does **not** use `GETPRO_DATABASE_URL`.

## Preview password reset

```bash
printf '%s' '<NEW_TEMP_PASSWORD>' | npm run blessboard:user:password-reset -- \
  --email '<PLATFORM_ADMIN_EMAIL>' \
  --password-stdin
```

Dry-run is the default. Reports normalized email, account status, whether an active `platform_admin` role exists, sessions that would be invalidated, and password policy result. No write occurs.

## Confirm password reset

```bash
printf '%s' '<NEW_TEMP_PASSWORD>' | npm run blessboard:user:password-reset -- \
  --email '<PLATFORM_ADMIN_EMAIL>' \
  --password-stdin \
  --confirm
```

Behavior:

- Validates password with the same rules as `blessboard:user:create` (length 10–200).
- Hashes with bcrypt cost **12**.
- Updates `blessboard.users.password_hash` and `password_changed_at`.
- Revokes all non-revoked `platform.deployment_sessions` for that user in the same transaction.
- Writes audit `user.password_reset` when an organization scope is available.
- Rejects `--password` argv (stdin only).
- Never prints the password or hash.

## Create a platform administrator (explicit only)

Do **not** bootstrap admins on startup, deploy, migrate, seed, or tests.

```bash
printf '%s' '<TEMP_PASSWORD>' | npm run blessboard:user:create -- \
  --email '<PA_EMAIL>' \
  --display-name 'Platform Admin' \
  --password-stdin \
  --confirm

npm run blessboard:user:role:assign -- \
  --email '<PA_EMAIL>' \
  --organization-key '<EXISTING_ORG_KEY>' \
  --role platform_admin \
  --confirm
```
