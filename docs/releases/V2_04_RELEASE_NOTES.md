# Version 2.04 Release Notes

**Runtime catalog:** `src/platform/release-notes/releaseNotesCatalog.js` (version `2.04`)  
**About / version metadata:** `src/platform/build/applicationBuildInfo.js` (`VERSION_BASE_V8` / `PRODUCT_VERSION_V8` = `2.04`)  
**Branch:** `V4`  
**Frozen application candidate:** `c16c791f9a4d102aa213debb3f4f0975c258c487` (superseded only by a later **application** commit; docs-only tips do not replace it)  
**Hosted repository SHA (docs tip):** `569712ad3ce3ff82ef5d5a8c9bfbd066544d5d2d` — docs-only descendant; **not** the application candidate  
**Rule:** Production is **not** promoted by this packet. Pronline V10 is preserved. Neuniversity testing hosted final QA is **CLOSED** (`RELEASE_BLOCKERS=0`).

---

## A. Platform color / theme system

- Shared semantic color architecture in `src/platform/ui/theme/colors.css`.
- BlessBoard and ActiveClinic retain independent product identities under `[data-product]` selectors.
- **ActiveClinic** primary brand: **`#006068`** (`--palette-teal-700` → `--color-brand-primary`).
- **BlessBoard** primary brand: **`#6c5ce7`** (`--palette-violet-500` → `--color-brand-primary`).
- Shared component / theme migration completed earlier in V2.04; product aliases inherit the active product theme.
- Unjustified GUI raw-color cleanup guarded; V2.04 Stitch surfaces introduce **0** new unjustified GUI hex/rgb colors (tenant branding placeholders remain justified).

---

## B. Registration / geography

- Shared **Country + City** registration fields for BlessBoard and ActiveClinic.
- Shared city autocomplete backed by the platform geography repository/service.
- DB-backed city catalogue with country-aware lookup.
- Platform-level registration country availability (disabled countries reject forged POSTs).
- Province/region remains in the data model but is **not** required or displayed in the current registration UX.

### B.1 Registration wizard state (customer)

- Fixed multi-step registration state persistence so previous-step data survives forward/back navigation, refresh, and validation failures.
- Applied to BlessBoard church registration and ActiveClinic clinic registration.
- Registration can continue even when a browser login session is not present (sessionless draft support).

### B.2 Registration wizard state (internal / engineering)

- **REG-STATE-01=CLOSED**: mid-wizard GET no longer clears a valid signed draft when `gpRegNav` is absent; hydrate-if-valid + explicit `?fresh=1`.
- Shared platform form-draft infrastructure (`multiStepDraftMerge`, draft lifecycle, product adapters).
- Verified: `PLATFORM_FORM_TESTS=13/13` · `BB_REGISTRATION_TESTS=3/3` · `AC_REGISTRATION_TESTS=2/2` · `SESSIONLESS_FLOW=PASS` · `CROSS_DRAFT_ISOLATION=PASS` · `FINAL=PLATFORM_MULTI_STEP_FORM_STATE_IMPLEMENTED`.

### B.3 BlessBoard church provisioning (customer)

- Fixed church provisioning for existing users reused by phone when the submitted registration email differs from the stored account email.
- Administrator assignment now uses the canonical resolved identity rather than re-looking up the user by submitted email.
- Improved provisioning error classification and preserved transaction rollback safety.

### B.4 BlessBoard church provisioning (internal / engineering)

- **BB-PROVISION-01=CLOSED**: canonical `administratorUserId` propagation; no email fallback when userId is set; `user_not_found` is not mislabeled `database_conflict`.
- Verified: `CANONICAL_IDENTITY_PROPAGATION=PASS` · `PHONE_REUSE_DIFFERENT_EMAIL=PASS` · `MULTI_CHURCH_ADMIN=PASS` · `ROLLBACK=PASS` · `RETRY=PASS` · `CROSS_TENANT=PASS` · `FOCUSED_TESTS=11/11` · `FINAL=BB_PROVISION_IDENTITY_FIX_COMPLETE`.
- Source: `docs/qa/V2_04_BB_CHURCH_PROVISIONING_FAILURE_AUDIT.md`.

---

## C. Website platformization

- Shared website presentation model and component library.
- ActiveClinic presentation adapter + BlessBoard presentation adapter.
- Shared media / upload / image infrastructure (`SHARED_UPLOAD_ENGINE_COUNT=1`).
- Shared editor (`website-inline-edit.js`, `SHARED_EDITOR_ENGINE_COUNT=1`).
- Canonical platform website lifecycle: draft, preview, publish, unpublish, version, restore-as-new.
- BlessBoard migrated onto the canonical platform website engine (no dual-write / `publishFromLegacy` / `syncDraftToEngine` runtime paths).
- Clean testing-DB bootstrap verification recorded (ephemeral foundation; shared neuniversity not wiped for that evidence).
- Platform Admin website governance console remains separate from the clinic customer hub.

---

## D. ActiveClinic website redesign (Stitch)

Stitch project `8888814012921999511`. Batches **1–7 PASS** on V4. Batch **8** freezes local release for hosted QA.

| Family | Scope | Status |
|--------|--------|--------|
| **R01–R12** | Public clinic website experiences | **IMPLEMENTED** (Batches 2–4) + Batch 7 visual parity |
| **E01–E02** | Desktop + mobile (≤390px) inline editing on shared WE01 | **IMPLEMENTED** (Batch 5) + Batch 7 chrome polish |
| **H01–H06** | Clinic Website Management Hub | **IMPLEMENTED** (Batch 6) + Batch 7 hub health polish |

Responsive desktop/mobile: public, editor, and hub screens share one implementation with responsive CSS (390px companions). No duplicate desktop/mobile business logic.

**Local Stitch parity (Batch 7 methodology, no EXACT without hosted render):** **84.3%** overall · Public **85.0** · Editor **79.8** · Hub **84.4**. Physical references **38/38**. Logical experiences **20/20**.

---

## E. Important architecture

- Desktop/mobile variants share implementation.
- Stitch controls **presentation**; platform architecture remains canonical for persistence, authorization, lifecycle, editor, media, domain models, tenant isolation, and concurrency.
- Doctor presentation uses shared **PersonPresentation**.
- Services use shared **collection** presentation.
- Booking continues through the **existing booking engine** (Stitch booking entry is chrome/handoff only).
- Singular engines: editor, upload, media library, draft, publish, version, restore — **count = 1** each.
- Product coupling: BB↛AC and AC↛BB implementation imports remain **0**.

---

## F. QA / hardening

Automated coverage includes:

- BB + AC About Version **2.04**
- Theme isolation / product token cascade
- Geography QA-01 / QA-02 / QA-03 (including forged disabled-country rejection)
- Website presentation, components, media, Platform Admin console
- AC Stitch batches 2–7 (public, editor, hub, visual parity) + Batch 8 freeze gates
- Mini-website repeat-edit / concurrency (BB + AC saves 1/2/3; true stale second-session rejection)
- Website lifecycle, authorization, tenant isolation
- Multi-step registration draft persistence (platform / BB / AC focused suites)
- BlessBoard phone-reuse church provisioning identity fix (focused 11/11)
- Release-hardening duplication guards

Inventory: `docs/qa/V2_04_QA_TEST_INVENTORY.md`.

---

## G. Known limitations (non-blocking — V2.05 backlog)

Not V2.04 QA blockers (`RELEASE_BLOCKERS=0`):

- **E01/E02** editor visual chrome polish (`POST_QA_POLISH`; statuses **CLOSE**).
- **H03/H06 FUTURE_CAPABILITY** controls (**9**) intentionally informational only — **0** false-active / **0** H03–H06 blockers.
- Remaining documented **medium** Stitch visual gaps after hosted parity **85.5**.
- Stitch pricing screen absent (DESIGN_CAN_ADAPT). Offline/suspended shell remains platform lifecycle presentation.

See `docs/BACKLOG.md` → **V2.05 post-QA polish**.

**Removed from open/known issues:** REG-STATE-01 and BB-PROVISION-01 (both **CLOSED** — see §B.1–B.4).

---

## H. Hosted final QA (neuniversity testing)

| Field | Value |
|-------|--------|
| Application tree parity | **PASS** (`APP_PATH_DIFF_COUNT=0`) |
| Hosted Stitch / public / editor / hub | **85.5** / **86.5** / **79.8** / **84.4** |
| Lifecycle + media (BB/AC) | **PASS** |
| Authorization / tenant isolation / concurrency | **PASS** |
| Geography blocker | Closed via testing DB migrations **044** + **045** (no app-code fix) |
| Geography / BB registration / AC registration | **PASS** |
| Release blockers | **0** |

Authoritative packet: `docs/qa/V2_04_QA_RELEASE_FREEZE_HANDOFF.md`.

---

## Release Evidence

| Field | Value |
|-------|--------|
| Branch | `V4` |
| About version | **2.04** (shared V8 scheme) |
| Hosted Stitch parity | **85.5** |
| Production | **UNTOUCHED** |
| Neuniversity hosted final QA | **CLOSED** |
| Pronline V10 | **PRESERVED** (`PRONLINE_BRANCH=V10`) |

### Authoritative sources

- `docs/releases/RELEASE_NOTES.md` (index)
- `docs/releases/BLESSBOARD_RELEASE_NOTES.md` (BlessBoard customer-facing)
- `src/platform/release-notes/releaseNotesCatalog.js`
- `docs/qa/V2_04_QA_RELEASE_FREEZE_HANDOFF.md`
- `docs/qa/V2_04_BB_CHURCH_PROVISIONING_FAILURE_AUDIT.md` (BB-PROVISION-01 closed)
- `docs/qa/V2_04_PLATFORM_MULTI_STEP_FORM_STATE_IMPL.md`
- `docs/design/ACTIVECLINIC_V2_04_STITCH_IMPLEMENTATION_MAP.md`
- `docs/qa/V2_04_COLOR_SYSTEM_FINAL_FREEZE.md`
- `docs/qa/V2_04_QA_01_SHARED_REGISTRATION_LOCATION.md`
- `docs/qa/V2_04_WEBSITE_PLATFORMIZATION_OVERNIGHT_HANDOFF.md`
- `docs/qa/V2_04_BB_PLATFORM_ENGINE_MIGRATION.md`
- `docs/qa/V2_04_QA_TEST_INVENTORY.md`
