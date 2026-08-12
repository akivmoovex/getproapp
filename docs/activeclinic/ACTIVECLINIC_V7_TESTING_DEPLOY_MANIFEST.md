# ActiveClinic V7 — Testing Deploy Manifest

**Gate:** Phase 17 overnight readiness  
**Date:** 2026-08-12  
**Verdict:** `READY_WITH_NON_BLOCKING_GAPS`  
**This document does not authorize deploy or push.** Do not apply migrations to production.

---

## 1. Safety

| Check | Result |
|---|---|
| Branch | `V7` |
| Local committed HEAD | `082b5712944d91b23502cb7b61f2cad98969e2a7` |
| Remote `origin/V7` | `f96c3732831bc3b782db3429965d7abe1af09443` |
| Ahead of remote | **34 commits** (`0` behind) |
| Overnight Phases 7–16 | **Uncommitted** working tree on top of HEAD (211 dirty files) |
| Environment | `DEPLOYMENT_ENV=testing` |
| Hostinger profile | `activeclinic-org-v6` |
| DB identity | `moovex-platform-v7` |
| Dirty tree | **yes** |
| Production touched | **no** |
| Pushed | **no** |
| Deployed | **no** |

Overnight product is not in a SHA yet. A testing deploy that includes Phases 7–16 requires an ActiveClinic-only commit first. This gate does not create that commit.

---

## 2. Commit SHAs

### Remote / rollback baseline

| Role | SHA |
|---|---|
| Last remote `origin/V7` (rollback if testing still matches remote) | `f96c3732831bc3b782db3429965d7abe1af09443` |
| Pass 10 parity gate | `dca61f490cf02b30a080f72a901d38c298403fe8` |
| Pass 10 SHA record commit | `c3b367d02c70f998e1a9f8ca327f652652cb49d0` |
| Migration `025` introduced | `0bc417830f1c8824b011cfce13b5a00144ad6aa2` |
| Local committed tip (P0 visual 90+) | `082b5712944d91b23502cb7b61f2cad98969e2a7` |
| Overnight 7–16 | **no SHA** (dirty tree) |

### Local commits not on `origin/V7` (newest first)

```
082b5712 Raise P0 visual screens to 90+ with Stitch-aligned chrome.
848d808c Verify Phase 6 Stitch↔V7 mapping and publish visual backlog.
4ab31c1b Refresh Phase 5E desktop/mobile coverage counts after remapping.
530168e6 Remap Phase 5E remaining Stitch partials to full or product decisions.
10a8a121 Close remaining ActiveClinic V7 partials for Phase 5E.
0d5b03a5 Remap Phase 5D Billing and Cashier rows to full implementation in stitch inventory.
ea205855 Close Billing and Cashier partial flows for ActiveClinic V7 Phase 5D.
94299121 ActiveClinic: update P05 pharmacy Stitch mapping
37a1eb40 ActiveClinic: close pharmacy dispensing and batch partial gaps
67e3aa4f ActiveClinic: update P03 appointments and reception mapping
e2c22f2a ActiveClinic: close appointments and reception partial gaps
7ce7a3c0 ActiveClinic: update P25 Stitch mapping
4ee32929 ActiveClinic: expand procedure booking into multi-step flow
7dccd985 ActiveClinic: update Stitch implementation mapping
95d84da7 ActiveClinic: implement missing billing and finance flows
0bc41783 ActiveClinic: implement missing pharmacy operational flows
fe4ce97d ActiveClinic: add missing patient Stitch capability
2ee3c665 Active Clinic GUI          ← MIXED: BlessBoard QA seed (see §11)
c3b367d0 docs: record Pass 10 commit SHA after parity gate
dca61f49 ActiveClinic: finalize V7 visual parity gate and testing readiness
c049f759 docs: record Pass 9 commit SHA after QA fixes
eda24fc8 ActiveClinic: fix parity regression and accessibility issues
7aacd9c6 ActiveClinic: consolidate Stitch-aligned design system
eaf4882c ActiveClinic: align mobile experience with Stitch
e34b25e3 ActiveClinic: align Stitch imagery and media assets
4d2bf7f8 ActiveClinic: implement remaining Stitch states and variants
481f9053 chore: trim trailing whitespace in ActiveClinic Stitch isolation rule.
3f941227 ActiveClinic: align authenticated app shell and internal modules with Stitch.
f5fc41af ActiveClinic: record dual Stitch project authority in parity matrix.
529020f0 ActiveClinic: update V7 visual parity matrix after Pass 2.
73a4eeb7 ActiveClinic: finish Juflona public page visual parity improvements.
3411d607 ActiveClinic: align patient auth and portal dashboard with Stitch.
09ad378d ActiveClinic: align consultation, procedure, and My Booking flows with Stitch.
44169ad0 ActiveClinic: align public platform shell and P21 pages with Stitch.
```

### Deploy SHA rule

| If you deploy… | You get… |
|---|---|
| `origin/V7` (`f96c3732`) | Last remote; **no** Pass 10–16 overnight work; **no** `025` |
| HEAD `082b5712` | Local committed V7 through P0 visual 90+ and `025`; **omits** uncommitted Phases 7–16 (RBAC, a11y, CSRF partials, visual P1 chrome, 500 fixes) |
| Working tree after an AC-only commit | Full overnight product. **This is the intended testing candidate.** SHA does not exist until that commit. |

Do not push. Do not deploy from this gate.

---

## 3. Implementation mapping (Phase 16 live)

Stitch projects: public/booking/portal `17813606734422395399`; internal ops `12272131183982732110`.

| Classification | Count |
|---|---|
| Stitch screens / mapping rows | 388 / 388 |
| Full | **361** |
| Partial | **0** |
| Missing | **0** |
| Product decisions | **9** |
| Duplicates | 8 |
| N/A | 10 |
| Ambiguous | **0** |
| Invalid implementation IDs | **0** |
| Orphan full mappings | **0** |

### Product decisions (intentional, not missing)

- Insurance / NHIMA / write-off placeholders (P07)
- Staff phone verify vs activate (P13)
- Role permission matrix editor not built (P13)
- Procedure live slot grid not published (P25 desktop + mobile)
- Referral upload honesty banner only (P25)
- Mid-request booking-changed UX not built (P26)

Unused views kept (not blockers): `cashier-close-content.ejs`, `procedure-entry.ejs`.

---

## 4. Visual (full mappings, 361 rows)

P0 packs: `P01, P02, P07, P24, P25, P26, P27`.  
P1 packs: `P03, P04, P05, P06, P13, P23`.

| Band | All | P0 | P1 | Other |
|---|---|---|---|---|
| &lt;80 | **0** | **0** | **0** | 0 |
| 80–89 | 15 | **0** | **0** | 15 (P21×10, P22×5) |
| 90–94 | 253 | 134 | 78 | 41 |
| ≥95 | **0** | **0** | **0** | 0 |
| Unscored | 93 | 63 | 26 | 4 |

MATCHED (≥95) is not claimed. Unscored and P21/P22 80–89 are non-blocking visual gaps.

---

## 5. Functional

Latest broad sweep: Phase 15 `node --test` (74 files, excluding 2 Mocha leftovers).

| Check | Result |
|---|---|
| Pass / fail / skip | **475 / 0 / 0** |
| Phase 11 (earlier overnight) | 453 / 0 / 0 (64 files) |
| New regressions | **0** |
| P0 product bugs | **0** |
| Mocha leftovers not run | `tests/activeclinic-billing-ui-parity.test.js`, `tests/activeclinic-diagnostics-ui-parity.test.js` (pre-existing runner mismatch) |

---

## 6. Security (Phase 14)

Authorization bypass = **0**. Four defects found and fixed in the overnight tree (PO facility isolation, billing dashboard capability gates, pharmacy view vs manage, CSRF locals 500).

| Gate | Status |
|---|---|
| Tenant | Session organization; cross-tenant clinic key 404/403 |
| Facility | Selected facility; PO detail no longer leaks cross-facility |
| Department | Pharmacy / billing / cashier department gates |
| RBAC | `requirePermission` (resolved permissions, not role-name allowlists) |
| CSRF | Page tokens + POST 403 without token |
| Finance | Invoice amend / price override / refund SoD |
| Pharmacy | `pharmacy.view` vs `inventory.manage` / dispense |

---

## 7. Mobile / accessibility / browser

| Gate | Result | Evidence |
|---|---|---|
| P0 mobile blockers | **0** | Phase 8 |
| High a11y blockers | **0** | Phase 9 (WCAG 2.2 AA where practical) |
| Priority route 500s | **0** | Phase 10 |
| Priority broken links | **0** | Phase 10 |
| Unexplained critical JS errors | **0** | Phase 10 (`vm.Script` parse; **no live Chromium**) |

Phase 10 remaining: live Chrome/Safari/Firefox console not driven in this environment.

---

## 8. Migrations since last deployed / remote V7

**Do not apply to production.**

New vs `origin/V7` (`f96c3732`):

| Order | Module | File | Introduced |
|---|---|---|---|
| after `activeclinic/024` | `activeclinic` | `db/migrations/activeclinic/025_phase4_pharmacy_billing_gaps.sql` | `0bc41783` |

Dirty tree: **no** additional `.sql`.

### Application order

`npm run db:migrate` uses `MODULE_ORDER`: `platform` → `blessboard` → `activeclinic` → `getpro` → `ngo`, then numeric filename sort inside each module.

On the ActiveClinic **testing** database (`identity_key = moovex-platform-v7`):

1. Confirm identity before migrate.
2. Apply pending files in migrator order. The only **new** file in this range is **`025`** (pharmacy purchase orders + items; credit notes; collections contacts; `patient_charges.review_status`; price override requests).
3. `025` is forward-only (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`). There is no down migration.

BlessBoard catalogue migrations `077`–`092` are not new in this range.

### Rollback note for schema

Rolling app code back to `origin/V7` after `025` has been applied on testing leaves the new tables in place. They are unused by that older code. Do not drop them on production. Do not invent a reverse migration in this gate.

`db/scripts/lib/foundationVerify.js` ActiveClinic allowlist is stale vs migrations `015`–`025` (pre-existing). Do not treat `unexpected_product_table` from that verifier as a reason to skip `025` on testing.

---

## 9. Dependencies

| Item | Change |
|---|---|
| Overnight dirty `package.json` / `package-lock.json` | **none** |
| `origin/V7`..HEAD `package.json` | npm **scripts only**: `blessboard:seed-qa-role-users`, `test:blessboard:qa-role-users` (commit `2ee3c665`) |
| New npm packages | **none** |
| Install on testing host | `npm ci` (standard) |

Do **not** run `blessboard:seed-qa-role-users` on the ActiveClinic testing database.

---

## 10. Environment requirements

Host: ActiveClinic testing (`https://activeclinic.org`). Profile: `activeclinic-org-v6`.

```env
DATABASE_URL=<ActiveClinic testing database>
SESSION_SECRET=<strong secret>
NODE_ENV=testing
DEPLOYMENT_ENV=testing
PLATFORM_DEPLOYMENT_CODE=activeclinic-org-v6
```

Optional: `GETPRO_PG_SSL=no-verify`.

Do not set BlessBoard domain/cookie env on this host. Do not use `PLATFORM_DEPLOYMENT_CODE=activeclinic-org-testing` (unregistered; fail-closed 503).

Verify after start: `platform.database_identity.identity_key = moovex-platform-v7`.

---

## 11. Restart requirements

1. `npm ci` on the testing host.
2. Run `db:migrate` against the **testing** DB only (see §8).
3. Restart the Node worker (EJS, `public/activeclinic/**`, shell asset `v7-parity-15`).
4. Confirm `/healthz` 200 with ActiveClinic product markers.
5. Confirm `https://activeclinic.org` loads.

Static cache-bust: authenticated shell `v7-parity-15`; public/patient/auth remain `v7-parity-13` unless those files also changed in the overnight tree (they did — restart still required).

---

## 12. Smoke routes (testing only)

Anonymous / public:

- `GET /healthz` → 200
- `GET /` `/about` `/solutions` `/clinics` `/register-clinic` → 200
- Juflona tenant home, doctors, services, pricing, contact → 200
- `GET /book` `/book/procedures` `/my-booking` → 200
- Patient login/register/forgot-password → 200
- Staff `GET /login` `/forgot-password` → 200
- Unknown clinic → 404
- `GET /app/offline` → 503 by design

Authenticated (org admin unless noted):

- `/app` dashboard, patients, appointments, reception, clinical, pharmacy, diagnostics, billing, settings → 200
- Cashier `/app/cashier` as org admin without cashier permission → **403** (not 500)
- Reception must not open pharmacy/billing; clinician must not open billing; pharmacy must not open billing

CSRF: `POST /login` and `POST /register-clinic` without token → 403.

---

## 13. Git dirty classification (working tree vs HEAD)

**211 files. BlessBoard in dirty tree: 0.**

| Class | Count | What |
|---|---|---|
| ActiveClinic intended | **176** | `src/activeclinic/**`, `views/activeclinic/**`, `public/activeclinic/**`, `tests/activeclinic-*.test.js` |
| Mapping / evidence | **35** | `docs/activeclinic/stitch/**` Phase 7B–16 reports + regenerated inventory/mapping/backlog; `scripts/activeclinic-phase7b-update-backlog.js`, `phase7c-update-backlog.js`, `phase16-inventory-integrity.js` |
| Unrelated | **0** | — |
| Mixed | **0** | — |

Untracked product (must be in the overnight commit if deploying overnight work): `public/activeclinic/ac-a11y.js`, `views/activeclinic/partials/ac-csrf-field.ejs`, `ac-form-error.ejs`, Phase 8–14 test files.

### Already on the 34 unpushed commits (not dirty)

Commit `2ee3c665` (“Active Clinic GUI”) added BlessBoard QA:

- `db/scripts/blessboard-seed-qa-role-users.js`
- `docs/blessboard/BLESSBOARD_QA_ROLE_USERS.md`
- `src/blessboard/services/blessBoardQaRoleUsersSeedService.js`
- `src/blessboard/services/blessBoardQaRoleUsersSpec.js`
- `tests/blessboard-qa-role-users.test.js`
- `package.json` script entries only

**Do not add those files to a new overnight commit.** They are already on local `V7`. Do not run that seed on ActiveClinic testing. Prefer an ActiveClinic-only commit of the dirty 211 files (intended + evidence). This gate does not commit.

---

## 14. Rollback SHA

| Scenario | SHA |
|---|---|
| Testing still on remote | `f96c3732831bc3b782db3429965d7abe1af09443` (`origin/V7`) |
| Testing on local committed tip; undo overnight commit only | `082b5712944d91b23502cb7b61f2cad98969e2a7` |
| Schema | No automatic reverse of `025`. Extra tables on testing are unused by `origin/V7` code. |

Rollback = restore that SHA on the **testing** host and restart the Node worker. Production is out of scope.

---

## 15. Verdict

**`READY_WITH_NON_BLOCKING_GAPS`**

Product zeros required for a controlled **testing** deploy are met: missing=0, partial=0, new regressions=0, P0 bugs=0, auth bypass=0, P0 mobile=0, high a11y=0, priority 500s=0, broken links=0, unexplained critical JS=0, P0 visual &lt;90=0, P1 visual &lt;90=0.

Not `READY_FOR_V7_TESTING_DEPLOY` because:

1. Overnight Phases 7–16 are **uncommitted** — no reproducible SHA of the work this gate assessed.
2. Visual ≥95 is **0** (MATCHED not claimed).
3. 93 full mappings unscored; 15 P21/P22 screens remain 80–89.
4. Two Mocha leftover suites were not executed.
5. Phase 10 had no live Chromium.
6. Local `V7` already contains BlessBoard QA seed from `2ee3c665` (do not run on AC testing).
7. `foundationVerify` ActiveClinic table allowlist is stale vs `015`–`025`.

Not `NOT_READY`: none of those gaps is an open P0 functional, security, mobile, a11y, or mapping-missing blocker.

**Do not deploy. Do not push.**
