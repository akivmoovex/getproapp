# BlessBoard QA role users

**TESTING / DEMO ONLY — NEVER USE IN PRODUCTION**

Standardized QA accounts for BlessBoard role testing on **`demo-church`**.

## Seed command

```bash
scripts/local/run-with-blessboard-env.sh testing \
  npm run blessboard:seed-qa-role-users -- --confirm --password=1234567890
```

Guards:

* `environment_code` must be `testing` (or `demo`)
* `DATABASE_IDENTITY_EXPECTED` must match (`moovex-platform-v7` on V7)
* refuses production
* organization key must be `demo-church`

## Shared QA password

`1234567890` (testing only; satisfies min length 10)

Login: **email or phone** + shared password via `authenticateBlessBoardUser`.

## Phone range

Reserved BlessBoard QA phones (Zambia):

`+260971000001` … (sequence)

ActiveClinic QA uses `+260970000001`–`015` — do not collide.

**DEMO PHONE — DO NOT SEND** (SMS/WhatsApp/OTP).

## Login baseline (product rule)

BlessBoard staff sessions require a legacy `blessboard.user_roles` row
(`platform_admin` | `church_hq_admin` | `branch_admin`).

Catalogue RBAC assignments alone do **not** establish a session.

Each catalogue QA user therefore receives:

1. The proven legacy login baseline for its scope
2. Exactly one catalogue `user_role_assignments` row for the target role

## Email pattern

`qa.<role_key>@demo-church.example.test`

## Excluded from BlessBoard QA coverage

* All `activeclinic_*` roles (other product)
* `visitor` (not staff-assignable in HQ UI)
* `member` (member portal membership identity)
* `platform_administrator` (covered by legacy `platform_admin`)
