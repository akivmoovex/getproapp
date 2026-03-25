# Performance-aware development rules (GetPro web)

**Purpose:** Short rules so UI changes don’t accidentally regress **LCP, CLS, INP**, or bundle weight. This is a **human checklist**, not automation.

**Related docs (use in order):**

| Doc | Role |
|-----|------|
| **`docs/route-asset-inventory.md`** | **What files affect which route** — edit this map mentally before large changes. |
| **`docs/clean-architecture.md`** | **Real** folder layout and public route families. |
| **`docs/route-ownership-matrix.md`** | **Per-route** LCP, guards, edit risk. |
| **`docs/performance-budgets.md`** | **Per-route limits** — images, JS guards, ATF rules. |
| **`docs/lighthouse-checklist.md`** | **How to verify** — mobile/desktop Lighthouse, run log. |
| **`docs/performance-optimization-notes.md`** | **History** — what was fixed, server caching. |

---

## 1. When a PR is “performance-sensitive”

Treat the PR as performance-sensitive if **any** of these are true:

- Touches **`views/index.ejs`**, **`views/directory.ejs`**, **`views/company.ejs`**, or **shared partials** (`site_header`, `app_navigation`, `pro_search_form`, directory cards / empty state).
- Touches **`public/styles.css`**, **`public/design-system.css`**, **`public/theme.css`**, or **`public/m3-modal.css`** in a way that adds **many** new rules or **global** selectors.
- Touches **`public/scripts.js`** (global `DOMContentLoaded`), **`public/autocomplete.js`**, **`public/company-profile.js`**, **`public/directory-empty-callback.js`**, or **`public/join.js`**.
- Adds **images, video, or third-party scripts** above the fold.
- Adds **new global listeners** or **synchronous** work on every page load.

If none apply, perf review is optional (still run smoke tests).

---

## 2. What to check before editing

1. Open **`docs/route-asset-inventory.md`** — find your file in **§7 “if I touch file X”**.
2. Open **`docs/performance-budgets.md`** — read the section for the route you’re changing (homepage / directory / company).
3. Note **LCP candidates** (hero, company logo) and **CLS** areas (`#lead_status`, empty-state blocks).

---

## 3. What to verify before merge (perf-sensitive PRs)

- [ ] **LCP:** Hero or company logo still **not** lazy-loaded if they remain the LCP image; homepage **preload** still matches hero `srcset` if hero assets changed.
- [ ] **CLS:** Status/lead/callback blocks still have **reserved space** or stable layout (see budgets).
- [ ] **JS:** New logic is **guarded** (DOM present) or **route-only script** — not unbounded work in `scripts.js` on every page.
- [ ] **CSS:** Prefer **tokens**; avoid huge one-route overrides without a Lighthouse pass.
- [ ] **Lighthouse:** At least **one** run on the **primary route you changed** (mobile) — use **`docs/lighthouse-checklist.md`** log template if scores matter for the release.

---

## 4. PR checklist (copy into description)

```markdown
## Performance (if applicable)

- [ ] Checked route-asset-inventory for touched files
- [ ] Matched performance-budgets for affected route(s)
- [ ] No accidental lazy-load on LCP image(s)
- [ ] JS changes guarded or route-scoped
- [ ] Lighthouse spot-check on: ___ (route URL)
```

---

## 5. Red flags (extra care required)

| Change | Why |
|--------|-----|
| `loading="lazy"` on **hero** or **company logo** | Breaks LCP discovery. |
| Removing **`min-height`** on `#lead_status` / lead status class | CLS on submit. |
| Removing **`DOMContentLoaded` guards** in `scripts.js` | Extra work on every route. |
| Loading **`join.js`** or **`directory-empty-callback.js`** from global layout | Wrong routes, heavier TBT. |
| **Large** inline scripts in `<head>` | Blocks parsing / FCP. |
| New **third-party** widgets ATF | Network + main-thread cost. |

If you must do one of these, document **why** in the PR and run **Lighthouse** on affected URLs.

---

## 6. Code comments

A few files carry **`PERF:`** / **`PERF NOTE:`** comments at high-risk spots (hero, logo, shared `scripts.js`, route-only bundles). Prefer updating **docs** when behavior changes; keep comments one line when possible.

---

## 7. Links

- **Architecture (actual):** [`clean-architecture.md`](clean-architecture.md)  
- **Route matrix (LCP / risk):** [`route-ownership-matrix.md`](route-ownership-matrix.md)  
- **Impact map:** [`route-asset-inventory.md`](route-asset-inventory.md)  
- **Budgets:** [`performance-budgets.md`](performance-budgets.md)  
- **Measure:** [`lighthouse-checklist.md`](lighthouse-checklist.md)  
- **History:** [`performance-optimization-notes.md`](performance-optimization-notes.md)
