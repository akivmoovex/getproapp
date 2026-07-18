# BlessBoard V5 — Member Portal parity audit

**Date:** 2026-07-18  
**Stitch project:** `projects/17124191473876947591`  
**Scope:** Member shell + Dashboard, Profile, Announcements, Events, My Ministries, Resources, Forms, Requests, Giving Information.  
**Constraint:** Presentation / a11y fixes only. No new features, routes, schema, fabricated metrics, or Branch Admin work.

**Companion docs:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), Batches 08A–10D.

## Classification legend

| Class | Meaning |
|-------|---------|
| **CLOSE PARITY** | Layout/chrome aligned with Stitch within intentional product limits; remaining gaps are cosmetic or documented omissions |
| **MINOR GAPS** | Usable Stitch composition with small spacing/copy/chrome differences |
| **MATERIAL GAPS** | Major Stitch surfaces missing or structurally different beyond intentional omissions |
| **BLOCKED BY DATA** | Stitch requires fields/metrics V5 schema does not provide |
| **BLOCKED BY MISSING STITCH** | V5 surface has no dedicated Stitch desktop/mobile pair |

## Demo readiness verdict

**Ready for Member Portal demo testing** — with known intentional omissions (no prayer route, no payment checkout, no fabricated metrics/QR/hotline). Auth, CSRF, ownership, and empty states are in place. Do **not** demo Branch Admin from this batch.

---

## Screen classifications

| Screen | Desktop Stitch | Mobile Stitch | Classification | Notes |
|--------|----------------|---------------|----------------|-------|
| Member shell | `4207a5a6…` (via dashboard) | `b315a9d1…` | **CLOSE PARITY** | Sidebar ≥900px; header/drawer/tabs &lt;900px; Powered by GetPro in sidebar + drawer + desktop footer |
| Dashboard | `4207a5a6a8ac4464b2b899695bbc7c78` | `b315a9d1288b4454bcc37f79c25c5e10` | **MINOR GAPS** | Live previews only; prayer disabled; no attendance/unread fabrications |
| Profile | `a323f678460c4d62bfe1a8de462f58e1` | `55e21b658b57471db74eccd77e386079` | **CLOSE PARITY** / **BLOCKED BY DATA** | Editable contact vs read-only legal identity; no DOB/address/QR/avatar/password |
| Announcements | `63a9e6139ffd41f19b6b6d2f090f0199` | `d7074e7cfd7048c98abb960826673c01` | **CLOSE PARITY** | Real audience/read; no delivery widgets. Detail: **BLOCKED BY MISSING STITCH** |
| Events | `9a52685310ce4231bd9767ee3257c906` | `a4dc4a494cc54143b76671bd89cdaa69` | **MINOR GAPS** | List UI (not calendar); real registration only |
| My Ministries | `05f9bdca09fd456595a15b963be8092a` | `53924d7ece3e46e79d84556e56335b6e` | **CLOSE PARITY** | Joined/pending/discover from real memberships; no leaders/chat |
| Resources | `d1690ab7193d43e38ba9ba97c29d914c` | `d3232a4f5e0f4d2da610740ca3a8f6b1` | **CLOSE PARITY** | Published members-audience; file/info filters; no certificates |
| Forms | `745a1972c0ba4ec893f64cc3457c0c95` | `0f801e19ed3d4332bee877001bdc1a13` | **CLOSE PARITY** | Published forms + real submitted/closed history |
| Submit request | `2cfd58a5ea094831a3a44eed73c44165` | `196260bada8445d5b107f4be552540dc` | **CLOSE PARITY** | Supported categories; no upload/SLA |
| Request status | `530cb58f684646b9b084f45eb2e17e90` | `6c5f8b31ee394643a69dd7fe01c3e67e` | **CLOSE PARITY** | Own requests + live summary; timeline member-visible only |
| Giving Information | `3e72367008054943b23f6c690bac8eea` | `236d4bf2f588459f8cde18bd164b09cd` | **CLOSE PARITY** / **BLOCKED BY DATA** | Published methods instructional; no QR/checkout/balances |
| Prayer request | `57edf489…` / `1dd180a3…` | — | **BLOCKED BY MISSING STITCH** route | Stitch exists; V5 route absent (dashboard action disabled) |

**Summary counts (audited surfaces):** CLOSE PARITY **9** · MINOR GAPS **2** · MATERIAL GAPS **0** · BLOCKED BY DATA **2** (partial, shared with CLOSE) · BLOCKED BY MISSING STITCH **2** (announcement detail pair; prayer route).

---

## Fixes applied this audit (presentation only)

| Fix | Files |
|-----|-------|
| Broader `:focus-visible` on list cards, filters, back links, request-type labels | `member-portal.css` |
| Stronger search `:focus-within` ring | `member-portal.css` |
| Profile view mode: contact fields `readonly` until `?edit=1` | `member/profile.ejs` |
| Mobile drawer Powered by GetPro | `member-shell-start.ejs` |
| Bottom-tab label ellipsis + 320px compact type | `member-portal.css` |
| Full-width page CTAs only ≤699px (not 800–899 tablet) | `member-portal.css` |
| Events registered+search section labelled list | `member-events.ejs` |
| Drop redundant `role="radiogroup"` inside request fieldset | `member-request-new.ejs` |
| CSS cache bump `?v=19` | `member-shell-start.ejs` |

**Preserved:** all routes, queries, CSRF, authz, schema, POST targets, ownership rules.

---

## Responsive check (320 / 375 / 768 / 1024 / 1440)

| Width | Shell | Content |
|-------|-------|---------|
| **320px** | Header + tabs + drawer; overflow-x guarded; tab labels ellipsis | Stacked cards; 2-col quick actions / summary where defined; main bottom pad clears tabs |
| **375px** | Same mobile chrome | Same stacking; filter chips horizontal scroll |
| **768px** | Still mobile chrome (&lt;900) | ≥700 grids (2–4 cols) for actions/resources/giving/requests |
| **1024px** | Desktop sidebar | Content max-width `56rem`; no denser Stitch-only desktop chrome |
| **1440px** | Same as 1024 | Centered main; sidebar sticky |

**Note:** CSS breakpoints are **320 / 700 / 900** (not literal 375/768/1024/1440). Behavior at those demo widths is covered by the nearest rules.

---

## Accessibility checklist

| Check | Status |
|-------|--------|
| Skip → `#bb-mp-main` | Pass |
| Landmarks (main, nav, dialog drawer) | Pass |
| Keyboard / focus-visible on portal controls | Pass (extended this audit) |
| Headings | Pass (page `h1` + section/card structure) |
| Form labels + CSRF | Pass |
| Contrast (violet on warm page / soft chips) | Pass within Sacred Modernity tokens |
| Empty states (`role="status"` + markers) | Pass across modules |
| `prefers-reduced-motion` | Pass |
| Touch ≥44px on icon toggles / filters / search | Pass |

---

## Intentional Stitch omissions (do not “fix”)

- Notifications bell; prayer route / live prayer CTA  
- Fabricated attendance, unread totals, “85%” gauges, REQ-IDs, hotline/SLA  
- Calendar UI, tickets, QR / Scan to Give, checkout / card collection  
- Avatar upload, password, DOB/address, digital ID  
- Ministry leaders/chat/rosters; form PDF/builder/payments  
- Stitch “GetPro Church” primary wordmark (BlessBoard + church context)

---

## Tests run

| Command | Result |
|---------|--------|
| `npm run test:blessboard:member-portal` | **16/16 pass** |
| `npm run test:blessboard:forms-requests` | **10/10 pass** |
| `npm run test:blessboard:participation` | **11/11 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **41/41 pass** |
| `npx stylelint public/blessboard/v5/member-portal.css` | **0 errors** (hex token warnings only) |
| `git diff --check` | **clean** |

---

## Remaining gaps (acceptable for demo)

1. Announcement **detail** has no dedicated Stitch pair — functional only.  
2. Events remain **list**, not Stitch calendar.  
3. Giving Stitch QR / allocation graphics stay omitted (data + product policy).  
4. Prayer Stitch screens exist; V5 route still MISSING.  
5. No browser visual re-screenshot vs Stitch in this pass — classifications rely on batch docs + live Stitch IDs + code/CSS inspection.

---

## Suggested commit message

```
Tighten member portal Stitch presentation and keyboard focus.
```
