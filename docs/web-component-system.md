# Web Component System (Buttons / Cards / Inputs)

## Scope
Lightweight, reusable UI component patterns for the Node.js + EJS + CSS app. No frontend framework.

## Design Tokens
These component classes are implemented with existing design tokens from:
- `public/theme.css` (authoritative tokens)
- `public/design-system.css` (DS V1 semantic aliases and component helpers)

Templates should rely on the component classes below instead of one-off inline styles.

## Buttons

### Base
- Use `.btn` for shared button layout (inline-flex, min-height, padding baseline, transitions).

### Variants
- Primary: `.btn.btn--primary`
- Secondary / outlined: `.btn.btn--secondary`
- Text / ghost: `.btn.btn--text`

### Internal structure (optional but recommended)
- `.btn__text` for the label
- `.btn__icon` for icons (sets consistent icon alignment)

### EJS partial
`views/partials/components/button.ejs`

Example (search submit):
```ejs
<%- include('partials/components/button', {
  type: 'submit',
  variant: 'primary',
  icon: 'search',
  text: 'Search',
  className: 'pro-search-form__submit pro-home-search-submit'
}) %>
```

## Cards

### Base
- Use `.card` for consistent surface, border, radius, padding, and subtle elevation.

### Optional modifiers / structure helpers
- Clickable card intent: `.card.card--interactive`
- Header/body/footer helpers:
  - `.card__header`
  - `.card__title`
  - `.card__meta`
  - `.card__body`
  - `.card__footer`
  - `.card__actions`

These helpers are additive; they do not replace page-specific card blocks (for example `.pro-directory-card`).

### EJS partial
`views/partials/components/card.ejs`

## Inputs

### Input field semantics
Use these classes to standardize labeling and validation messaging:
- Wrapper: `.input-field`
- Label: `.input-field__label`
- Control: `.input-field__control`
- Helper text: `.input-field__help`
- Error text: `.input-field__error`

Error emphasis:
- `.input-field--error` (paired with `.input-field__control:focus-visible` styling)

### Compatibility with existing autocomplete / join flows
The app already has specialized input shells (for example `pro-ac-input`, `join-plain-input`, `join-modal-input`). This component system is additive:
- new semantic classes are applied alongside existing classes
- existing JS hooks remain unchanged

### EJS partial
`views/partials/components/input.ejs`

## Naming Rules
1. Prefer `.btn`, `.card`, and `.input-field*` semantic classes for new UI.
2. Keep legacy classes when they are required by existing CSS/JS, but add the semantic classes whenever practical.
3. Avoid hardcoding colors/spacing in new component CSS; use tokens from `theme.css` / DS aliases.

