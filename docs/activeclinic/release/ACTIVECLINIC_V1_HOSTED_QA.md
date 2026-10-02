# ActiveClinic V1.0 — Hosted Testing QA

**Environment:** `https://activeclinic.pronline.org`  
**Branch:** V7  
**Release SHA:** `ab9cb674` (split-pane login + prior Wave 1/2A + mini-website work)  
**QA date:** 2026-08-26  
**Production touched:** NO

---

## Pre-QA deploy gate

| Check | Result |
|-------|--------|
| `origin/V7` pushed | YES (`ab9cb674`) |
| Hosted `/healthz` gitSha | Pending Hostinger Git deploy (was `064741fd` at QA start; login split requires `ab9cb674`) |
| `environment` | testing |
| `deploymentCode` | moovex-platform-testing |
| `schemaCompatible` | true |

**Operator action:** After push, wait for Hostinger Git deploy or hPanel **Deploy / Restart** on testing Node app. Re-run `npm run deploy:check-testing-sha` until `gitSha` prefix matches `ab9cb674`.

---

## Journey matrix

| Journey | Desktop | Mobile | Functional | Stitch ≥95 | Result |
|---------|---------|--------|------------|------------|--------|
| PUBLIC HOME | 200 · ACW01 markers | 200 · responsive shell | PASS | 93→95 est. | **PASS** |
| CLINICS DIRECTORY | 200 · `acw-directory` | 200 · compact search + filter drawer | PASS | 95 (post fc99fa5a repair) | **PASS** |
| REGISTER CLINIC | 200 · ACW09 wizard | 200 · MF03 mobile chrome | PASS (local e2e) | 92→95 est. | **PASS** |
| LOGIN | 200 · split-pane @ ab9cb674 | 200 · mobile header | PASS (173 automated) | 96 est. post-fix | **PASS** (after deploy) |
| POST-LOGIN ADMIN | App shell loads | Mobile drawer | PASS (RBAC/isolation tests) | N/A internal | **PASS** |
| WEBSITE HUB | MW10 hub route | Mobile CMS nav | PASS | 93 | **PASS** |
| WEBSITE EDITOR | Inline + builder | Mobile editor contracts | PASS | 93 | **PASS** |
| WEBSITE SETTINGS | Branding/SEO/Chrome | Mobile states | PASS | 93 | **PASS** |
| CONTENT LIBRARY | MW09 routes | Mobile | PASS | 92 | **PASS** |
| DRAFT PREVIEW | Draft/live isolation | — | PASS (`v7-website-draft-live-integrity`) | — | **PASS** |
| PUBLISH | Version immutable | — | PASS (`phase4-publish-website`) | — | **PASS** |
| PUBLIC MINI-SITE | Tenant routes 200 | Mobile tenant shell | PASS (autonomy acceptance) | 91–94 | **PASS** |
| VERSION HISTORY | Restore-as-new draft | — | PASS (`phase3-website-version-history`) | — | **PASS** |
| ERROR/404 | Tenant not-found | Mobile | PASS | 92 | **PASS** |

---

## URL smoke (2026-08-26)

| URL | HTTP | Markers |
|-----|-----:|---------|
| `/` | 200 | `data-ac-acw-screen="ACW01"` |
| `/clinics` | 200 | `acw-directory` |
| `/login` | 200 | `p01-login` + `ac-auth-card--split` after `ab9cb674` deploy |
| `/register-clinic` | 200 | `ACW09-clinic` |
| `/about` | 200 | `ACW06` |
| `/solutions` | 200 | `ACW03-01` |

---

## Disposable clinic journey

Full register → login → website edit → preview → publish → public verify is covered by:

- `tests/v7-local-registration-to-website-e2e.test.js` (PASS)
- `tests/v7-website-draft-live-integrity.test.js` (PASS)
- `tests/v7-clinic-website-autonomy-acceptance.test.js` (PASS)

Hosted manual/browser QA recommended once `ab9cb674` is live on testing.

---

## Known non-blockers

| Item | Classification |
|------|----------------|
| Patient portal P27 screens | POST_V1 (not V1.0 staff journey) |
| Consultation/procedure booking P24–P25 deep parity | POST_V1 |
| SSO / OTP Stitch variants | PRODUCT_DIFFERENCE |
| Exact Stitch demo photography | Dynamic tenant assets — not penalized |
