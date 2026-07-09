---
name: Ecclesia Command
colors:
  surface: '#f1fbff'
  surface-dim: '#d1dce0'
  surface-bright: '#f1fbff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eaf5fa'
  surface-container: '#e4f0f4'
  surface-container-high: '#dfeaef'
  surface-container-highest: '#d9e4e9'
  on-surface: '#131d21'
  on-surface-variant: '#474554'
  inverse-surface: '#283236'
  inverse-on-surface: '#e7f3f7'
  outline: '#787586'
  outline-variant: '#c8c4d7'
  surface-tint: '#5847d2'
  primary: '#5341cd'
  on-primary: '#ffffff'
  primary-container: '#6c5ce7'
  on-primary-container: '#faf6ff'
  inverse-primary: '#c6bfff'
  secondary: '#586062'
  on-secondary: '#ffffff'
  secondary-container: '#dae1e3'
  on-secondary-container: '#5d6466'
  tertiary: '#006651'
  on-tertiary: '#ffffff'
  tertiary-container: '#008167'
  on-tertiary-container: '#dffff1'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4dfff'
  primary-fixed-dim: '#c6bfff'
  on-primary-fixed: '#160066'
  on-primary-fixed-variant: '#4029ba'
  secondary-fixed: '#dde4e6'
  secondary-fixed-dim: '#c1c8ca'
  on-secondary-fixed: '#161d1f'
  on-secondary-fixed-variant: '#41484a'
  tertiary-fixed: '#6dfad2'
  tertiary-fixed-dim: '#4bddb7'
  on-tertiary-fixed: '#002018'
  on-tertiary-fixed-variant: '#005140'
  background: '#f1fbff'
  on-background: '#131d21'
  surface-variant: '#d9e4e9'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
  sidebar-width: 260px
  density-compact: 8px
  density-comfortable: 16px
---

## Brand & Style

The design system for the Platform Super Admin portal is engineered for high-stakes governance and systemic oversight. It adopts a **Corporate / Modern** aesthetic with a "Command Center" philosophy, prioritizing information density, clarity, and structural authority. The emotional response is one of absolute control and reliability.

The visual language draws heavily from **Material Design 3**, utilizing a systematic approach to layering and functional surfaces. While the core brand remains approachable, this extension introduces a stricter, more utilitarian rigor suitable for power users managing complex data schemas and global configurations.

## Colors

The palette is anchored by **GetPro Violet (#6C5CE7)**, representing systemic intelligence and primary actions. To establish an authoritative hierarchy, the navigation and structural framework utilize a **Deep Charcoal (#1E272E)**, creating a "frame" that recedes to prioritize content.

- **Primary:** Actionable elements, focus states, and key brand identifiers.
- **Surface/Nav:** Used exclusively for sidebars and top-level global headers to provide a grounded, high-contrast workspace.
- **Success/Tertiary:** Used for active status indicators and positive growth metrics.
- **Functional Neutrals:** A range of cool greys are employed to differentiate between data-heavy background surfaces and interactive component backgrounds.

## Typography

This design system uses a tri-font strategy to balance professional branding with technical precision:

1.  **Hanken Grotesk** is used for headlines and page titles, providing a contemporary, sharp, and confident voice.
2.  **Inter** serves as the primary workhorse for body text and UI controls, chosen for its exceptional legibility in data-dense environments.
3.  **JetBrains Mono** is reserved for status badges, IDs, data values, and table headers. This reinforces the "Command Center" feel and ensures numerical data is easily scannable.

On mobile devices, `display-lg` scales down to `headline-md` to maintain layout integrity.

## Layout & Spacing

The layout utilizes a **12-column fluid grid** for the main content area, pinned to a fixed-width **260px left navigation sidebar**. 

- **Density:** The system defaults to a high-density spacing model. Table rows and list items use a tight 8px vertical padding to maximize visible data.
- **Breakpoints:** At 1024px (Tablet), the sidebar collapses into a rail or hamburger menu. At 768px (Mobile), margins reduce to 16px and all grid elements stack vertically.
- **Rhythm:** All spacing is based on a 4px baseline grid. Use 16px for standard gutters and 32px for section separation.

## Elevation & Depth

Elevation is communicated through **Tonal Layers** rather than heavy shadows, ensuring the UI remains clean and "flat-mapped" like a digital dashboard.

- **Level 0 (Base):** The main canvas, using a very subtle off-white or cool grey.
- **Level 1 (Cards/Tables):** Pure white surfaces with a 1px soft border (#E2E8F0). No shadow.
- **Level 2 (Modals/Popovers):** Pure white with a 12% opacity ambient shadow (0px 8px 24px) to indicate temporary focus.
- **Sidebar:** Uses a solid dark fill with no elevation, acting as the structural anchor of the entire application.

## Shapes

The design system adopts a **Soft (0.25rem)** roundedness level. This provides a professional, "tailored" appearance that feels modern without the playfulness of fully rounded corners.

- **Small Components:** Checkboxes and small buttons use a 4px radius.
- **Containers:** Cards and main content areas use an 8px radius (`rounded-lg`).
- **Special Elements:** Status badges for "Active" or "Pending" use a 100px pill shape to distinguish them from interactive buttons.

## Components

### Tables (High-Density)
Tables are the primary vehicle for data. Use `label-md` (JetBrains Mono) for headers in all-caps with a subtle grey background. Row hover states should use a faint violet tint.

### Summary Cards
Large numeric "KPI" cards should feature a subtle 1px border. The primary value uses `display-lg`, with a small trend indicator (using `tertiary_color`) positioned in the bottom right.

### Buttons
- **Primary:** Solid #6C5CE7 with white text.
- **Secondary:** Transparent with a 1px border of #6C5CE7.
- **Destructive:** Solid red, reserved for system-wide overrides.

### Status Badges
Utilize a "Soft Fill" approach: a low-opacity background color with a high-contrast text label (e.g., a light green background with dark green text for "Success").

### Input Fields
Inputs use a "filled" style with a bottom-only border that transforms into a 2px Primary Violet border on focus. This mimics Material Design 3's high-visibility focus states.

### Navigation Sidebar
The Deep Navy sidebar uses high-contrast icons (white at 70% opacity). The active state is indicated by a vertical 4px Violet bar on the left edge and 100% white icon/text opacity.