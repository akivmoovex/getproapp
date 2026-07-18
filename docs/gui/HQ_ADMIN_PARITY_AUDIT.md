# BlessBoard V5 — HQ Admin parity audit

**Date:** 2026-07-18  
**Stitch project:** `projects/17124191473876947591`  
**Scope:** HQ Admin shared shell, Dashboard, Branch Directory/Selector, Members, Registrations, Announcements, Announcement Editor, Public Content, Attendance Reports, Giving Reports, Forms, Resources, Requests, Audit, Reports index.  
**Constraint:** Presentation / a11y fixes only. No new features, routes, schema, fabricated metrics, or Platform Admin work.

**Companion docs:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), Batches 16A–18F.

## Classification legend

| Class | Meaning |
|-------|---------|
| **CLOSE PARITY** | Layout/chrome aligned with Stitch within intentional product limits; remaining gaps are cosmetic or documented omissions |
| **MINOR GAPS** | Usable Stitch composition with small spacing/copy/chrome differences |
| **MATERIAL GAPS** | Major Stitch surfaces missing or structurally different beyond intentional omissions |
| **BLOCKED BY DATA** | Stitch requires fields/metrics V5 schema does not provide |
| **BLOCKED BY MISSING STITCH** | V5 surface has no dedicated Stitch desktop/mobile pair |

## Demo readiness verdict

**Ready for HQ Admin end-to-end demo testing** — with known intentional omissions (no fabricated dashboard KPIs/charts, no audit CSV/compliance scores, no form builder/SLA/chat, no monthly-report review workflow, Account/Settings without dedicated Stitch pairs). Auth, CSRF, church scope, empty/no-results states, desktop tables + mobile cards, and report links to live attendance/giving aggregates are in place.

Do **not** begin Platform Admin from this audit.

---

## Screen classifications

| Screen | Desktop Stitch | Mobile Stitch | Classification | Notes |
|--------|----------------|---------------|----------------|-------|
| HQ shell | `538c8f4f1a844930ac058428bf390a76` (51-*) | `c67eda7682de428d985416074f606fcf` | **CLOSE PARITY** | Sidebar ≥900px; header/drawer/bottom nav &lt;900px; skip → `#bb-hq-main`; Sacred Modernity tokens |
| Dashboard | `538c8f4f…` | `c67eda76…` | **CLOSE PARITY** / **BLOCKED BY DATA** | Live active-branch count only; unavailable cards for members/reporting; no fabricated charts/broadcast widgets |
| Branch Directory | `1a1aaecd09d34357886aa0b1028e539a` | `2f154dfcd0e045938a60ae3c147b240a` | **CLOSE PARITY** | Search + type chips; table + cards; branch selector; no create/export/member KPIs |
| Branch Selector | (panel on registry / dashboard) | same | **CLOSE PARITY** | Existing selector partial; church-scoped active branches only |
| Members | `3dae337c97e242049670749c2b1ab09d` (28-*) | `e90963b00bcf41368d089053a3a5db07` | **CLOSE PARITY** | Church-wide directory; filters + table/cards; no Export/Add Member |
| Member detail | — (adapted from 27-*) | — | **MINOR GAPS** / **BLOCKED BY MISSING STITCH** | Read-only privacy-limited profile; breadcrumb + back link this audit |
| Registrations | `87fe9bb70b79434e88b91e0fd877d238` (26-*) | `d352ed076bbe4fabb1ad6f5ef66c0a25` | **CLOSE PARITY** | Read-only HQ queue; no approve/reject |
| Registration detail | — | — | **MINOR GAPS** / **BLOCKED BY MISSING STITCH** | Read-only; breadcrumb this audit; actions stay on branch admin |
| Announcements | `ffa76443af8c4aa4ab97086fc8922b73` (61-*) | `b4184b738eca442d8ca9ff3dbd445bec` | **CLOSE PARITY** | List + delivery note; real eligible estimate on publish |
| Announcement editor | (61-* + Shared UI States) | same | **CLOSE PARITY** / **MINOR GAPS** | Create/edit/publish CSRF preserved; no scheduling/SMS/templates |
| Public Content | `3f3160664d91423d80cb4ba81e2af6c4` (34-*) | `f2bb5e794f074a1aa3d248a2fe54ddeb` | **MINOR GAPS** | Oversight hub + editors; not full Stitch website builder / org-templates 70 |
| Attendance report | `2a577dc15d4342acb152f16aed21c267` (57-*) | `06489c79d0d04a429e57eba5c717ba47` | **CLOSE PARITY** / **BLOCKED BY DATA** | Accessible bar tables; no trend/forecast/canvas |
| Giving report | `2a577dc1…` | `06489c79…` | **CLOSE PARITY** / **BLOCKED BY DATA** | Aggregate currency/category only; no donor PII |
| Forms oversight | `745a1972c0ba4ec893f64cc3457c0c95` (20-*) | `0f801e19ed3d4332bee877001bdc1a13` | **CLOSE PARITY** / **BLOCKED BY DATA** | Reused member forms chrome; no builder/signatures/payments |
| Resources oversight | `d1690ab7193d43e38ba9ba97c29d914c` (19-*) | `d3232a4f5e0f4d2da610740ca3a8f6b1` | **CLOSE PARITY** / **BLOCKED BY DATA** | Private-file wording; no progress/certificates/CDN |
| Requests oversight | `126bfebff1414fc08367039b84587819` (44-*) | `9b6531097eec43fb8ce22115dd170429` | **CLOSE PARITY** / **BLOCKED BY DATA** | Status/history; truncated memberRef; no SLA/chat/assignment |
| Request detail | `22fe4b70e55e4be498d7008741147d55` (45-*) | `9d8f71d056e54d7da7586d88e253af93` | **CLOSE PARITY** / **BLOCKED BY DATA** | Status form + timeline + private download |
| Audit trail | `bce1e8ec4078407c8d6179251b8765c2` (58-*) | `d7fcb1b3a796434a8fefc7e806c2c0b6` | **CLOSE PARITY** / **BLOCKED BY DATA** | Append-only events; truncated refs; no metadata/CSV/compliance |
| Reports index | `2a577dc1…` (57-*) | `06489c79…` | **CLOSE PARITY** / **BLOCKED BY DATA** | Live hub + attendance/giving links; no new generators/charts |
| Account | — | — | **BLOCKED BY MISSING STITCH** | Identity + logout CSRF; breadcrumb this audit |
| Settings | — | — | **BLOCKED BY MISSING STITCH** | Contact/website status form; page chrome aligned this audit |

**Summary counts (audited surfaces):** CLOSE PARITY **16** · MINOR GAPS **4** · MATERIAL GAPS **0** · BLOCKED BY DATA **10** (partial, shared with CLOSE) · BLOCKED BY MISSING STITCH **4** (Account, Settings, Member detail pair, Registration detail pair).

Out of product / not demo-blocking: Branch performance Stitch (63) vs aggregates hub; Audit review queue Stitch (65) shares `/hq/audit`; Monthly report review (67–68), Roles (69), Org templates (70) remain MISSING by design for V5 HQ.

---

## Fixes applied this audit (presentation only)

| Fix | Files |
|-----|-------|
| Settings: breadcrumb, section landmark, panel form, primary button, responsive field grid | `hq/settings.ejs`, `hq-admin.css` |
| Account: breadcrumb, `aria-label`, panel on identity list | `hq/account.ejs` |
| Member / registration detail: breadcrumb + `aria-label` | `hq/member-detail.ejs`, `hq/registration-detail.ejs` |
| Broader `:focus-visible` (back, breadcrumb, report cards, dash stats, title links) | `hq-admin.css` |
| CSS cache bump | `hq-admin.css?v=42` |

**Preserved:** all routes, queries, CSRF, authz, schema, POST targets, church scoping, append-only audit presentation, no fabricated metrics.

---

## Responsive check (320 / 375 / 768 / 1024 / 1440)

| Width | Shell | Content |
|-------|-------|---------|
| **320px** | Header + bottom tabs + drawer; `overflow-x` guarded | Stacked cards; filters wrap; settings form single column |
| **375px** | Same mobile chrome | Same stacking; page-head actions wrap |
| **768px** | Still mobile chrome (&lt;900) | ≥700 grids for settings/report cards; tables still card-mode &lt;900 |
| **1024px** | Desktop sidebar | Tables visible; cards hidden ≥900 |
| **1440px** | Same as 1024 | Centered main; sticky sidebar |

**Note:** CSS breakpoints are **320 / 700 / 800 / 900** (not literal 375/768/1024/1440). Demo widths are covered by the nearest rules.

---

## Accessibility checklist

| Check | Status |
|-------|--------|
| Skip → `#bb-hq-main` | Pass |
| Landmarks (main, nav, drawer) | Pass |
| Keyboard / focus-visible on shell + list controls | Pass (extended this audit) |
| Headings | Pass (`h1` + section titles) |
| Form labels + CSRF | Pass on POST surfaces (settings, announcements, forms/resources/requests) |
| Contrast (violet on warm surfaces) | Pass within Sacred Modernity tokens |
| Empty / no-results states | Pass across audited modules |
| `prefers-reduced-motion` | Pass |
| Touch ≥44px on toggles / chips / icon buttons | Pass |

---

## Intentional Stitch omissions (do not “fix”)

- Fabricated dashboard KPIs, charts, broadcast widgets, activity feeds  
- Branch create/export and member-count columns on registry  
- HQ registration approve/reject (branch-owned)  
- Announcement scheduling / SMS / templates  
- Website theme/domain/SEO/builder canvas; org-templates (70)  
- Attendance/giving trends, forecasts, canvas charts, donor PII, CSV/PDF  
- Forms builder, signatures, payments, automation, list answer dumps  
- Resources certificates/progress/public CDN for private files  
- Request SLA, chat, assignment, Export, Urgent, Approve/Reject chrome  
- Audit CSV, compliance scores, raw metadata/secrets/tokens  
- New report generators; monthly report review workflow (67–68)  
- Roles / permissions UI (69)  

---

## Tests run

| Command | Result |
|---------|--------|
| `npm run test:blessboard:hq-shell` | **9/9 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:settings` | **7/7 pass** |
| `npm run test:blessboard:announcements` | **16/16 pass** |
| `npm run test:blessboard:content-admin` | **14/14 pass** |
| `npm run test:blessboard:forms-requests` | **10/10 pass** |
| `npm run test:blessboard:reports-audit` | **7/7 pass** |
| `npm run test:blessboard:a11y-structure` | **73/73 pass** |
| `npx stylelint public/blessboard/v5/hq-admin.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

---

## Remaining gaps (acceptable for demo)

1. Announcement **preview** polish remains light vs full Stitch preview states.  
2. Public Content is oversight + form editors, not a freeform website builder.  
3. Account / Settings / Member detail / Registration detail lack dedicated HQ Stitch pairs — Sacred Modernity composition is intentional.  
4. Branch performance Stitch (63) is not a separate V5 route; aggregates live under Reports (57).  
5. Audit review-queue Stitch (65) is not a separate queue product — global trail (58) is canonical.

**Platform Admin:** not started.
