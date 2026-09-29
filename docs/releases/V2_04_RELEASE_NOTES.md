# Version 2.04 Release Notes

**Runtime catalog:** `src/platform/release-notes/releaseNotesCatalog.js` (version `2.04`)  
**About / version metadata:** `src/platform/build/applicationBuildInfo.js` (`VERSION_BASE_V8` / `PRODUCT_VERSION_V8` = `2.04`)  
**Branch:** `V4`  
**Rule:** Claims below are limited to work completed and locally verified on V4. Production is **not** promoted by this packet. Hosted deploy remains **PENDING**.

---

## A. Platform color system

- Shared semantic color architecture in `src/platform/ui/theme/colors.css`.
- BlessBoard and ActiveClinic retain independent product identities under `[data-product]` selectors.
- **ActiveClinic** primary brand: **`#006068`** (`--palette-teal-700` → `--color-brand-primary`).
- **BlessBoard** primary brand: **`#6c5ce7`** (`--palette-violet-500` → `--color-brand-primary`).
- Shared component / theme migration completed earlier in V2.04; product aliases inherit active product theme (no `:root` freeze of violet into AC).
- Unjustified GUI raw-color cleanup guarded; V2.04 Stitch surfaces introduce **0** new unjustified GUI hex/rgb colors (tenant branding placeholders remain justified).

---

## B. Registration / geography

- Shared **Country + City** registration fields for BlessBoard and ActiveClinic.
- Shared city autocomplete backed by the platform geography repository/service.
- DB-backed city catalogue with country-aware lookup.
- Platform-level registration country availability (disabled countries reject forged POSTs).
- Province/region remains in the data model but is **not** required or displayed in the current registration UX.

---

## C. Website platformization

- Shared website presentation model and component library.
- ActiveClinic presentation adapter.
- Shared media engine + shared image editor.
- Platform Admin website governance console (separate from clinic customer hub).
- **One** shared editor engine (`website-inline-edit.js`) — `SHARED_EDITOR_ENGINE_COUNT=1`.
- **One** shared upload engine (`mediaService.registerWebsiteMedia`) — `SHARED_UPLOAD_ENGINE_COUNT=1`.

---

## D. ActiveClinic website redesign (Stitch)

Stitch project `8888814012921999511`. Batches **1–6 PASS** on V4.

| Family | Scope | Status |
|--------|--------|--------|
| **R01–R12** | Public clinic website experiences (home, about, services, doctors, profiles, contact, booking entry chrome, facilities, gallery, patient guidance, modular CMS page) | **IMPLEMENTED** (Batches 2–4) |
| **E01–E02** | Desktop + mobile (≤390px) inline editing on shared WE01 | **IMPLEMENTED** (Batch 5) |
| **H01–H06** | Clinic Website Management Hub (overview, pages, brand, media, history, settings) | **IMPLEMENTED** (Batch 6) |

Responsive desktop/mobile: public and hub screens share one implementation with responsive CSS (including 390px hub companions). No duplicate desktop/mobile business logic.

---

## E. Important architecture

- Desktop/mobile variants share implementation.
- Stitch is the visual source of truth; platform architecture remains canonical.
- Doctor presentation uses shared **PersonPresentation**.
- Services use shared **collection** presentation.
- Booking continues through the **existing booking engine** (Stitch booking entry is chrome/handoff only).
- Website lifecycle continues through existing platform draft / preview / publish / version / **restore-as-new** services.

---

## F. QA / hardening

Automated coverage includes:

- BB + AC About Version **2.04**
- Theme isolation / product token cascade
- Geography QA-01 / QA-02 / QA-03
- Website presentation, components, media, Platform Admin console
- AC Stitch batches 2–6 (public, editor, hub)
- Mini-website repeat-edit / concurrency
- Release-hardening duplication guards

Inventory: `docs/qa/V2_04_QA_TEST_INVENTORY.md`.

---

## G. Known gaps (non-blocking)

- **Batch 7** visual parity polish vs Stitch screenshots (not claimed complete here).
- **Batch 8** final freeze / hosted candidate promote (pending).
- Stitch **H03** controls NOT_WIRED: favicon, header style modes, external booking gateway, accreditation badges.
- Stitch **H06** controls NOT_WIRED: custom domain, SSL management, maintenance mode, website timezone/language, analytics embeds.
- Stitch pricing screen absent (DESIGN_CAN_ADAPT). Offline/suspended shell remains platform lifecycle presentation.
- Hosted About/theme verification after first V2.04 testing deploy is still **PENDING**.

---

## Release Evidence

| Field | Value |
|-------|--------|
| Branch | `V4` |
| About version | **2.04** (shared V8 scheme) |
| Production | **UNTOUCHED** |
| Neuniversity deployment | **PENDING** |
| Pronline V10 | **PRESERVED** |

### Authoritative sources

- `docs/releases/RELEASE_NOTES.md` (index)
- `src/platform/release-notes/releaseNotesCatalog.js`
- `docs/design/ACTIVECLINIC_V2_04_STITCH_IMPLEMENTATION_MAP.md`
- `docs/qa/V2_04_COLOR_SYSTEM_FINAL_FREEZE.md`
- `docs/qa/V2_04_QA_01_SHARED_REGISTRATION_LOCATION.md`
- `docs/qa/V2_04_WEBSITE_PLATFORMIZATION_OVERNIGHT_HANDOFF.md`
- `docs/qa/V2_04_QA_TEST_INVENTORY.md`
