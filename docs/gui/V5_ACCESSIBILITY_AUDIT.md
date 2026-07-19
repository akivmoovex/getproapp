# BlessBoard V5 — Accessibility structural audit

**Date:** 2026-07-19  
**Constraint:** Structural a11y only. No content rewrite, no speculative ARIA, no backend changes.  
**Companion suite:** `npm run test:blessboard:a11y-structure` (`tests/blessboard-v5-a11y-structure.test.js`)

---

## 1. Verdict

| Area | Status |
|------|--------|
| Admin / member / tenant-public shells | **Strong** (skip, landmarks, inert drawers, focus-visible, reduced motion) |
| Apex marketing shell | **Hardened** (focusable main + drawer `inert`) |
| Auth (login / register / errors) | **Hardened** (`<main>` + focusable skip targets) |
| Branch dashboard headings | **Fixed** (single `<h1>`) |
| Platform directory tables | **Named regions** added |
| Speculative ARIA / content rewrite | **Not done** |

---

## 2. Surfaces reviewed

| Surface | Key artifacts |
|---------|---------------|
| Apex | `apex-shell-start.ejs`, `apex.js`, `apex.css` |
| Tenant public | `tenant-public-*`, `tenant-public.js` |
| Auth | `login.ejs`, `auth-error.ejs`, `register.ejs`, `register-submitted.ejs` |
| Member / BA / HQ / PA shells | `*-shell-start/end.ejs`, `shell-nav.js` |
| Media | `media-picker.js`, `media-upload.ejs` |
| Forms / errors | `form-errors.ejs`, tenant-auth field wiring |
| Tables | HQ/BA labelled regions; PA directory wraps |

---

## 3. Defects by category

| Category | Finding | Action |
|----------|---------|--------|
| Skip / focus target | Apex `#bb-apex-main` lacked `tabindex="-1"` | Fixed |
| Skip / focus target | Auth skip targets (forms / main / status card) not focusable | Fixed |
| Landmarks | Auth used `div.bb-auth-main` | → `<main>` |
| Heading order | Branch dashboard dual `<h1>` | “Daily Pulse” → `<p>` |
| Drawer | Apex closed drawer lacked `inert` | Markup + `apex.js` |
| Tables | PA directory tables unnamed | `role="region"` + `aria-label` |
| Form errors | Summary alert strong; field links incomplete on some admin forms | Documented (manual) |
| Live regions | `form-errors` assertive — appropriate for submit errors | Keep |

Already solid: `:focus-visible`, reduced motion, icon-only `aria-label`s, `aria-current="page"`, DS/media modal trap, shell Escape/restore, hidden nav via `display:none` / `inert`.

---

## 4. Fixes made

1. Apex `main` `tabindex="-1"`; drawer `inert` when closed; JS toggles inert  
2. Auth pages: `<main class="bb-auth-main">`; skip targets `tabindex="-1"`  
3. Branch dashboard: single `<h1>`  
4. Platform orgs/domains/deployments/subscriptions/plans: labelled table regions  

---

## 5. Tests added

In `tests/blessboard-v5-a11y-structure.test.js`:

- Apex main tabindex + inert + Escape/focus in `apex.js`  
- Auth main + focusable skip targets  
- Branch dashboard single `h1`  
- Shell `aria-current="page"`  
- PA table region labels  

---

## 6. Remaining manual checks

| Check | Why manual |
|-------|------------|
| Full keyboard walk of each shell drawer | Browser focus order |
| Screen reader announcement of error summaries | NVDA/VoiceOver |
| Field-level `aria-describedby` on every admin form | Pattern exists on member profile / login; not universal |
| Touch target sampling on real devices | CSS mins asserted; devices vary |
| Color-only status chips | Chips usually include text; sample per module |

---

## 7. Exact test results (2026-07-19)

| Suite | Result |
|-------|--------|
| `npm run test:blessboard:a11y-structure` | **87 pass / 0 fail** |
| `npm run test:blessboard:branch-admin-shell` | **12 pass / 0 fail** |
| `npm run test:blessboard:hq-shell` | **9 pass / 0 fail** |
| `npm run test:blessboard:platform-admin-shell` | **12 pass / 0 fail** |
| `npm run test:blessboard:apex-auth-gui` | **4 pass / 0 fail** |
| `npm run test:blessboard:apex-home` | **3 pass / 0 fail** |
| `npm run test:blessboard:media` (modal/picker) | **23 pass / 0 fail** |
| `npm run test:blessboard:public-pages` | **29 pass / 0 fail** |
| `npm run test:blessboard:member-portal` | **16 pass / 0 fail** |
| `npm run test:blessboard:design-system` | **8 pass / 0 fail** |
| `git diff --check` | **clean** |
| CSS lint on changed files | **N/A** (no CSS files changed this audit) |

Suite note: a11y attachment-URL assertions updated to authz download paths (`…/attachments/:id/file`) after media security work — not an a11y markup regression.

---

## 8. Suggested commit message

```
Harden V5 structural accessibility for apex, auth, and platform tables.
```
