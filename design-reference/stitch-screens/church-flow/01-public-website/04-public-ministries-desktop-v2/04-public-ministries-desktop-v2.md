---
name: Ecclesia Modern
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
  tertiary: '#57595b'
  on-tertiary: '#ffffff'
  tertiary-container: '#707273'
  on-tertiary-container: '#f7f8f9'
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
  tertiary-fixed: '#e1e3e4'
  tertiary-fixed-dim: '#c5c7c8'
  on-tertiary-fixed: '#191c1d'
  on-tertiary-fixed-variant: '#454748'
  background: '#f1fbff'
  on-background: '#131d21'
  surface-variant: '#d9e4e9'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
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
  label-lg:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  label-md:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style
The design system is engineered for a multi-tenant church management environment, balancing administrative power with pastoral warmth. The personality is "Structured Compassion"—it must feel as reliable as an enterprise ERP while remaining as approachable as a local community center. 

The aesthetic follows a **Modern Corporate** direction with heavy influences from **Material Design 3**. It prioritizes clarity through high-quality whitespace, a systematic approach to density for data-heavy administrative tasks, and a soft, tactile feel for member-facing interfaces. The goal is to evoke a sense of calm organization and institutional trust.

## Colors
The palette is anchored by "GetPro Violet," used strategically for primary actions and brand presence. 

- **Primary (Violet):** Used for main call-to-action buttons, active states, and primary brand markers.
- **Secondary (Deep Charcoal):** Reserved for navigation shells, sidebars, and headings to provide a grounded, authoritative structure.
- **Background (Soft Gray):** A deliberate off-white (#F9FAFB) is used for the main canvas to reduce eye strain during long administrative sessions.
- **Surface:** Pure white (#FFFFFF) is used for cards and containers to create a clear "layer" above the soft gray background.
- **Semantic Colors:** These follow standard functional patterns but are adjusted for high legibility against white surfaces.

## Typography
The design system utilizes **Inter** exclusively to ensure a clean, systematic feel across all platforms. 

- **Scale:** A tight typographic scale is used to manage high-density information (member lists, financial reports) while maintaining readability.
- **Headings:** Use the Deep Charcoal color for all headings to establish a strong visual hierarchy.
- **Data Tables:** Use `body-md` for row content and `label-lg` (uppercase) for column headers to differentiate between data and metadata.
- **Line Height:** Generous line heights are applied to body text to ensure the "warm and practical" brand promise is met, preventing the UI from feeling cramped.

## Layout & Spacing
The system is built on a strict **8px grid**. All dimensions, padding, and margins must be multiples of 8.

- **Grid Model:** A 12-column fluid grid for desktop with 24px gutters. For administrative dashboards, use a "Sticky Sidebar" navigation model (280px width) with a fluid content area.
- **Density:** Provide two density modes. "Standard" for member-facing views (larger padding) and "Compact" for HQ Admin views (smaller padding, specifically in data tables).
- **Breakpoints:**
  - Mobile: < 600px (Single column, 16px margins)
  - Tablet: 600px - 1024px (8 columns, 24px margins)
  - Desktop: > 1024px (12 columns, 32px margins)

## Elevation & Depth
In accordance with Material Design 3 principles, depth is communicated through **Tonal Layers** and **Soft Ambient Shadows**.

- **Level 0 (Background):** Soft off-white surface.
- **Level 1 (Cards/Containers):** White surface with a very subtle 1px border (#E2E8F0) and no shadow. Used for secondary information.
- **Level 2 (Interactive Cards):** White surface with a soft, diffused shadow (Y: 4px, Blur: 12px, 5% Opacity Black).
- **Level 3 (Modals/Popovers):** Higher elevation shadow (Y: 8px, Blur: 24px, 10% Opacity Black) to indicate clear separation from the workspace.
- **Transitions:** Use subtle surface-tint overlays (primary color at 5% opacity) when hovering over list items or interactive table rows.

## Shapes
The design system uses a **Rounded** shape language to maintain the "warm and approachable" feel. 

- **Components:** Standard buttons, input fields, and small cards use a 0.5rem (8px) corner radius.
- **Containers:** Large dashboard widgets and main content containers use a 1rem (16px) radius.
- **Special Elements:** Search bars and "Join" buttons for members may use pill-shaped (full-round) styling to feel more inviting.

## Components
- **Buttons:** 
  - *Primary:* Filled GetPro Violet with white text. 
  - *Secondary:* Outlined Violet or Deep Charcoal. 
  - *Tertiary:* Ghost buttons for low-priority actions.
- **Navigation Shell:** A vertical sidebar for admins using the Deep Charcoal background. Icons should be "Outlined" style, switching to "Filled" on active states.
- **Data Tables:** Essential for church management. Features include:
  - Sticky headers.
  - Alternating row zebra-striping (optional, very subtle).
  - Inline status chips (e.g., "Active" in Green, "Inactive" in Gray).
- **Input Fields:** Outlined style with floating labels. Focus state uses a 2px Violet border. Error states use the Red semantic color for both border and helper text.
- **Cards:** Used for "Ministry Summaries" or "Member Profiles." Cards should have a consistent padding of 24px and clear internal hierarchy (Title -> Metadata -> Action).
- **Chips:** Small, rounded indicators for tags (e.g., "Small Group," "Volunteer," "Donor"). Use low-saturation background tints of the primary or semantic colors.