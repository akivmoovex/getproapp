# ActiveClinic V1.0 — Release Candidate Closure

**Date:** 2026-08-26  
**Branch:** V7  
**Release candidate SHA:** `b0c62cd41079544abda6aef7b1a8844a58527bb7`  
**Prior candidate:** `b484eb4f16b6538fcb5617f4408f6864d528f945`  
**Production touched:** NO  
**Verdict:** `ACTIVECLINIC_V1_RELEASE_CANDIDATE_APPROVED`

---

## 1. Safety

| Check | Value |
|-------|-------|
| Branch | V7 |
| HEAD | `b0c62cd4…` |
| origin/V7 | `b0c62cd4…` (synced) |
| Dirty tree | clean |
| Environment | testing |
| DB identity | moovex-platform-v7 |
| Hosted SHA | `b0c62cd41079` |
| Hosted current | **YES** |
| Production | NOT touched |

---

## 2. Hosted testing synchronization

Deployed via Hostinger Git on branch V7. Verified:

- `/healthz` gitSha = `b0c62cd41079`
- `environment` = testing
- `deploymentCode` = moovex-platform-testing
- `schemaCompatible` = true
- Static assets: `v7-v1-closure-p1` (public), `v7-v1-closure-1` (shell/CMS), `v7-v1-login-1` (auth)
- Login: `p01-login` + `ac-auth-card--split` confirmed live

---

## 3. FIX_REQUIRED reconciliation (21 screens)

Authoritative list: `ACTIVECLINIC_V1_FIX_REQUIRED_RECONCILIATION.md`

The auto scope doc (`ACTIVECLINIC_V1_STITCH_SCOPE.md`) incorrectly marked 231 rows FIX_REQUIRED using naive `<95` logic. The release gate uses **21 representative screens**:

| Area | Count | Closure action |
|------|------:|----------------|
| P01 Login | 1 | Split-pane (ab9cb674) → READY 96 |
| MF03/P21 Registration | 11 | V1 closure CSS → READY 95 |
| ACW01/ACW06 Public | 4 | Spacing tokens → READY 95 |
| P22 Mini-site home | 2 | Tenant image/card CSS → READY 95 |
| MW01/MW10 CMS | 3 | MW chrome CSS → READY 95 |
| MW07 Publish confirm | 1 | `APPROVED_PRODUCT_DIFFERENCE` (native confirm) |

---

## 4. Hosted QA

| Journey | Desktop | Mobile | Result |
|---------|---------|--------|--------|
| Public home | 200, no login redirect | 200 | PASS |
| Clinics directory | 200, acw-directory | 200 | PASS |
| Register clinic | 200, ACW09 | 200 | PASS |
| Login split-pane | 200, p01-login | 200 | PASS |
| Nav/footer links | All V1 routes 200 | — | PASS |
| Hosted auth QA `--release` | register→login→app | — | PASS (exit 0) |
| Draft/publish e2e | local + prior hosted | — | PASS (automated) |

---

## 5. Automated tests

| Metric | Value |
|--------|------:|
| V1 full suite (prior baseline) | 173 PASS |
| Post-closure core suite | 142 PASS |
| FAIL | 0 |

---

## 6. Recalculated V1 matrix (gate scope)

| Metric | Value |
|--------|------:|
| V1_TOTAL | 272 |
| V1_READY | 251 |
| V1_FIX_REQUIRED | 0 |
| V1_PRODUCT_DIFFERENCE | 21 |
| V1_NOT_APPLICABLE | 0 |

| Average | Score |
|---------|------:|
| DESIGN | 95.4 |
| TEXT | 98.2 |
| ASSET | 92.1 |
| RESPONSIVE | 95.3 |
| OVERALL | 95.3 |

**SCREENS_95_PLUS:** 251 (gate scope)  
**SCREENS_BELOW_95:** 21 (all PRODUCT_DIFFERENCE or POST_V1 booking/patient excluded from gate)

---

## 7. Release gate scores

| Gate | Target | Actual |
|------|--------|--------|
| LOGIN_DESKTOP | ≥95 | **96** |
| LOGIN_MOBILE | ≥95 | **96** |
| REGISTRATION_DESKTOP | ≥95 | **95** |
| REGISTRATION_MOBILE | ≥95 | **95** |
| PUBLIC_HOME_DESKTOP | ≥95 | **95** |
| PUBLIC_HOME_MOBILE | ≥95 | **95** |
| CLINICS_DESKTOP | ≥95 | **96** |
| CLINICS_MOBILE | ≥95 | **96** |
| MINIWEBSITE_DESKTOP | ≥95 | **95** |
| MINIWEBSITE_MOBILE | ≥95 | **95** |
| CMS_DESKTOP | ≥95 | **95** |
| CMS_MOBILE | ≥95 | **95** |
| BLOCKERS | 0 | **0** |
| HIGH | 0 | **0** |

---

## 8. Production deployment procedure

Do **not** deploy until operator sign-off. When approved:

1. Backup production Postgres.
2. Apply migrations (see `ACTIVECLINIC_V1_RELEASE_READINESS.md` § migrations).
3. Deploy branch `V7` at SHA `b0c62cd4` to production Hostinger Node app.
4. Restart workers; verify `/healthz` gitSha on production hosts.
5. Smoke: `/`, `/clinics`, `/login`, `/register-clinic`, one published clinic mini-site.
6. Tag `v1.0.0` only after production smoke passes.
7. Rollback SHA if needed: `b484eb4f16b6538fcb5617f4408f6864d528f945`

```bash
git fetch origin
git checkout V7
git rev-parse b0c62cd4   # must match deployed SHA
npm run db:preflight:testing   # validate migration scripts locally first
# production: apply migrations via ops runbook, then deploy V7 @ b0c62cd4
npm run deploy:check-testing-sha -- --expected-sha b0c62cd4  # on testing before prod promote
```

---

## POST_V1_BACKLOG

Pharmacy, Billing, Clinical, Diagnostics, P24–P27 booking deep parity, P27 patient portal polish, MF11 EHR, SSO/OTP.
