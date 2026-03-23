# Admin forms: Read → Edit → Done

## Pattern

1. Wrap the form in `<div class="admin-form-shell is-read-mode" data-admin-form-edit>`.
2. Add a toolbar with:
   - `.admin-form-shell__btn--edit` — enters edit mode
   - `.admin-form-shell__btn--done` (primary, hidden until edit) — submits the same form
   - `.admin-form-shell__btn--cancel` (`.btn.btn--text`, hidden until edit) — reverts to the snapshot from page load and returns to read mode
3. Include `/admin-form-edit-mode.js?v=<%= stylesVersion %>` after the main content.

Optional: `.admin-form-shell__back` (e.g. “← Users”) with `.admin-form-shell__toolbar--split` for a back link on the left; it hides while editing.

Optional: `<p class="admin-form-shell__unsaved" hidden>Unsaved changes</p>` inside the toolbar — shown only while **editing** and the form **differs** from the page-load snapshot.

## Behaviour

- **Read mode:** text inputs and textareas are `readOnly`; `select` and `checkbox` are `disabled` (so values still serialize correctly when switching modes). Password fields are cleared in read mode.
- **Done:** enabled only when the form is **dirty** (differs from the initial snapshot). Calls `form.requestSubmit()` (HTML5 validation runs). Implied submit (e.g. Enter) is blocked while Done is disabled.
- **Cancel:** restores field values from the initial snapshot (including checkbox), clears dirty state, returns to read mode.
- **Dirty:** `input` / `change` listeners compare current values to the snapshot; shell gets `.is-dirty` when they differ.
- **Leaving:** `beforeunload` prompts when the form is dirty in edit mode (reload/close tab). **← Users** (`.admin-form-shell__back`) prompts with `confirm()` when dirty in edit mode.

## Styling

Uses `public/styles.css` rules under `/* Admin: read → edit → done */`. Touch targets: primary and text buttons use existing `.btn` / `.btn--text` (min-height `--space-touch`).

## Reuse checklist

- [ ] One `<form>` inside `[data-admin-form-edit]`
- [ ] Named controls only where the server expects them; hidden `embed` field is ignored by the snapshot
- [ ] No duplicate submit row — Done replaces Save
- [ ] Script tag with cache-busting query

## Examples

- `views/admin/tenant_settings_detail.ejs` — phone/email fields only
- `views/admin/user_edit.ejs` — username, password, role select, enabled checkbox + back link
