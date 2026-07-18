# Database implementation status

Last updated: 2026-07-18

## Phase: V5 final migration readiness audit — complete

| Item | Status |
|------|--------|
| `docs/database/V5_FINAL_MIGRATION_READINESS.md` | Done |
| Named V5 + migration suites | **37/37 PASS** |
| Local rehearsal | PASS |
| Verdict | **READY WITH MANUAL CONDITIONS** |
| Hosted rehearsal / cutover | **Not done** |

## Prior: V5 hosted migration & cutover runbook — documented (not executed)

| Item | Status |
|------|--------|
| `docs/database/V5_HOSTED_MIGRATION_AND_CUTOVER.md` | Done |
| Preconditions, execution, rollback, go/no-go, sign-off | Done |
| Hosted cutover execution | **Not started** |

## Prior: V4→V5 local migration rehearsal — complete

| Item | Status |
|------|--------|
| Representative local V4 fixture + empty V5 target | Done |
| plan → dry-run → apply → verify → second apply | Done |
| Count reconciliation (no rule weakening) | Done |
| Application smoke tests + batch rollback rehearsal | Done |
| `docs/database/V4_TO_V5_MIGRATION_REHEARSAL.md` | Done |
| `npm run migrate:v4-to-v5:rehearsal` | Done |

## Prior: V4→V5 migration tooling (dry-run default) — complete

| Item | Status |
|------|--------|
| CLI: plan / dry-run / apply / verify | Done |
| Explicit env: `V4_SOURCE_*` / `V5_TARGET_*` / `DATABASE_IDENTITY_EXPECTED` | Done |
| Source read-only; same-DB refuse; identity gate; `--confirm` for apply | Done |
| Checkpoints, bounded transactions, deterministic IDs, report JSON | Done |
| Destructive source writes / auto-startup | Forbidden |
| `npm run test:migration:tooling` | Done |

## Prior: V4→V5 data mapping inventory (design only) — complete

| Item | Status |
|------|--------|
| `docs/database/V4_TO_V5_DATA_MAPPING.md` | Done |
| Extract / transform / load interfaces (dry-run) | Done |
| Deterministic ID map + checkpoint + reconciliation report | Done |
| Fixture mapping tests | Done |
| Destructive V5 load / hosted extract | **Not started** |
| `npm run test:migration:mapping` | Done |

## Prior: Plans + subscription entitlements — complete

| Item | Status |
|------|--------|
| `platform.plans` / `plan_features` (immutable `plan_key`) | Done |
| `organization_subscriptions` + `organization_entitlements` overrides | Done |
| Central entitlement service (fail-closed writes; soft public reads) | Done |
| Branch / staff limit enforcement (transactional; no destructive downgrade) | Done |
| Seeds from approved public pricing (free/growth/professional/partner) | Done |
| No billing / payment collection | Deferred |
| `npm run test:platform:entitlements` | Done |

## Prior: HQ reports + immutable audit events — complete

| Item | Status |
|------|--------|
| `platform.audit_events` (append-only) | Done |
| Metadata redaction (no secrets / full PII) | Done |
| Retention policy (`docs/database/AUDIT_RETENTION.md`) | Done |
| HQ read-only operational reports | Done |
| Audit pagination by org/church/action | Done |
| `npm run test:blessboard:reports-audit` | Done |

## Prior: Resources, forms, and member requests — complete

| Item | Status |
|------|--------|
| `resources` / `forms` / `form_submissions` / `member_requests` / `member_request_status_history` | Done |
| Controlled form schema (allowlisted field types only) | Done |
| Member submission privacy; admin branch/church scope | Done |
| Request workflow submitted→in_review→resolved→closed + member-visible history | Done |
| Private attachments for resources/requests | Done |
| `npm run test:blessboard:forms-requests` | Done |

## Prior: Manual giving summaries — complete

| Item | Status |
|------|--------|
| `giving_categories` / `giving_entries` | Done |
| NUMERIC(14,2) amounts; ISO currency; no float | Done |
| draft → submitted → approved → void (no delete) | Done |
| Branch records own branch; HQ church-wide monthly | Done |
| No donor PII / cards / banks / payment gateway | Done |
| `npm run test:blessboard:giving` | Done |

## Prior: Aggregate attendance — complete

| Item | Status |
|------|--------|
| `attendance_events` / `attendance_entries` | Done |
| draft → submitted → approved → archived workflow | Done |
| Explicit amendment policy (submitted edits revert to draft) | Done |
| Monthly summaries from real entry sums (no fake analytics) | Done |
| Branch-scoped admin + HQ church-wide visibility | Done |
| `npm run test:blessboard:attendance` | Done |

## Prior: Member participation (events + ministries) — complete

| Item | Status |
|------|--------|
| `ministry_memberships` / `event_registrations` | Done |
| Open join + request/approve ministry workflows | Done |
| Event register / cancel; optional capacity | Done |
| HQ / branch admin participation views (privacy-limited) | Done |
| Leader recommendation deferred | Done |
| `npm run test:blessboard:participation` | Done |

## Prior: Announcements + read tracking — complete

| Item | Status |
|------|--------|
| `announcements` / `announcement_audiences` / `announcement_reads` / `announcement_attachments` | Done |
| Draft / published / archived; church-wide or branch; members + admins audiences | Done |
| Publish confirmation; pinned/featured; action link; media attachments | Done |
| Member list / detail / mark-read; derived delivery counts | Done |
| HQ / branch admin CRUD; platform inspect without silent publish | Done |
| `npm run test:blessboard:announcements` | Done |

## Prior: Member portal shell + profile — complete

| Item | Status |
|------|--------|
| `GET /member`, `GET/POST /member/profile` | Done |
| Membership gate (active user + member + branch membership + tenant) | Done |
| Admin roles alone do **not** grant member access | Done |
| Low-risk profile edits (preferred name, phone, email display) | Done |
| Announcements module enabled; other modules still placeholders | Done |
| No member/church/branch UUIDs in URLs or HTML (except announcement entity ids) | Done |
| `npm run test:blessboard:member-portal` | Done |

## Prior: Member registration + branch verification — complete

| Item | Status |
|------|--------|
| Public `GET/POST /register`, `GET /register/submitted` | Done |
| Host-derived church + primary branch (no client IDs) | Done |
| CSRF + rate limiting on public submit | Done |
| Branch-admin list / detail / approve / reject | Done |
| Pagination + bounded search | Done |
| Generic duplicate messaging; no PII in logs | Done |
| No automatic account creation on approve | Done |
| `npm run test:blessboard:member-registration` | Done |

## Prior: Member identity foundation — complete

| Item | Status |
|------|--------|
| `members` / `member_branch_memberships` / `member_registrations` | Done |
| Services submit / review / approve / reject / link | Done |
| `npm run test:blessboard:members-schema` | Done |

## Prior: Media uploads — complete

| Item | Status |
|------|--------|
| `npm run test:blessboard:media` | Done |

## Architecture commitments (current)

- Public registration uses authoritative hostname → church + primary branch only.
- Branch-admin review is manager-gated; rejection notes are internal; approve creates/links member without login accounts.
- Member portal is membership-gated on the host primary branch; admin roles alone never imply portal access.
- V4 remains on `server.legacy.js` unchanged.

## Local suites

```bash
npm run test:blessboard:attendance
npm run test:blessboard:participation
npm run test:blessboard:announcements
npm run test:blessboard:member-portal
npm run test:blessboard:member-registration
npm run test:blessboard:members-schema
npm run test:blessboard:media
npm run test:blessboard:content-admin
```

## Exact next phase recommendation

Optional account-linking during registration approval, or giving summaries.
