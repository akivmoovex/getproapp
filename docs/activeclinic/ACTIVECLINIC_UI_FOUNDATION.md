# ActiveClinic UI Foundation

**Stage:** AC-V6-10

## Design tokens

Defined in `public/activeclinic/ac-app.css` (`--ac-*`):

background, surface, ink, muted, border, primary, focus, success/warning/danger, spacing, radius, shadow, typography (Hanken Grotesk).

Teal ActiveClinic direction — not BlessBoard violet.

## Shared states

| State | Mechanism |
|-------|-----------|
| Flash | `shell.flash` → `.ac-flash--*` |
| Empty | `.ac-empty` partials on list pages |
| Access denied | `renderSimpleState` 403 |
| Not found | safe 404 for cross-tenant facility keys |
| Session expired | clear AC cookies + login notice |

## Accessibility

- Skip link, landmarks (`aside`, `nav`, `main`, `header`)
- Current page indication
- Drawer: Escape, backdrop, focus trap, `aria-expanded` / `aria-hidden`
- Visible focus rings
- Touch targets ≥ ~44px
- `prefers-reduced-motion` respected

## Security

- CSRF on facility/org POST switchers and logout
- Server-validated org/facility IDs
- No open redirects
- Navigation hiding ≠ authorization
- Cross-tenant resources → safe denial

## View-model composition

`buildActiveClinicShellViewModel` supplies product, staff, org, HCO, facilities, permissions, navigation, breadcrumbs, pageHeader, flash, csrf, accountMenu. Routes add `pageData` only.

## Stitch integration guidance

Future Stitch screens should:

1. Reuse this shell layout
2. Supply pageHeader / breadcrumbs / pageData
3. Keep product CSS under `public/activeclinic/`
4. Never import BlessBoard shell partials
