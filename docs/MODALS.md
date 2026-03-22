# Modals, dialogs, and overlays

## Components (files)

| Surface | Markup | Scripts | Styles |
|--------|--------|---------|--------|
| **Settings hub iframe** | `views/admin/settings_hub.ejs` | `public/admin-settings-hub.js` | `.admin-settings-modal*`, `.admin-settings-modal__header` |
| **CRM task overlay** | `views/admin/crm.ejs` | `public/admin-crm-kanban.js` | `.admin-crm-overlay*`, `.admin-crm-overlay__chrome` |
| **Super admin region iframe** | `views/admin/tenant_settings_list.ejs` | `public/admin-tenant-settings-list.js` | `.admin-tenant-settings-inline*` |
| **Company workspace** | `views/admin/company_workspace.ejs` | `public/admin-company-workspace.js` | `.admin-workspace__dialog` (native `<dialog>`) |
| **Home region picker** | `views/index.ejs` | `public/scripts.js` | `.wf-region-sheet*`, `.wf-region-sheet__header` |

## Layout convention (M3-style)

- **Header strip**: Title (optional) + **dismiss** control in a flex row; **no** absolutely positioned × over scrollable body content.
- **Spacing**: `--modal-space-1` (8px), `--modal-space-2` (16px), `--modal-space-3` (24px); close targets use `--modal-close-btn-size` (**48px** minimum).
- **Z-index**: Settings modal uses `--modal-z-dialog` (see `public/theme.css`).

## “Ghost header” (iframe / embed)

**Cause:** After a **POST**, redirects returned URLs **without** `embed=1`, so the next full-page load rendered the **full** admin chrome (`admin_nav`) inside the iframe.

**Fix:** `redirectWithEmbed()` in `src/routes/admin.js` appends `embed=1` when the request was embedded (`req.query` or `req.body`). Forms that submit from an embedded view include `<input type="hidden" name="embed" value="1" />`.

## Adding a new embedded admin form

1. Preserve `embed` on GET filter links (see `categories.ejs`, `cities.ejs`, `companies.ejs`).
2. Add hidden `embed` on POST forms that save from the iframe.
3. Use `redirectWithEmbed(req, ...)` on all redirects back to list/detail pages for that flow.
