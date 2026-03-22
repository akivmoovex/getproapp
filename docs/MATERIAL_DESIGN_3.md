# Material Design 3 alignment

GetPro maps [Material Design 3](https://m3.material.io/) (M3) guidelines to a **single CSS token layer** in `public/styles.css` (`:root`), so desktop and mobile share one system. Brand purple (`--wf-primary`) remains the **primary** key color; M3 adds **spacing**, **shape**, **elevation**, and **surface** roles around it.

## What we implement

| Area | Tokens | Notes |
|------|--------|--------|
| **Spacing** | `--md-sys-spacing-1` … `6` | 4px base; 8dp-style rhythm (`8, 12, 16, 24, 32`). |
| **Shape** | `--md-sys-shape-corner-*` | none, extra-small → extra-large; cards use **medium** (12px). |
| **Elevation** | `--md-sys-elevation-level0` … `5` | Layered shadows for cards, hero, dialogs. |
| **Surfaces** | `--md-sys-color-surface-container*` | Layered neutrals: page → low → lowest (cards). |
| **Outline** | `--md-sys-color-outline-variant` | Hairline borders on cards and panels. |
| **Motion** | `--md-sys-motion-duration-*`, `--md-sys-motion-easing-standard` | Short UI transitions; **`prefers-reduced-motion`** short-circuits animation. |
| **Touch** | CRM task forms on narrow viewports | Buttons / fields **min-height 48px** where noted (M3 touch target). |

## Typography & type scale

Body text uses **`line-height: 1.5`** on `body` (comfortable reading). Display/headline/title scales are not fully tokenized yet; headings continue to use existing utility classes with weights aligned to a clear hierarchy.

## Compliance scope

- **Full M3** (dynamic color, full type scale, every component spec) would require a component library (e.g. Material Web) or a large refactor.
- This project uses **M3-aligned tokens** plus **semantic mapping** so new UI (CRM task detail, cards, home background) follows the same rules without breaking the whole site at once.

## Where to use tokens

- New **cards / panels**: `surface-container-lowest`, `elevation-level1`, `shape-corner-medium`, `outline-variant`.
- **Vertical rhythm**: prefer `--md-sys-spacing-3` / `4` / `5` over one-off pixel gaps.
- **CRM task detail**: dedicated rules under `/* CRM task detail — M3 */` in `styles.css`.

## References

- [M3 — Foundations](https://m3.material.io/foundations)
- [M3 — Elevation](https://m3.material.io/styles/elevation/overview)
