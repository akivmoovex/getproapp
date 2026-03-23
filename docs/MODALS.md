# Modals, dialogs, and overlays

## Single modal system (`public/m3-modal.css`)

All app modals use the **same HTML contract**:

1. **`.m3-modal-overlay`** — fixed full-screen flex container; fades in when **`.m3-modal-overlay--open`** is set.
2. **`.m3-modal-overlay__backdrop`** — dimmed layer (opacity animated with the overlay).
3. **`.m3-modal`** — surface: scale + opacity enter animation; **flex column**, no absolute layout for header/body/footer.
4. **`.m3-modal__header`**, **`.m3-modal__body`** (scrollable), **`.m3-modal__footer`** — optional empty footer uses **`.m3-modal__footer--empty`** (`display: none`).

Close targets use **`.m3-modal__close`** (48px minimum via `--modal-close-btn-size`).

Open/close animations are **CSS-only**; JS toggles `hidden`, then `m3-modal-overlay--open`, and on close waits for `transitionend` (with timeout fallback) before clearing iframe/body content.

## Components (files)

| Surface | Markup | Scripts | Styles |
|--------|--------|---------|--------|
| **Settings hub iframe** | `views/admin/settings_hub.ejs` | `public/admin-settings-hub.js` | `m3-modal.css` + `.m3-modal--settings-iframe` |
| **CRM task overlay** | `views/admin/crm.ejs` | `public/admin-crm-kanban.js` | `m3-modal.css` + `.m3-modal--crm-task` |
| **Super admin region iframe** | `views/admin/tenant_settings_list.ejs` | `public/admin-tenant-settings-list.js` | `.admin-tenant-settings-inline*` |
| **Company workspace** | `views/admin/company_workspace.ejs` | `public/admin-company-workspace.js` | Native `<dialog>` |
| **Home region picker** | `views/index.ejs` | `public/scripts.js` | `m3-modal.css` + `.wf-region-m3` |
| **Join exit / disabled city** | `views/join.ejs` | `public/join.js` | `m3-modal.css` + `.join-modal-layer` |

## Layout convention (M3-style)

- **Header strip**: Title + **dismiss** in a flex row; **no** absolutely positioned × over scrollable body content.
- **Spacing**: `--space-1` … `--space-5` and `--modal-*` aliases in `theme.css`.
- **Z-index**: Settings hub uses `--modal-z-dialog`; CRM `10050`; region `10003`; join `10050`.

## “Ghost header” (iframe / embed)

**Cause:** After a **POST**, redirects returned URLs **without** `embed=1`, so the next full-page load rendered the **full** admin chrome (`admin_nav`) inside the iframe.

**Fix:** `redirectWithEmbed()` in `src/routes/admin.js` appends `embed=1` when the request was embedded (`req.query` or `req.body`). Forms that submit from an embedded view include `<input type="hidden" name="embed" value="1" />`.

## Adding a new embedded admin form

1. Preserve `embed` on GET filter links (see `categories.ejs`, `cities.ejs`, `companies.ejs`).
2. Add hidden `embed` on POST forms that save from the iframe.
3. Use `redirectWithEmbed(req, ...)` on all redirects back to list/detail pages for that flow.
