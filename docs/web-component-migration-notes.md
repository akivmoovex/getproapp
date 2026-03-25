# Web Component Migration Notes (Legacy → New Semantic Classes)

## Why this exists
To make future UI cleanup safe and predictable, this document captures the most common “legacy class” patterns and the corresponding new semantic component classes introduced for the web design system.

## Button mapping (most common)
- Legacy: `btn-primary`
  - New: `btn btn--primary`
- Legacy: `btn-secondary-wf`
  - New: `btn btn--secondary`
- Legacy / already aligned: `btn btn--text`
  - New: `btn btn--text` (same classes)

## Input mapping (plain / join-style fields)
The app already has JS/autocomplete shells (for example `pro-ac` and `pro-ac-input`). Migration can be incremental:

- Legacy wrapper: `join-field`
  - New wrapper: `input-field`
- Legacy labels: `join-field label` or `join-modal-label`
  - New labels: `input-field__label`
- Legacy control styles: `join-plain-input`, `join-modal-input`
  - New control: add `input-field__control` alongside existing control classes
- Legacy errors: `join-modal-error` / `pro-ac-msg` (hidden)
  - New error: `input-field__error` (keep the existing element and just standardize the class)

## Card mapping
Cards are already broadly consistent via `.card`. The recommended migration is:
- Page-specific “click intent” wrappers:
  - Add intent: `card--interactive` (and ensure the whole card remains one `<a href>` for navigation).
- Elevated / highlighted cards:
  - Use: `card--elevated` when you truly need higher emphasis.

Note: Directory result cards (`pro-directory-card*`) are still page-specific layout components.
However, we can safely standardize *CTAs inside those cards* without changing the card layout:
- Directory “View profile” CTA badge now uses `.btn.btn--primary` on `.pro-directory-card__cta` while keeping the existing badge placement/layout.

## Page-specific CSS to keep for later
Examples you should treat as “migration candidates,” not immediate rewrites:
- `pro-directory-card__cta` (CTA badge styling inside directory cards; partially standardized to match `.btn--primary`, but sizing/placement remains layout-specific)
- `pro-directory-empty*` (no-results states)
- `join-wizard*` (join flow wizard panels)

### This rollout (safe, low-risk)
- Migrated directory card “View profile” CTA badge to shared semantic button classes (`.btn .btn--primary`) without rewriting the directory card layout.
- Migrated homepage help / CTA card buttons to semantic button variants (`.btn--primary`, `.btn--secondary`).
- Migrated JOIN / CALLBACK form *plain fields* to shared `input-field` label/control/error semantics:
  - `views/join.ejs`: standardized the remaining modal inputs (disabled-city + exit modal) while keeping existing IDs, JS dismiss hooks, and `join-modal-error` behavior.
  - `views/partials/directory_empty_state.ejs`: standardized the directory empty-state callback inputs/buttons (`directory-empty-callback-*`) using the same `input-field` + semantic button conventions.
  - `views/company.ejs`: standardized the “Request contact” lead form inputs (name/phone/email/message) using `input-field` + `input-field__label` + `input-field__control`.
- Company mini-site contact block: standardized the lead form submit action into `card__actions`, migrated “GetPro support” Email/WhatsApp pills to `btn btn--secondary`, and applied compact semantic `btn btn--text` styling to interactive contact info links while keeping existing SSR bindings and `lead_form` behavior.
- Standardized JOIN / CALLBACK form *actions* to shared button variants where applicable (primary/secondary are already aligned to `.btn--primary` / `.btn--secondary`).

### Next safe rollout: JOIN wizard autocomplete wrappers
- Updated JOIN wizard autocomplete wrapper markup (wrapper-only; no JS selector changes) so the autocomplete control container (`.pro-ac`) participates in the shared `input-field` semantics:
  - `views/join.ejs`: added `input-field__control` to the `.pro-ac` wrapper for the service/category and city fields.
  - `views/join.ejs`: added deterministic `id`s to the `.pro-ac-msg` elements and wired `aria-describedby` on the underlying inputs.

- `views/join.ejs`: standardized the JOIN step-3 top-level validation error element (`#join-error-3`) to use shared `input-field__error` semantics (kept `id` and JS behavior unchanged).

### This rollout (safe, structure + contact-side polish)
- Added a reusable multi-step form wrapper pattern:
  - `views/partials/components/form_section.ejs` provides the canonical `.form-step` markup structure.
  - `views/join.ejs` now uses the same `.form-step/*` wrapper structure around join wizard steps (wrapper-only; no JS hook/IDs changed).
- Finished the company mini-site contact-side elements:
  - QR block: standardized the “Copy QR image” action to `btn btn--text` and aligned the actions container with `card__actions`.
  - Mini-site URL block: standardized the URL link to `btn btn--text` inside the existing `pro-company-profile__mini-url` styling, with a tiny CSS compactness override.

### This rollout (safe, form-step applied to other public forms)
- Join modals (`views/join.ejs`):
  - Disabled-city modal: wrapped panel body/actions with `.form-step__body` / `.form-step__actions` without changing any existing IDs used by `public/join.js`.
  - Exit/call modal (question + form panel): wrapped body/actions with `.form-step` rhythm while preserving IDs and validation hooks.
- Callback / request-call (`views/partials/directory_empty_state.ejs`):
  - Wrapped the no-results callback panel (`directory-empty-callback-*`) with `.form-step` body/actions while preserving existing submission + success behavior.
- Request-contact (`views/company.ejs`):
  - Wrapped the lead form fields + status + actions with `.form-step` body/actions while preserving `#lead_form`, `#lead_status`, and `button[type=submit]` for `public/scripts.js`.
- Added minimal shared CSS for `.form-step__header/body/actions` spacing in `public/design-system.css`.

### This rollout (JOIN step-1/2 errors + public legacy button aliases)
- `views/join.ejs`: aligned top-level wizard errors `#join-error-1` and `#join-error-2` with step 3 — `class="input-field__error"` and `role="alert"` (IDs unchanged; `public/join.js` still uses `getElementById(\`join-error-${step}\`)` only).
- `public/styles.css`: removed obsolete `.join-wizard-error` rules (superseded by shared `.input-field__error` on these elements).
- Public pages: migrated remaining low-risk `btn-primary` usage to `btn btn--primary`:
  - `views/not_found.ejs` (homepage link)
  - `views/coming_soon_il.ejs` (apex link)
- `views/ui_demo.ejs`: pattern library no longer renders live legacy `btn-primary` / `btn-secondary-wf` buttons; comparison table remains the mapping reference; live samples use semantic classes only.
- **Deferred (at the time):** admin/internal templates — addressed in the **admin / internal button aliases** rollout below.

### This rollout (admin / internal button aliases)
- **Templates:** All `views/admin/*.ejs`, `views/partials/admin_gate_form.ejs`, and `views/partials/crm_task_inner.ejs` now use `btn btn--primary` instead of `btn btn-primary` for primary actions (IDs, `data-*` hooks, `type`, and `form` attributes unchanged).
- **Dynamic admin UI:** `public/admin-form-edit-mode.js` unsaved-changes “Discard” control updated to `btn btn--primary`.
- **CSS:** `public/design-system.css` — `.btn.btn-primary` and `.btn.btn-secondary-wf` are **compatibility aliases** on the same rules as `.btn.btn--primary` / `.btn.btn--secondary` (focus-visible included). `public/styles.css` — removed duplicate standalone `.btn-primary` / `.btn-secondary-wf` blocks; tightened admin and public layout selectors (`.admin-form-shell…btn--primary`, `.admin-app .btn--primary:hover`, `.pro-directory-empty__callback-actions .btn--primary`, `.pro-company-profile__cta.btn--primary`).
- **Deferred:** Any third-party or cached HTML still using old class names remains covered by alias rules in the design system; optional follow-up is removing legacy aliases entirely once all markup is verified.

### This rollout (admin / internal form field + rhythm semantics)
- **Templates updated:** `views/partials/admin_gate_form.ejs`, `views/admin/user_form.ejs`, `views/admin/crm.ejs` (new task), `views/admin/lead_edit.ejs` (status & notes), `views/partials/crm_task_inner.ejs` (edit task, comment, reassign, status).
- **Field wrappers:** Plain `div` + bare `label` patterns replaced with `.input-field` / `.input-field__label` / `.input-field__control` on inputs, textareas, and selects. **All field `id`, `name`, `for`, `action`, and `method` values preserved.**
- **Helper copy:** Inline hints (password length, attachment URL, tenant scope note) use `.input-field__help` (and `muted` where appropriate) instead of ad hoc `admin-field-hint` / `div`-only hints in touched forms.
- **Rhythm:** Wrapped compact admin flows in `.form-step.form-step--admin` with `.form-step__body` and `.form-step__actions` (paired with existing `admin-gate-actions` where present). CRM task partial keeps `.crm-task-form__actions` for stable aside/toolbar spacing (no duplicate `form-step__actions` margin).
- **Actions / secondary:** Admin gate and new-user cancel links use `btn btn--text` for low-emphasis cancel (same `href`s).
- **CSS (`public/styles.css`):** `.form-step--admin .form-step__body` flex column + gap; scoped `.form-step__actions` top margin for admin; `.admin-gate-card .input-field__label`; CRM rules now target `.input-field` / `.input-field__label`; `.admin-form-shell` read-mode includes `.input-field__label`; CRM last-child selector targets `.crm-task-form__actions` instead of generic `div:last-of-type`.
- **Deferred:** `company_form`, `super_tenant_form`, `category_form`, `content_form`, embed-heavy edit shells, and checkbox-heavy forms — higher risk due to `data-admin-form-edit`, table layouts, and `form-check` patterns; migrate incrementally.

### This rollout (public form helper / error / status microcopy)
- **Shared pattern:** `public/design-system.css` adds `.form-status-message` for post-submit / inline status copy rhythm where a compact line is appropriate (optional on new markup; existing blocks keep their page classes when typography must stay unchanged).
- **Join wizard (`views/join.ejs` + `public/styles.css`):** removed redundant `join-step-hint` class; step intros use `.form-step__subtitle` with a scoped `.join-wizard .form-step__subtitle` rule for font size and spacing. Small copy edits on step 2 subtitle, disabled-city intro, exit modal line, and step-3 thanks message. Disabled-city field label aligned to “Full name”. Modal inline errors (`#join-disabled-city-error`, `#join-exit-modal-error`) gained `role="alert"`.
- **Company request-contact (`views/company.ejs` + `public/scripts.js` + `public/styles.css`):** `#lead_status` uses `form-status-message` with a scoped override so copy stays body-sized; adds `role="status"` and `aria-live="polite"`. Submit progress and success/error strings updated for calmer, consistent tone (same element still receives all states from JS).
- **Directory no-results callback (`views/partials/directory_empty_state.ejs` + `public/directory-empty-callback.js`):** success lead line uses an em dash for consistency with other flows; validation strings aligned with join (full name, phone required, Zambian format hint, generic phone hint).
- **`public/join.js`:** User-facing validation and top-level error strings aligned (name, phone required, region/tenant, list load, autocomplete hints, step validation fallback). **IDs and `showError()` / `ensureAc()` behavior unchanged.**
- **Deferred:** splitting `#lead_status` into separate success vs error elements (would need JS/CSS state); admin and non-public copy; deeper rewrite of directory empty-state headings.

## Recommended rollout order
1. Migrate “standalone CTAs” first (homepage search submit, company mini-site contact buttons, join/callback primary & secondary actions).
2. Migrate form label/control/error shells next (add `input-field*` semantics without touching autocomplete JS hooks).
3. Migrate directory/info cards only after we define a stable shared card block for those layouts.

