# ActiveClinic V6 — Platform Identity Architecture Decision (AC-V6-04)

**Status:** Approved for additive foundation implementation  
**Branch:** `V6`  
**Date:** 2026-08-03  
**Verdict target:** `ACTIVECLINIC_V6_IDENTITY_FOUNDATION_COMPLETE`

## 1. Current architecture

### 1.1 `blessboard.users` role

`blessboard.users` is today both:

1. **Authentication principal** — email/phone login, `password_hash`, status, last login.
2. **BlessBoard product profile** — display name, phone preferences, church-staff identity referenced by dozens of product FKs.

Phone-first (migrations 072–074): email is optional when phone is present; org-scoped staff phone uniqueness lives in `blessboard.organization_staff_phones`, not a global unique phone on `users`. Verification state: `phone_verified_at` (OTP); email verification is registration-application oriented, not a first-class `email_verified_at` on `users`.

### 1.2 Credential ownership today

| Concern | Location |
|--------|----------|
| Password hash | `blessboard.users.password_hash` (bcryptjs, 12 rounds; NULL only when `status='invited'`) |
| Forced password change | `blessboard.users.password_change_required` (migration 071) |
| Sign-in lockout | `blessboard.users.sign_in_locked_until` (migration 071) |
| Password reset tokens | `blessboard.user_action_tokens` (`purpose = password_reset`) → `user_id` |
| Phone OTP | `blessboard.phone_otp_verifications` → `user_id` |
| Invitations | `blessboard.user_invitations` → invitee/inviter `users` |

There is **no** `platform.users` table. Platform-neutral naming on `platform.identities` uses `must_change_password` / `locked_at` as the future equivalents of BlessBoard `password_change_required` / `sign_in_locked_until` (not dual-written in AC-V6-04).

### 1.3 Sessions and auth transfers

`platform.deployment_sessions.user_id` still FKs to `blessboard.users(id)` when set. As of **AC-V6-07**, sessions also support `platform_identity_id` as an ActiveClinic principal (`user_id` null), with a principal-presence CHECK and shared resolver/writer. Auth transfers gained optional `platform_identity_id` and purpose `activeclinic_login`; BlessBoard `tenant_login` behavior is unchanged. Cookies remain deployment-scoped (`blessboard_org_sid` / `activeclinic_org_sid`).

### 1.4 RBAC / audit / support

| Area | Principal |
|------|-----------|
| `blessboard.user_roles.user_id` | `blessboard.users` — **still the login/session role source** |
| `blessboard.user_role_assignments.user_id` | `blessboard.users` — modern scoped RBAC (coexists) |
| `platform.audit_events.actor_user_id` | Soft UUID (no FK); historically BlessBoard user ids |
| `platform.support_contexts.actor_user_id` | Soft UUID (no FK); same assumption |
| Platform admin directory | Operates on BlessBoard users / roles |

Full inventory from the AC-V6-04 dependency audit: **~93 FK columns across ~56 tables** reference `blessboard.users(id)`, mostly BlessBoard product-actor columns (giving, journey, pastoral, website, attendance, etc.). Those remain **B/F** — they stay on the BlessBoard profile, not on `platform.identities`.

### 1.5 Members vs authenticated users

`blessboard.members.user_id` may link a member record to a login profile; members themselves are not login principals and must not be conflated with platform identities.

---

## 2. Dependency map

```text
blessboard.users
  ├─ A/E  password_hash, password_change_required, sign_in_locked_until, login, reset, OTP
  ├─ A/E  platform.deployment_sessions.user_id
  ├─ A/E  platform.auth_transfers.user_id
  ├─ A/E  organization_staff_phones (org-scoped phone uniqueness; model reusable)
  ├─ B/E  user_roles (login path) + user_role_assignments (modern RBAC)
  ├─ B/E  invitations, action tokens
  ├─ B/F  pastoral, finance, journey, website, media, participation, members.user_id, …
  ├─ C/E  platform.audit_events.actor_user_id / support_contexts.actor_user_id (soft)
  ├─ C/E  support / platform admin tooling
  └─ D    (new) platform_identity_id → platform.identities
```

### Classification legend

| Code | Meaning |
|------|---------|
| A | Authentication identity dependency |
| B | BlessBoard product-profile dependency |
| C | Historical coupling |
| D | Safe to generalize now |
| E | Must remain temporarily compatible |
| F | Requires future migration |

| Dependency | Class |
|------------|-------|
| Login / bcrypt / email+phone lookup | A, E |
| `deployment_sessions.user_id` FK | A, E → F cutover |
| `auth_transfers.user_id` FK | A, E → F (same principal retarget as sessions) |
| `organization_staff_phones` uniqueness shape | A, D* (reuse model; retarget owner later), E |
| Password reset + invitations | A/B, E → F toward platform identity |
| `user_roles` (session establishment) | A, C, E |
| `user_role_assignments` | A/B, E (BlessBoard); ActiveClinic must not reuse this principal |
| Pastoral / finance / journey / website actor FKs | B, F (remain BlessBoard profile) |
| Audit / support soft `actor_user_id` | C, E → F (optional platform actor later) |
| Support mode / platform admin | C, E |
| Product profiles (future AC staff) | D (new link table) |

---

## 3. Evaluated options

### Option A — Separate `activeclinic.users` with credentials

- Duplicates passwords, phones, emails, reset flows.
- Dual-product humans need two accounts or unsafe sync.
- High security and maintenance cost.
- **Rejected.**

### Option B — Immediate global migration to `platform.users`

- Touches every FK, session row, auth path, and BlessBoard test.
- High rollback complexity; unacceptable blast radius on V6 before AC auth exists.
- **Rejected for now** (may be a late-stage cutover after dual-write proof).

### Option C — Additive platform identity bridge (**chosen**)

- Introduce product-neutral `platform.identities`.
- Keep `blessboard.users` as BlessBoard product profile + transitional credential owner.
- Link profiles via nullable `platform_identity_id` + `platform.identity_product_profiles`.
- Migrate authentication ownership gradually; no ActiveClinic login in this prompt.

---

## 4. Chosen design principles

1. One human → one `platform.identities` row (goal state).
2. Identity may link BlessBoard only, ActiveClinic only, or both.
3. Credentials are not duplicated per product.
4. Product access = `organization_products` + product roles — never inferred from identity existence.
5. Organization membership ≠ authentication.
6. Role assignments remain product-scoped principals during transition.
7–8. No cross-product permission inference from the other profile.
9–10. Phone-first ready; email optional where contact policy allows (at least one contact preferred for recoverable accounts).
11–12. Password reset and session revocation move to platform identity in later stages.
13–14. Product/clinical fields stay out of `platform.identities`.
15. Identity alone grants no org/product access.

---

## 5. Target schema (implemented)

### `platform.identities`

Product-neutral account: status, normalized phone/email + verification timestamps, optional `password_hash` (for future platform-owned credentials), `must_change_password`, `locked_at`, `suspended_at`, timestamps. No org/product/clinical columns.

### `platform.identity_product_profiles`

Explicit links: `(identity_id, product_key, profile_type, product_profile_id, status)`.  
Uniqueness: one profile per `(identity_id, product_key)`; one identity per `(product_key, product_profile_id)`.  
`product_profile_id` is **not** a polymorphic DB FK; application services validate profile existence for known `profile_type` values (`blessboard_user` now; `activeclinic_staff` later).

### `blessboard.users.platform_identity_id`

Nullable unique FK to `platform.identities`. Existing users remain valid unlinked.

### `platform.deployment_sessions.platform_identity_id`

Nullable FK only. Existing `user_id` FK and BlessBoard session writes unchanged. No cookie changes. No session invalidation.

---

## 6. Credential strategy (transition B)

**Chosen: BlessBoard hash remains canonical for BlessBoard login until an explicit credential cutover.**

- Linking a BlessBoard user to a platform identity does **not** copy `password_hash`.
- `platform.identities.password_hash` stays null for those linked rows.
- New platform-native identities (future ActiveClinic-only) may store hashes on `platform.identities`.
- Compatibility adapter exposes `platformIdentity` / `linkedProducts` without changing authenticate/reset services in this prompt.
- Future cutover: dual-verify → dual-write → platform-canonical → deprecate BlessBoard hash column.

---

## 7. Safe linking rules

Auto-link only with deterministic evidence:

- Controlled migration by existing user id mapping, or
- Unique normalized **verified** phone, or
- Unique normalized **verified** email, or
- Explicit administrator-approved link.

Do **not** auto-link on unverified/duplicate/ambiguous contacts or display names. Ambiguous sets are reported via read-only audit SQL under `db/scripts/audit/`.

---

## 8. Session migration path

| Stage | Behavior |
|-------|----------|
| AC-V6-04 | Nullable `platform_identity_id` on sessions; writers unused |
| **AC-V6-07 (now)** | Principal-presence CHECK; shared resolver + writers; AC identity sessions; AC auth transfers (`activeclinic_login`); BlessBoard legacy unchanged |
| Dual-write (future) | Linked BlessBoard login also sets `platform_identity_id` (controlled; not default yet) |
| Cutover | Resolve primarily by platform identity where linked; revoke by identity; credential path on identities |

**Resolution rule when both session columns set:** they must refer to a linked pair; otherwise reject as ambiguous.

Details: `ACTIVECLINIC_SESSION_PRINCIPAL_MIGRATION.md`, `ACTIVECLINIC_AUTH_TRANSFER_PRINCIPAL_MIGRATION.md`.

**Prerequisite for AC sessions:** satisfied for foundation — ActiveClinic sessions can exist without `blessboard.users`. Login UI / credential verification remain later stages.

---

## 9. RBAC migration path

| Product | Current principal | Future principal |
|---------|-------------------|------------------|
| BlessBoard | `blessboard.users.id` | Same profile id (linked to platform identity) |
| ActiveClinic | n/a | ActiveClinic staff/profile id (or platform identity + product assignment table) — **never** `blessboard.users` |

Shared platform roles (if any) should eventually key off `platform.identities.id`. No broad RBAC migration in this prompt.

---

## 10. Invitation / recovery (future; not implemented)

Phone-first and email invites, OTP, WhatsApp share, password reset, forced change, suspension, and multi-product recovery should target **platform identity** after credential cutover, while product invite tables remain product-specific for org/role payload. Foundation must not block these flows.

---

## 11. Compatibility strategy

- Unlinked BlessBoard users: login/logout/reset unchanged.
- Linked users: same, plus optional adapter fields.
- No session cookie rename; ActiveClinic cookie isolation unchanged.
- No production migration / deploy / push in this prompt.

---

## 12. Rollback

1. Stop writing new identity/link rows.
2. Drop additive FKs/columns/tables in reverse migration order if needed (`platform_identity_id` columns, then profile table, then identities).
3. BlessBoard auth paths never required the new tables, so rollback does not invalidate passwords or sessions.

---

## 13. Known risks

| Risk | Mitigation |
|------|------------|
| Ambiguous phone/email matches | No auto-link; audit queries |
| Premature hash copy | Forbidden; strategy B |
| Session principal ambiguity | AC-V6-07 CHECK + resolver/writer reject |
| Polymorphic profile ids | App validation + unique constraints; no DB cross-schema polymorphic FK |
| Accidental cross-product access | Identity ≠ enrolment; isolation tests remain |

---

## 14. Unresolved product decisions

1. Exact ActiveClinic staff profile table name and columns.
2. Whether AC RBAC assignments reference staff profile vs platform identity.
3. Timing of credential cutover and password-reset move.
4. Whether to backfill platform identities for all BlessBoard users or only dual-product / AC users.
5. Soft vs hard link unlink policy for support.

---

## 15. Gate notes

- **AC-V6-05** (healthcare org/facility): complete.
- **AC-V6-06** (staff/RBAC): complete.
- **AC-V6-07** (session/auth-transfer principals): complete — AC sessions without `blessboard.users` are supported.
- **ActiveClinic authentication (AC-V6-08):** may begin — session + transfer foundations ready; login UI and credentials still required.
