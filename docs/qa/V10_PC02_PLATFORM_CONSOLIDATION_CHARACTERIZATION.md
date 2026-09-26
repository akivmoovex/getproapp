# V10 PC02 — Platform Consolidation Characterization

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC02_PLATFORM_CONSOLIDATION_CHARACTERIZATION` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisite** | `V10_PC01_CONSOLIDATION_PREFLIGHT_PASS` |
| **Verdict** | **`PLATFORM_CONSOLIDATION_CHARACTERIZATION_PASS`** |
| **Production code changed** | **NO** |
| **Deploy / production** | **NOT TOUCHED** |

---

## 1. Purpose

Protect existing BB + AC + platform behavior before extracting shared infrastructure.

Characterization captures **current intended behavior**, including known product differences. It does **not** redesign product semantics.

---

## 2. Artifacts added

| Path | Role |
|------|------|
| `tests/v10-pc02-platform-consolidation-characterization.test.js` | Platform contracts + BB/AC adapter contracts + security HTTP characterization |
| `docs/qa/V10_PC02_PLATFORM_CONSOLIDATION_CHARACTERIZATION.md` | This evidence record |

No production implementation seams were required.

---

## 3. Coverage map

| Area | How covered |
|------|-------------|
| BB + AC website editor routes | Static shared/product-only route inventory + HTTP auth matrix |
| Publish / preview / version | HTTP: unauth deny; auth draft → publish (BB + AC); shared editor suite regression |
| Registration orchestration | `getAdapter` export-surface parity; draft lifecycle sanitize / `gpRegNav` |
| Registration drafts | Cookie-name twins, HMAC write/read, tamper reject, password strip |
| Verification | Wrapper export contracts; subjectKind / productKey divergence documented |
| Auth / session / password | Shared password policy; V7 vs V8 session cookie isolation; signing secret |
| Phone normalization | ZM national ↔ E.164 parity (relaxed); required empty reject |
| Media upload validation | JPEG accept; SVG reject; oversize reject (`validateImageUpload`) |
| Tenant isolation | `rejectForgedTenantIdentifiers`; middleware probe; AC orgA↛orgB website mutate |
| RBAC allow/deny | Website permission grants (editor vs reviewer publish); restore helpers |

Security priorities exercised:

- forged tenant/org IDs (unit + middleware)
- unauthenticated website draft/publish (BB + AC → deny)
- cross-tenant AC website mutation → deny
- restricted publish permission catalogue (editor lacks `website.publish`)

---

## 4. Test results

### Suite A — PC02 characterization only

```text
node --test --test-concurrency=1 \
  tests/v10-pc02-platform-consolidation-characterization.test.js
```

| Metric | Result |
|--------|--------|
| tests | **22** |
| pass | **22** |
| fail | **0** |

### Suite B — PC02 + shared BB/AC / platform baselines

```text
node --test --test-concurrency=1 \
  tests/v10-pc02-platform-consolidation-characterization.test.js \
  tests/v2-03-platform-shared-foundation.test.js \
  tests/v7-bb-ac-phone-parity.test.js \
  tests/v7-shared-phone-identity.test.js \
  tests/v8-shared-verification.test.js \
  tests/v8-shared-validation.test.js \
  tests/v8-shared-session-security.test.js \
  tests/v8-shared-rbac-tenant-isolation.test.js \
  tests/v7-shared-website-authorization-entrypoint.test.js \
  tests/v7-shared-registration-country-selection.test.js \
  tests/v7-shared-website-editor.test.js
```

| Metric | Result |
|--------|--------|
| tests | **126** |
| pass | **126** |
| fail | **0** |

Failures: **none**.

---

## 5. BB vs AC behavior differences discovered (current, intentional)

These are **characterization findings**, not defects to “fix” in PC02:

| Topic | BlessBoard | ActiveClinic |
|-------|------------|--------------|
| Website content key (hero title) | `home.hero.heading` | `home.hero.title` |
| Public editor URL shape | `/c/:orgKey/...` (+ branch redirect) | `/clinics/:clinicKey/...` |
| Product-only editor routes | `media-library` | `submit`, `unpublish`, `versions/:id/restore`, `edit-session/finish` |
| Verification subject | `blessboard_user` | `platform_identity` |
| Verification productKey | `blessboard` | `activeclinic` |
| Registration draft cookie | `bb_reg_draft` | `ac_reg_draft` |
| Draft crypto isolation | Cookie-name only — **payload HMAC is not product-keyed** (same `SESSION_SECRET` / format). Renaming cookie value across products still verifies. | Same |
| Phone field ownership | Platform owns partial + `/platform/phone-field.*`; AC paths are shims | Includes platform SoT |
| Publish path depth | Large church publish pipeline still exists beside shared engine | Leaner shared `publicationService` + submit/unpublish |

---

## 6. Gates

| Gate | Status |
|------|--------|
| `PLATFORM_CONSOLIDATION_CHARACTERIZATION_PASS` | **SATISFIED** |
| `V10_CLEAN_CHECKPOINT_CREATED` | Still required before architecture extraction |
| Architecture refactor (PC01 dependency inversion, etc.) | **NOT STARTED** |

---

## 7. Cross-references

- [`docs/qa/V10_PC01_CONSOLIDATION_PREFLIGHT.md`](./V10_PC01_CONSOLIDATION_PREFLIGHT.md)
- [`docs/v2.03/V2_03_PLATFORM_CONSOLIDATION_BACKLOG.md`](../v2.03/V2_03_PLATFORM_CONSOLIDATION_BACKLOG.md) (`PLATFORM-CONSOLIDATION-00`)

```text
PLATFORM_CONSOLIDATION_CHARACTERIZATION_PASS
APPLICATION_CODE_CHANGED: NO
IMPLEMENTATION_EXTRACTION_STARTED: NO
```
