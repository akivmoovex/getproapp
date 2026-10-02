# ActiveClinic — Stitch Shell Gap Analysis (AC-V6-11)

Compares Stitch P01 / Application Shell / Navigation Drawer / Shared states with AC-V6-10 implementation.  
**Do not rewrite the shell in this prompt.**

Classification:  
**A** matches · **B** small token/style · **C** shared component · **D** screen-specific · **E** Stitch inconsistency · **F** product decision · **G** unsupported

---

## Findings

| Area | Class | Notes |
|---|---|---|
| Authenticated app uses dedicated AC shell (not BlessBoard) | A | `views/activeclinic` + `ac-app.css` |
| Permission-filtered nav | A | `activeClinicNavigation.js` |
| Org + facility context switching | A | session `context_json` |
| Mobile drawer (Escape, backdrop, focus trap) | A / B | exists; visual parity vs Stitch drawer TBD |
| Sidebar width / header height / density | B | tune tokens against Stitch screenshots |
| Typography / spacing scale | B | Hanken Grotesk present on some auth pages; align shell |
| Login visual parity | D | functional auth; inline HTML ≠ Stitch Login Desktop/Mobile |
| Dashboard content | D | foundation home vs P01 Dashboard widgets |
| Unprefixed vs P01 shell duplicates | E | two design series — prefer P01 as canonical |
| Facilities / Staff chrome in Stitch | F / G | **no Stitch admin screens** — shell nav exists without matching Stitch pages |
| Clinical nav items in Stitch dashboards | G | do not add clinical nav until backends exist |
| Cards / tables / forms density | B–D | list pages are utilitarian |
| Status colors | B | define AC semantic tokens |
| Empty / loading / error / offline / restricted | C | **AC-V6-S08:** taxonomy + `ac-inline-state` + `access-state` + HTML error handler; offline **deferred**; VISUAL_BLOCKED vs Stitch pack |
| Feature-lock / subscription UI | F | not in Stitch inventory as dedicated screens |
| Modals | C | few confirmation patterns in foundation |

---

## Recommended shell work (later prompts)

1. AC-V6-S01 — Login visual parity against **P01 – Login** (not unprefixed duplicate).  
2. AC-V6-S03 — Shell/dashboard refinement against **P01 – Shared Application Shell** + **P01 – Dashboard**.  
3. Extract shared state partials from Shared Error/Loading/Offline + Access Restricted.  
4. Do **not** expand clinical sidebar entries until Wave 2+ schemas exist.

---

## Unsupported / defer

- Clinical modules implied by Stitch nav mockups  
- Medicine labels / print assets as shell concerns  
- Offline-first sync behavior (Shared Offline State may be presentational only — **F**)

## AC-V6-S02 update

Shell chrome refined toward P01 Shared Application Shell / Navigation Drawer. Clinical nav and KPI cards remain deferred (class G). See `stitch/AC_V6_S02_DASHBOARD_SHELL_PARITY.md`.
