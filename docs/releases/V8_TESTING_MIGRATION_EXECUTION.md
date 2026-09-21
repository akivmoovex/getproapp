# V8 Testing Database Migration Execution (PROMPT 24)

**Verdict:** `V8_TESTING_MIGRATIONS_PASS`  
**Branch:** `V8` @ `cf67166e` (preflight tip) · this report committed after apply  
**Recorded:** 2026-09-21  
**Precondition:** [`V8_HOSTED_QA_RELEASE_PREFLIGHT.md`](./V8_HOSTED_QA_RELEASE_PREFLIGHT.md) → `V8_HOSTED_QA_PREFLIGHT_PASS`  
**Runner:** `npm run db:migrate:testing` → `db/scripts/migrate-testing.js` (loads `.env.testing.local`)

### Explicit non-actions

| Action | Performed? |
|--------|------------|
| Deploy / restart Hostinger apps | **No** |
| Modify production database | **No** |
| Hosted write QA / tenant mutations | **No** |
| Reset / truncate / seed / delete tenant data | **No** (`seeds_applied: []`) |
| Apply unrelated pending migrations | **No** (only the seven approved files were pending) |

---

## 1. Safety check

| Check | Result |
|-------|--------|
| Current branch | `V8` (clean, tracking `origin/V8`) |
| Database identity | `moovex-platform-v7` / `testing` |
| Production rejected | Yes — `environment_code=testing`; migrate-testing refuses production |
| Pre-apply latest state | platform `038`, blessboard `109`, activeclinic `035` (unchanged since preflight) |
| Approved migrations pending | Exactly **7** · **0** other pending migrations · **0** pending seed applies needed |
| V7 compatibility findings | Still valid (additive supersets; preflight data CHECK simulation) |
| V8 deployment row | `moovex-platform-v8-testing` remains `active` |

**STOP conditions:** none triggered.

---

## 2. Migration files and checksums (SHA-256)

| Order | Module | Version | Filename | Disk checksum |
|------:|--------|---------|----------|---------------|
| 1 | platform | 039 | `039_shared_tenant_forms.sql` | `6f65becdd15eaa5dc2972f56aad5f70ecc1feb52af60964f9bff2953d6fdf088` |
| 2 | platform | 040 | `040_shared_form_submission_review.sql` | `343be66e9cb0acdb0475cb0c4862abf8964c7392abcf261c35cfb5358c348737` |
| 3 | platform | 041 | `041_activity_registration_v8.sql` | `12224e3f4a310dc13a8930a3378017418cbcdf3f609054ef6eabc549cf518a02` |
| 4 | platform | 042 | `042_shared_tenant_announcements.sql` | `e1b28101ca01d40de2a4bc52f280ff487cbe9f29cccdfb38e3b75d6858f6a995` |
| 5 | blessboard | 110 | `110_membership_workflow_v8.sql` | `b7dba3b4e048dc18d7c8be668dde2f35b0c481a9577e534268839459dd4e7be6` |
| 6 | blessboard | 111 | `111_announcement_schedule_v8.sql` | `af8c1903b63aabc1a64b48735b60c9584407e9a1d4ceec085e3b3dfee2203b15` |
| 7 | blessboard | 112 | `112_announcement_public_audience_v8.sql` | `097df550440fd7d2c96d30c4704a914770f3b5953cfad972d070ce0c5eed37a9` |

Ledger checksums after apply **MATCH** disk for all seven (`MATCH` verification).

---

## 3. Execution

**Command:**

```bash
npm run db:migrate:testing
# scripts/local/run-with-blessboard-env.sh testing node db/scripts/migrate-testing.js
```

**Env gate:** `DATABASE_IDENTITY_EXPECTED=moovex-platform-v7` · `DATABASE_IDENTITY_ENV=testing` · `DEPLOYMENT_ENV=testing` · `GETPRO_DATABASE_URL` unset

**Runner JSON summary:**

| Field | Value |
|-------|-------|
| `ok` | `true` |
| `identity_key` | `moovex-platform-v7` |
| `environment_code` | `testing` |
| `applied` | Exactly the seven approved filenames (platform 039→042, then blessboard 110→112) |
| `skipped` | 184 (already-applied migrations) |
| `seeds_applied` | `[]` |
| `seeds_skipped` | 001–009 (unchanged) |

**Per-migration ledger (applied_at UTC):**

| Migration | applied_at | execution_ms |
|-----------|------------|-------------:|
| platform/039 | 2026-09-21T09:16:00.429Z | 324 |
| platform/040 | 2026-09-21T09:16:01.031Z | 288 |
| platform/041 | 2026-09-21T09:16:01.677Z | 320 |
| platform/042 | 2026-09-21T09:16:02.129Z | 198 |
| blessboard/110 | 2026-09-21T09:16:12.165Z | 1123 |
| blessboard/111 | 2026-09-21T09:16:14.384Z | 239 |
| blessboard/112 | 2026-09-21T09:16:15.124Z | 424 |

**Errors:** none. No manual schema patches.

---

## 4. Schema verification (read-only after apply)

### 4.1 Ledger tip

| Module | Latest version | Filename |
|--------|----------------|----------|
| platform | **042** | `042_shared_tenant_announcements.sql` |
| blessboard | **112** | `112_announcement_public_audience_v8.sql` |
| activeclinic | 035 | `035_platform_contact_inquiries.sql` (unchanged) |

No unexpected migrations beyond the approved set.

### 4.2 New tables present

- `platform.tenant_forms`
- `platform.tenant_form_versions`
- `platform.tenant_form_access_tokens`
- `platform.tenant_form_submissions`
- `platform.tenant_form_submission_rate_limits`
- `platform.tenant_announcements`
- `platform.tenant_announcement_events`
- `blessboard.membership_intake_forms`
- `blessboard.member_registration_review_events`
- `blessboard.member_branch_transfer_requests`

### 4.3 New / extended columns (sample)

- `platform.tenant_forms`: `branch_id`, `require_consent`, `linked_resource_type`, `max_submissions`, `registration_closed`
- `platform.tenant_form_submissions`: `review_status`, `idempotency_key`, `consent_accepted_at`, `branch_id`
- `blessboard.member_registrations`: `intake_form_id`, `application_json`, `pastoral_notes`
- `blessboard.announcements`: `timezone`, `starts_at`, `ends_at`

### 4.4 Existing data still accessible

| Relation | Count after apply |
|----------|------------------:|
| `platform.organizations` | 90 |
| `blessboard.churches` | 27 |
| `blessboard.announcements` | 4 |
| `blessboard.announcement_audiences` | 5 (`members`×4, `admins`×1) |
| Deployments `moovex-platform-v8-testing` + `moovex-platform-testing` | 2 |

No tenant rows deleted or rewritten by this apply.

---

## 5. V7 compatibility results

| Check | Result |
|-------|--------|
| `inspectV7RuntimeSchemaCompatibility` (live testing DB) | `compatible: true`, `code: ok`, `missing: []`, all capability checks **ok** |
| Local `v7-runtime-schema-compatibility` + `v8-migration-contract` | **39/39 PASS** |
| Live V8 `/healthz` (BlessBoard) | `ok: true`, `deploymentCode=moovex-platform-v8-testing`, `expectedIdentityKey=moovex-platform-v7`, `schemaCompatible: true` |

---

## 6. Blockers

**None.**

Operational next step (out of this prompt): hosted write QA on disposable V8 tenants per [`V8_HOSTED_QA_RELEASE_PREFLIGHT.md`](./V8_HOSTED_QA_RELEASE_PREFLIGHT.md) §8.

---

## 7. Return code

```
V8_TESTING_MIGRATIONS_PASS
```

Database identity **`moovex-platform-v7` / `testing`**. Exactly the seven approved additive migrations are recorded as applied with matching checksums. V7 schema compatibility remains **ok**. No deploy, restart, production changes, or hosted write QA in this prompt.
