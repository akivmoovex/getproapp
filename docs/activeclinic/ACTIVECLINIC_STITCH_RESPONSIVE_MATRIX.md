# ActiveClinic — Stitch Responsive Matrix (AC-V6-11)

Pairs derived from Stitch titles (`– Desktop` / `– Mobile`). Tablet designs: **none** in inventory.

---

## Pairing rules

1. Same base title → one family; shared route.  
2. Mobile-only drawer is chrome, not a separate workflow.  
3. Flag functional divergence (none confirmed beyond form-factor layout without HTML inspection of every screen).

---

## Foundation / platform families

| Family | Desktop | Mobile | Notes |
|---|---|---|---|
| Login | P01 – Login – Desktop (+ unprefixed DUPLICATE) | P01 – Login – Mobile (+ unprefixed DUPLICATE) | Prefer P01 |
| Dashboard | P01 – Dashboard – Desktop (+ unprefixed DUPLICATE) | P01 – Dashboard – Mobile (+ unprefixed DUPLICATE) | Prefer P01 |
| Application shell | P01 – Shared Application Shell – Desktop (+ Application Shell DUPLICATE) | — | Mobile via drawer |
| Navigation drawer | — | P01 – Navigation Drawer – Mobile (+ unprefixed DUPLICATE) | Chrome |
| Shared states | P01 – Shared States; Shared Error/Loading/Offline; Access Restricted | same components, stacked actions | **S08 PARTIAL**; offline deferred |
| Admin lists (code) | facilities/staff/access/settings utilitarian | same routes, stacked cards/tables | **STITCH_GAP** |
| Facilities (AC-V6-S03) | table + filters | mobile cards + same filters | **VISUAL_BLOCKED**; shared `/app/facilities*` URLs |
| Staff (AC-V6-S04) | table + filters | mobile cards + same filters | **VISUAL_BLOCKED**; shared `/app/staff*` URLs |
| Staff create/edit (AC-V6-S05) | form + invite result | stacked form sections | **VISUAL_BLOCKED**; same routes |

---

## Clinical families (summary)

| Package | Desktop-heavy | Explicit mobile pairs | Responsive pattern |
|---|---|---|---|
| P02 | Registration wizard, print card, duplicate warning | List, profile, edit, contact, emergency, review, success | Table→cards; multi-step stack |
| P03 | Calendar, walk-in, doctor schedule, many queue ops | List, reception queue, reschedule | Queue boards denser on desktop |
| P04 | Triage, nursing, vitals, diagnosis, requests | Clinical queue, consultation workspace | Workspace may differ functionally — **review before Wave 4** |
| P05 | Catalogue, batches, PO, adjustments, labels | Inventory, queues, detail, dispense, instructions | Labels/print desktop-oriented |
| P06 | Queues, specimen, result entry | Lab/Rad dashboards | Result entry desktop-first |
| P07 | All four billing screens | — | **No mobile counterparts** — flag |

---

## Desktop without mobile counterpart (selected)

Many P03/P04/P05/P06 operational screens are desktop-only in Stitch. Implementation should still serve a usable mobile layout via responsive shell **or** explicitly block unsupported workflows on small viewports (**product decision per wave**).

P07 billing: **all desktop-only**.

---

## Mobile without desktop

- Navigation Drawer (expected)  
- P05 – Patient Medicine Instructions – Mobile (no desktop twin in inventory) — flag

---

## Interaction patterns

| Concern | Desktop | Mobile |
|---|---|---|
| Primary nav | Sidebar | Drawer |
| Tables | Wide table | List cards |
| Actions | Header / row actions | Sticky / overflow menu |
| Forms | Multi-column where Stitch shows | Single column stack |
| Modals | Center dialog | Full-sheet / stacked |
| Print | Dedicated screens | Often omit or download PDF later |
| Sticky | Action bars | Bottom actions |

---

## Functionality divergence watchlist

- Consultation Workspace Desktop vs Mobile  
- Dispense / partial dispensing flows  
- Medicine instructions mobile-only  

Treat as same product workflow unless HTML proves otherwise during implementation prompts.

## AC-V6-S02 note

Desktop sidebar + mobile drawer confirmed as the live pattern. Dashboard stacks to single column under 900px. Clinical table/queue patterns deferred.
