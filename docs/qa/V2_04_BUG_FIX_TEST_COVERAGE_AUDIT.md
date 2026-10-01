# V2.04 Bug-Fix Automated Test Coverage Audit

**Mode:** Coverage updated after PLATFORM-PASSWORD-UX-01 fix.  
**Date:** 2026-10-02  
**Input:** `docs/qa/V2_04_RECENT_BUG_FIX_AUDIT.md`  
**Question:** For each recent bug with an implementation fix (or required minimum coverage), does a focused automated regression exist that would fail if the bug returned?

---

## Coverage summary

| BUG_ID | Impl status | Coverage STATUS | WOULD_FAIL_BEFORE_FIX | WOULD_CATCH_REGRESSION |
|--------|-------------|-----------------|----------------------:|-----------------------:|
| REG-STATE-01 | FIXED | **STRONG** | YES | YES |
| BB-PROVISION-01 | FIXED | **STRONG** | YES | YES |
| BB-REG-WEB-01 | FIXED | **STRONG** | YES | YES |
| AC-REG-WEB-01 | FIXED | **STRONG** | YES | YES |
| PLATFORM-PASSWORD-UX-01 | FIXED | **STRONG** | YES | YES |
| AC-INITIAL-DIRTY-STATE-01 | FIXED | **STRONG** | YES | YES |
| AC-SEC-01 | FIXED | **STRONG** | YES | YES |
| AC-SEC-02 | FIXED | **STRONG** | YES | YES |

`AC-WEB-EDITOR-01` hub chrome is **FIXED** (`tests/ac-web-editor-01-management-hub.test.js`). Post-reg half remains covered by AC-REG-WEB-01 tests.

---

## BUG_ID: REG-STATE-01

### IMPLEMENTATION_FIX
Shared draft hydrate-on-GET (`resolveRegistrationDraftForGet`); merge does not erase omitted prior fields; clear only on fresh/complete.

### TEST_FILE
- `tests/v2-04-platform-multi-step-form-state.test.js`
- `tests/v2-04-bb-multi-step-registration-draft.test.js`
- `tests/v2-04-ac-multi-step-registration-draft.test.js`

### TEST_NAME/SCENARIO
| Minimum requirement | Covered by |
|---------------------|------------|
| Previous-step data preserved | platform `1 merge Step 1 + Step 2`; BB `11`; AC `14` |
| Refresh/back | platform `4/5 refresh and back navigation hydrate without gpRegNav`; BB `11` (PRG + refresh); AC `14` |
| Omitted later-step fields do not erase earlier | platform `2 missing Step 1 fields in Step 2 POST do not clear them` |
| Sessionless draft | BB/AC HTTP registration flows (no login session); cookie draft only — matches SESSIONLESS_FLOW in impl doc |
| Cross-draft isolation | platform `8 cross-user / cross-product draft denial` |

### POSITIVE_PATH
YES — hydrate/merge/preserve across steps and products.

### NEGATIVE_PATH
YES — expired/invalid draft (`7`), tampered signature (`9`), protected keys (`protected keys…`), passwords excluded.

### AUTHZ/TENANT_PATH
YES — separate cookie names / cross-product denial (`8`).

### WOULD_FAIL_BEFORE_FIX
**YES** — pre-fix GET without `gpRegNav` cleared drafts; `4/5` and BB/AC refresh cases would fail.

### WOULD_CATCH_REGRESSION
**YES**

### STATUS
**STRONG**

---

## BUG_ID: BB-PROVISION-01

### IMPLEMENTATION_FIX
`buildAdministratorRoleAssignInput` prefers canonical `userId` / identity email; avoids unmatched registration email for role assign.

### TEST_FILE
`tests/v2-04-bb-church-provisioning-phone-reuse.test.js`

### TEST_NAME/SCENARIO
| Minimum requirement | Covered by |
|---------------------|------------|
| Phone-matched existing identity | `B/C: existing identity matched by phone + different email` |
| Different submitted email | same `B/C` (`registrationEmail` ≠ identity email) |
| Canonical identity for admin assignment | `B/C` asserts `administratorUserId === existingUserId`; unit `buildAdministratorRoleAssignInput prefers userId…`; `assignBlessBoardRole with userId…` |
| Multi-church admin | `D: existing admin of Church A becomes admin of new Church B; A roles untouched` |
| Rollback/retry | `F: provisioning failure rolls back…`; `G: safe retry after rollback…` |
| Cross-tenant isolation | `H: cross-tenant permissions remain isolated` |

### POSITIVE_PATH
YES — brand-new (`A`), phone-reuse (`B/C`), multi-church (`D`), same-email (`I`).

### NEGATIVE_PATH
YES — rollback (`F`); `mapRoleAssignmentFailureStatus: user_not_found is not database_conflict`.

### AUTHZ/TENANT_PATH
YES — `H` no roles on foreign org; `D` Church A roles untouched.

### WOULD_FAIL_BEFORE_FIX
**YES** — `B/C` / unit assign helpers would fail when email mismatch broke role assign.

### WOULD_CATCH_REGRESSION
**YES**

### STATUS
**STRONG**

---

## BUG_ID: BB-REG-WEB-01

### IMPLEMENTATION_FIX
Primary success CTA → canonical `/c/:org/:branch?website_edit=1&website_mode=draft`; `/hq` secondary.

### TEST_FILE
`tests/blessboard-bb-reg-web-01-editor-route.test.js`

### TEST_NAME/SCENARIO
| Minimum requirement | Covered by |
|---------------------|------------|
| Edit Website CTA uses canonical BB edit URL | `A–F + J` asserts `href === expectedEdit`, not `/hq` |
| Correct org/branch | resolver + `G: correct organization/branch…` distinct CTAs |
| Edit mode + draft mode | asserts `website_edit=1` and `website_mode=draft` on path |
| Seeded content visible | `A–F` matches church name on editor GET |

### POSITIVE_PATH
YES — register → success CTA → editor 200 + content.

### NEGATIVE_PATH
YES — `I` failed provision off editor; `H` cross-tenant withholds CTA.

### AUTHZ/TENANT_PATH
YES — `H` foreign ref + other session.

### WOULD_FAIL_BEFORE_FIX
**YES** — primary CTA was `/hq`; assertion `href === expectedEdit` / `doesNotMatch(/^\/hq/)` would fail.

### WOULD_CATCH_REGRESSION
**YES**

### STATUS
**STRONG**

---

## BUG_ID: AC-REG-WEB-01

### IMPLEMENTATION_FIX
Success `editPath` = `buildPublicWebsiteEditPath` → `/clinics/:clinicKey?website_edit=1&website_mode=draft` (hub retained separately).

### TEST_FILE
`tests/activeclinic-ac-post-reg-editor-route.test.js`

### TEST_NAME/SCENARIO
| Minimum requirement | Covered by |
|---------------------|------------|
| CTA uses `/clinics/:clinicKey?website_edit=1&website_mode=draft` | `A–F` exact equality + HTML href |
| Dynamic clinicKey | `G` distinct clinics / distinct destinations |
| Seeded content visible | `A–F` matches `clinicName` + welcome/hero markers |

### POSITIVE_PATH
YES — success CTA + authorized edit GET.

### NEGATIVE_PATH
YES — `H` cross-tenant editor denied.

### AUTHZ/TENANT_PATH
YES — `H`; owning admin `I` still opens edit mode.

### WOULD_FAIL_BEFORE_FIX
**YES** — CTA previously hub; `doesNotMatch(/\/app\/settings\/website/)` / exact public edit path would fail.

### WOULD_CATCH_REGRESSION
**YES**

### STATUS
**STRONG**

---

## BUG_ID: PLATFORM-PASSWORD-UX-01

### IMPLEMENTATION_FIX
AC `register-clinic.ejs` administrator branch calls shared `GpRegistrationPasswordRules.init` when `#password` exists. Shared partial + JS unchanged. BB continues to init the same component on admin password step. Canonical policy remains length-only (min/max); server validation not weakened.

### TEST_FILE
`tests/platform-password-ux-01.test.js`

### TEST_NAME/SCENARIO
| Minimum requirement | Covered by |
|---------------------|------------|
| AC password step initializes shared component | **A** |
| AC live typing updates `.is-met` | **B** |
| BB shared component still initializes | **C** |
| BB live typing updates `.is-met` | **D** |
| Short invalid password rejected by server | **E** |
| Valid password accepted (canonical pair) | **F** |
| Displayed requirements match server rules | **G** |

### POSITIVE_PATH
YES — A/C init markup; B/D live met; F valid pair

### NEGATIVE_PATH
YES — E short password 400; F mismatch / over-max

### AUTHZ/TENANT_PATH
N/A

### WOULD_FAIL_BEFORE_FIX
**YES** — A would fail if `init` returned to clinic-only `else`; B/D fail without shared live evaluator; G fails if AC/BB omit rule ids or invent uppercase/special rules.

### WOULD_CATCH_REGRESSION
**YES**

### STATUS
**STRONG**

---

## BUG_ID: AC-INITIAL-DIRTY-STATE-01

### IMPLEMENTATION_FIX
Platform `shouldAlignPublishedBaseline` defaults true; BB engine seed aligns; repair helper for legacy dirty.

### TEST_FILE
`tests/v2-04-initial-website-unpublished-count.test.js`

### TEST_NAME/SCENARIO
| Minimum requirement | Covered by |
|---------------------|------------|
| Newly provisioned count = 0 | `A+F` AC; `B` BB |
| Real edit → count > 0 | `C+D+E` |
| Reverting removes dirty | `C+D+E` revert → `pendingChangeCount === 0` |
| Publish → 0 | `C+D+E` publish → 0 |
| System metadata does not create false changes | `G+H` version metadata changeCount noise → still 0 until real edit |

### POSITIVE_PATH
YES

### NEGATIVE_PATH
YES — characterization `publishStarter=false` → 63; repair dry-run vs confirm.

### AUTHZ/TENANT_PATH
N/A for count semantics (Change Manager auth covered in foundation suite separately).

### WOULD_FAIL_BEFORE_FIX
**YES** — `A+F` would see ~63 instead of 0.

### WOULD_CATCH_REGRESSION
**YES**

### STATUS
**STRONG**

---

## BUG_ID: AC-SEC-01

### IMPLEMENTATION_FIX
Portal prefs use `platform.communication_preferences`; ignore fake `?saved=1`; success only after POST.

### TEST_FILE
`tests/activeclinic-ac-sec-01-preferences.test.js`

### TEST_NAME/SCENARIO
| Minimum requirement | Covered by |
|---------------------|------------|
| No fake save if non-authoritative **OR** durable persistence if authoritative | **Authoritative EXISTING_STORE:** `D/E/F` denies `?saved=1` success; POST persists DB rows; reload keeps values |

### POSITIVE_PATH
YES — authenticated render (`A`); real save (`D/E/F`).

### NEGATIVE_PATH
YES — unauth (`B`); forged POST; fake query success.

### AUTHZ/TENANT_PATH
YES — `C` other tenant clinic context denied.

### WOULD_FAIL_BEFORE_FIX
**YES** — fake `?saved=1` would match success markers; suite asserts they are absent.

### WOULD_CATCH_REGRESSION
**YES**

### STATUS
**STRONG**

---

## BUG_ID: AC-SEC-02

### IMPLEMENTATION_FIX
Catalogue denies reception clinical perms; HTTP enforces 403; suite proves no body leak.

### TEST_FILE
`tests/activeclinic-ac-sec-02-reception-clinical-notes.test.js`

### TEST_NAME/SCENARIO
| Minimum requirement | Covered by |
|---------------------|------------|
| Receptionist direct URL denied | `same-tenant receptionist: direct URL + note POST denied…` (403 on encounter GET) |
| No restricted note body returned | `assertNoNoteLeak` on GET/POST/JSON |
| Practitioner allowed | same test: clinician GET 200 + SECRET_COMPLAINT / SECRET_DIAGNOSIS |
| Tenant scope preserved | `tenant and facility scope: foreign org and wrong facility conceal note body` |

### POSITIVE_PATH
YES — practitioner read; reception patient directory still allowed (non-clinical).

### NEGATIVE_PATH
YES — reception clinical surface + mutation attempts.

### AUTHZ/TENANT_PATH
YES — catalogue grant absence; cross-tenant/facility; unauth.

### WOULD_FAIL_BEFORE_FIX
**YES** — if reception gained clinical access or leaked bodies, assertions fail. (Catalogue already DENIED; suite locks that + HTTP.)

### WOULD_CATCH_REGRESSION
**YES**

### STATUS
**STRONG**

---

## Missing / weak tests that must still be added

### Must add (blocks PASSWORD coverage)

None remaining for PLATFORM-PASSWORD-UX-01 — covered by `tests/platform-password-ux-01.test.js` (A–G).

### Optional follow-on

None required for AC-WEB-EDITOR-01 hub — covered by `tests/ac-web-editor-01-management-hub.test.js` (A–J).

---

## Notes on strength criteria

- **STRONG** = focused suite asserts the fixed behavior, includes positive path, and would fail if the original bug returned.  
- Generic “page renders 200” alone is **not** counted.  
- `v7-bugs-10-15` password asset existence is **not** regression coverage for PLATFORM-PASSWORD-UX-01.

---

## Footer

FIXED_BUGS=9
STRONG_REGRESSION_COVERAGE=9
PARTIAL_COVERAGE=0
MISSING_COVERAGE=0
TESTS_TO_ADD=0
FINAL=V2_04_BUG_FIX_TEST_AUDIT_COMPLETE
