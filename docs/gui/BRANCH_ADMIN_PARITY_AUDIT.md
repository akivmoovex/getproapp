# BlessBoard V5 — Branch Admin parity audit

**Date:** 2026-07-18  
**Stitch project:** `projects/17124191473876947591`  
**Scope:** Branch Admin shell + Dashboard, Account, Settings, Registrations, Registration Detail, Members, Member Detail, Announcements, Public Content, Ministries / Events / Sermons management, Attendance, Giving, Forms, Requests.  
**Constraint:** Presentation / a11y fixes only. No new features, routes, schema, fabricated metrics, or HQ Admin work.

**Companion docs:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), Batches 11A–15D.

## Classification legend

| Class | Meaning |
|-------|---------|
| **CLOSE PARITY** | Layout/chrome aligned with Stitch within intentional product limits; remaining gaps are cosmetic or documented omissions |
| **MINOR GAPS** | Usable Stitch composition with small spacing/copy/chrome differences |
| **MATERIAL GAPS** | Major Stitch surfaces missing or structurally different beyond intentional omissions |
| **BLOCKED BY DATA** | Stitch requires fields/metrics V5 schema does not provide |
| **BLOCKED BY MISSING STITCH** | V5 surface has no dedicated Stitch desktop/mobile pair |

## Demo readiness verdict

**Ready for Branch Admin end-to-end demo testing** — with known intentional omissions (no Reports module, no duty roster/departments, no fabricated KPIs/assignment/chat/payment UI, Account/Settings/Forms without dedicated Stitch pairs). Auth, CSRF, branch scoping, empty/no-results states, and desktop table + mobile card patterns are in place. Do **not** begin HQ Admin from this audit.

---

## Screen classifications

| Screen | Desktop Stitch | Mobile Stitch | Classification | Notes |
|--------|----------------|---------------|----------------|-------|
| Branch shell | `001d1a0235a14f47b456bb092a012f7c` (25-*) | `615f1f4eabd645c4a6840349edb17cd1` | **CLOSE PARITY** | Sidebar ≥900px; header/drawer/bottom nav &lt;900px; skip → `#bb-ba-main`; no Reports/Support nav |
| Dashboard | `001d1a02…` | `615f1f4e…` | **CLOSE PARITY** / **BLOCKED BY DATA** | Live module tiles only; unavailable summary cards; no fabricated counts/budget/activity |
| Account | — | — | **BLOCKED BY MISSING STITCH** | Batch 11C identity + logout CSRF; breadcrumb added this audit |
| Settings | — | — | **BLOCKED BY MISSING STITCH** | Batch 11D editable contact/location; HQ-locked + unavailable product sections |
| Registrations | `87fe9bb70b79434e88b91e0fd877d238` | `d352ed076bbe4fabb1ad6f5ef66c0a25` | **CLOSE PARITY** | Queue filters + desktop table/mobile cards; no fabricated verification scores |
| Registration Detail | — (adapted from 26-*) | — | **MINOR GAPS** / **BLOCKED BY MISSING STITCH** | Detail pair absent; identity/review modals from queue chrome |
| Members | `3dae337c97e242049670749c2b1ab09d` | `e90963b00bcf41368d089053a3a5db07` | **CLOSE PARITY** | Real branch total; table + cards; no Export/Add Member/tag filters |
| Member Detail | `5e5985a087d049109c49006f99095884` | `b3fbd9e2eda64a2b998ec0e2a4311229` | **CLOSE PARITY** / **BLOCKED BY DATA** | Read-only DTO sections; Stitch notes/attendance/giving/ministries omitted |
| Announcements | `65941542c13048edb2c62bccd01ddcea` | `daa416025c704a5693b295ef3139af89` | **CLOSE PARITY** | List + editor (13A/13B); preview polish light; table region label this audit |
| Public Content | `3f3160664d91423d80cb4ba81e2af6c4` | `f2bb5e794f074a1aa3d248a2fe54ddeb` | **MINOR GAPS** | Overview + page/section editors (13C/13D); not full Stitch website builder canvas |
| Ministries management | `58c96b4c5b554e6991fc080c63783b6c` | `526c14042cb045fd8c2cfcb568e2c8ae` | **CLOSE PARITY** | Search/status chips; table + cards; real entity fields only |
| Events management | `ad136a0e8f0f41aa8c88c59c77df5455` | `112d23ce9441492cb5edc1c6ef1d5250` | **CLOSE PARITY** | Card grid + schedule fields; no roster/ticketing totals |
| Sermons management | — | — | **BLOCKED BY MISSING STITCH** | Batch 14C adapted from Shared UI + public sermons metadata |
| Attendance tracker | `d351ae0e154f44cd827314e415c0633e` | `5ea15ec1eb9f4fceac664903c1778091` | **CLOSE PARITY** / **BLOCKED BY DATA** | Aggregate monthly cards only; no trend %/QR/biometric |
| Attendance detail | `12e5e7d87c894b059c437a4b38753514` | `18a7d7a77b724653a42882743fb8a736` | **CLOSE PARITY** | Lifecycle + category entries; CSRF submit modal |
| Giving summary | `cf849cdb676c48fd8f0f7d38b74c99b0` | `20f32c9e77af423ca6a849a6759add28` | **CLOSE PARITY** / **BLOCKED BY DATA** | Aggregate + manual entry; settings banking UI omitted (38-*) |
| Forms | — | — | **BLOCKED BY MISSING STITCH** | Allowlisted schema + submissions; Shared UI + announcements chrome |
| Requests queue | `126bfebff1414fc08367039b84587819` | `9b6531097eec43fb8ce22115dd170429` | **CLOSE PARITY** / **BLOCKED BY DATA** | Real statuses; no Pending/Goal/assignment/Export KPIs |
| Request detail | `22fe4b70e55e4be498d7008741147d55` | `9d8f71d056e54d7da7586d88e253af93` | **CLOSE PARITY** / **BLOCKED BY DATA** | Status/history/attachment; no chat/SLA/profile cards |

**Summary counts (audited surfaces):** CLOSE PARITY **12** · MINOR GAPS **2** · MATERIAL GAPS **0** · BLOCKED BY DATA **6** (partial, shared with CLOSE) · BLOCKED BY MISSING STITCH **5** (Account, Settings, Registration Detail pair, Sermons, Forms).

Out of audit scope (nav present, not classified here): Participation, Resources, Media picker. Out of product (Stitch exists, V5 absent): Reports, Departments, Duty roster.

---

## Fixes applied this audit (presentation only)

| Fix | Files |
|-----|-------|
| Breadcrumbs on Attendance, Giving, Account, Settings | `attendance/admin-list.ejs`, `giving/admin-list.ejs`, `branch-admin/account.ejs`, `settings.ejs` |
| Root `aria-label` on Attendance / Giving lists | same list templates |
| Table `role="region"` + labels on Announcements, Registrations, Members | `announcements/admin-list.ejs`, `registrations.ejs`, `members.ejs` |
| Broader `:focus-visible` (wordmark, ann title links, request tabs, form/request card titles) | `branch-admin.css`, `hq-admin.css` |
| CSS cache bumps | `branch-admin.css?v=31`, `hq-admin.css?v=27` |

**Preserved:** all routes, queries, CSRF, authz, schema, POST targets, branch scoping, no fabricated metrics.

---

## Responsive check (320 / 375 / 768 / 1024 / 1440)

| Width | Shell | Content |
|-------|-------|---------|
| **320px** | Header + bottom tabs + drawer; `overflow-x` guarded on body | Stacked cards; filter chips wrap/scroll; main pad clears bottom nav |
| **375px** | Same mobile chrome | Same stacking; page-head actions wrap |
| **768px** | Still mobile chrome (&lt;900) | ≥700 grids for filters/forms; tables still card-mode &lt;900 |
| **1024px** | Desktop sidebar | Tables visible; cards hidden ≥900; detail grids ≥960 |
| **1440px** | Same as 1024 | Centered main; sticky sidebar |

**Note:** CSS breakpoints are **320 / 700 / 900 / 960** (not literal 375/768/1024/1440). Demo widths are covered by the nearest rules.

---

## Accessibility checklist

| Check | Status |
|-------|--------|
| Skip → `#bb-ba-main` | Pass |
| Landmarks (main, nav, dialog drawer) | Pass |
| Keyboard / focus-visible on shell + list controls | Pass (extended this audit) |
| Headings | Pass (`h1` + section titles) |
| Form labels + CSRF | Pass on POST surfaces |
| Contrast (violet on warm surfaces) | Pass within Sacred Modernity tokens |
| Empty / no-results states | Pass across audited modules |
| `prefers-reduced-motion` | Pass |
| Touch ≥44px on toggles / chips / icon buttons | Pass |

---

## Intentional Stitch omissions (do not “fix”)

- Fabricated dashboard KPIs, budget, activity feeds  
- Reports / duty roster / departments routes  
- Registration biometric / score / “urgent” chrome  
- Member Export / Add Member / tag filters; profile notes/attendance/giving tabs without data  
- Website full canvas builder; ministry leader/member KPIs/chat  
- Event roster/ticketing/payments; sermon hosting/analytics  
- Attendance trends, QR, biometric, offline sync  
- Giving banking/QR/mobile-money settings (38-*), donor PII, exports  
- Forms signatures/payments/conditional logic  
- Request assignment, Export, Urgent, chat, SLA, Approve/Reject, donor profile cards  

---

## Tests run

| Command | Result |
|---------|--------|
| `npm run test:blessboard:branch-admin-shell` | **12/12 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:settings` | **7/7 pass** |
| `npm run test:blessboard:member-registration` | **15/15 pass** |
| `npm run test:blessboard:announcements` | **16/16 pass** |
| `npm run test:blessboard:content-admin` | **14/14 pass** |
| `npm run test:blessboard:attendance` | **8/8 pass** |
| `npm run test:blessboard:giving` | **8/8 pass** |
| `npm run test:blessboard:forms-requests` | **10/10 pass** |
| `npm run test:blessboard:a11y-structure` | **59/59 pass** |
| `npx stylelint public/blessboard/v5/branch-admin.css public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

---

## Remaining gaps (acceptable for demo)

1. Announcement **preview** polish still light vs full Stitch preview states.  
2. Public Content is form/section editor chrome, not a freeform website builder.  
3. Account / Settings / Forms / Sermons / Registration Detail lack dedicated Stitch pairs — Sacred Modernity composition is intentional.  
4. Giving settings banking UI (38-*) remains intentionally omitted.  

**HQ Admin:** not started.
