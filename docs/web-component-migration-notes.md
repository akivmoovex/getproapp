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

## Recommended rollout order
1. Migrate “standalone CTAs” first (homepage search submit, company mini-site contact buttons, join/callback primary & secondary actions).
2. Migrate form label/control/error shells next (add `input-field*` semantics without touching autocomplete JS hooks).
3. Migrate directory/info cards only after we define a stable shared card block for those layouts.

