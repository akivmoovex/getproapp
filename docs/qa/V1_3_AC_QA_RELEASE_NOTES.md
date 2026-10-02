# ActiveClinic V1.3 QA Release Summary

**Hosted closure verdict:** `V1_3_AC_HOSTED_CLOSURE_PASS`  
**Freeze gate verdict:** `V1_3_QA_FREEZE_BLOCKED` (BB draft-hydration Major remains)  
**Date:** 2026-09-20  
**Freeze / hosted QA SHA:** `c5910e075aac`  
**Prior hosted closure SHA:** `1640591df9bf`  
**QA host:** `https://activeclinic.pronline.org`  
**Deployment:** `moovex-platform-testing` / `testing`  
**Production:** `https://activeclinic.org` · untouched (`d4f5b190074d`)

## SHA alignment (freeze)

| Surface | SHA | Aligned? |
|---------|-----|----------|
| Local `HEAD` | `c5910e075aac` | Yes |
| `origin/V7` | `c5910e075aac` | Yes |
| AC hosted QA | `c5910e075aac` | Yes |
| BB hosted QA | `c5910e075aac` | Yes |
| Production AC | `d4f5b190074d` | Untouched (≠ QA) |

## Hosted closure bugs (on `1640591df9bf`)

| Bug | Result | Evidence |
|-----|--------|----------|
| BUG-002 Staff invitation | **PASS** | Disposable `qa.staff.a0b5bc@example.invalid` → activate → login `/app`. Staff `4fd54e05-…` active; identity `f94a7c90-…` active; invitation `accepted`; facility `lusaka` primary; roles `activeclinic_staff` + `activeclinic_receptionist`. |
| BUG-008 About image | **PASS** | Harness login fixed to `login_email`. Draft+live CDN asset `9d82b47d-…png`; publish dialog accepted; **Published (version 52)**; live About matched draft after refresh. |
| BUG-007 Website sections | **PASS** | Add Text `s0ae9d8971a94` + Image+Text; edit heading marker `BUG007 Closure 5e621f` persisted after reload (drafts POST 200); reorder sortIndex 17→16; remove with confirm panel 18→17; publish **version 56**; public home shows marker after refresh. |

Evidence dir: `/tmp/v13-ac-closure/` (`bug002*.log`, `bug008-publish3.log`, `bug007-report.json`).

### Earlier false PARTIAL on BUG-007

Prior hosted runs marked PARTIAL because the harness clicked Remove without `[data-website-section-confirm-remove]` and did not open the field editor on `cms.section.<id>.heading`. With the confirm + field-editor path, add/edit/reorder/remove/publish/public all persisted on SHA `1640591df9bf`. No product architecture change was made for this closure.

## Automated regression (freeze gate)

| Suite | Result | Counts |
|-------|--------|--------|
| ActiveClinic V7 automated regression | **PASS** | **104 / 104** · 0 fail (`/tmp/v13-freeze/ac-v7-regression.log`) |
| Shared V7 bundle (19 files) | **PASS** | **212 / 212** · 0 fail (`/tmp/v13-freeze/shared-v7-final.log`) |

## Freeze gate — shared failure classification

| Failure | Classification | Action |
|---------|----------------|--------|
| `platform-identity-foundation` phone vs email duplicate code | **Product defect** | Fixed in `platformIdentityService.js` — email-only collision returns `duplicate_verified_email`. |
| `v7-image-editor-coverage` doctors catalogue vs `/library` | **Test-contract drift** | Doctors editor uses catalogue + Content Library CTA; assertions updated to match product. |

## Hosted critical (freeze recheck on `c5910e075aac`)

| Check | Result | Evidence |
|-------|--------|----------|
| AC login + staff `/app` | **PASS** | `demo_network_admin@demo.activeclinic.example` → `/app` (`/tmp/v13-freeze/hosted-critical-final.json`) |
| AC live About CDN | **PASS** | `/clinics/activeclinic-demo/about` media under `/media/testing/activeclinic/…` |
| Production AC SHA ≠ QA | **PASS** | `d4f5b190074d` production |

## Remaining defects (AC)

None Critical/Major from AC hosted closure.

## Production untouched

- No production deploy, DB migrate, config change, or media write performed.  
- All hosted writes used disposable QA records / reversible draft→publish on testing demo clinic.

## Verdicts

- Hosted closure: `V1_3_AC_HOSTED_CLOSURE_PASS`
- Freeze: `V1_3_QA_FREEZE_BLOCKED` — blocked by BlessBoard Major draft-hydration (see BB notes).
