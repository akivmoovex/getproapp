---
name: Sacred Structure
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
  primary: '#3b22b5'
  on-primary: '#ffffff'
  primary-container: '#5341cd'
  on-primary-container: '#d1cbff'
  inverse-primary: '#c6bfff'
  secondary: '#586062'
  on-secondary: '#ffffff'
  secondary-container: '#dce4e6'
  on-secondary-container: '#5e6668'
  tertiary: '#404244'
  on-tertiary: '#ffffff'
  tertiary-container: '#57595b'
  on-tertiary-container: '#cfd0d2'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e4dfff'
  primary-fixed-dim: '#c6bfff'
  on-primary-fixed: '#160066'
  on-primary-fixed-variant: '#4029ba'
  secondary-fixed: '#dce4e6'
  secondary-fixed-dim: '#c0c8ca'
  on-secondary-fixed: '#151d1f'
  on-secondary-fixed-variant: '#40484a'
  tertiary-fixed: '#e2e2e4'
  tertiary-fixed-dim: '#c5c6c9'
  on-tertiary-fixed: '#191c1e'
  on-tertiary-fixed-variant: '#454749'
  background: '#f1fbff'
  on-background: '#131d21'
  surface-variant: '#d9e4e9'
  surface-sky: '#f1fbff'
  brand-orange: '#FF9800'
  glass-white: rgba(255, 255, 255, 0.7)
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
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
  section-padding: 64px
---

## Brand & Style
The brand identity for Kafue Baptist Church is defined by "Structured Compassion." It balances the warmth and welcoming nature of a faith community with the reliability and organization of a modern institutional portal. 

The visual style is **Corporate Modern with Glassmorphic accents**. It uses a clean, systematic foundation (Material-inspired) but softens the experience with ethereal background blurs and "hero mesh" gradients. This evokes a sense of "digital sanctuary"—professional enough for administrative tasks (giving, registration) while remaining spiritually inviting through light, airy surfaces and soft indigo tints.

## Colors
The palette is anchored in **Deep Indigo (#5341cd)**, representing authority and spiritual depth, paired with a very light **Sky Blue surface (#f1fbff)** that prevents the interface from feeling heavy or clinical.

- **Primary:** Used for main actions, brand accents, and active states.
- **Secondary:** A cool slate-grey used for secondary text and icons to maintain high legibility without the harshness of pure black.
- **Tints:** Extensive use of `primary-fixed` (pale lavender) for badges and low-priority containers.
- **Accents:** A specific `brand-orange` is reserved for partner branding (GetPro) to ensure distinct identity separation.
- **Backgrounds:** Utilize `surface-sky` as the base canvas, with `surface-container-lowest` (pure white) used to pop key content cards.

## Typography
The system relies exclusively on **Inter**, utilizing its variable weight range to create hierarchy. 

- **Display & Headlines:** Use semi-bold to bold weights with slight negative letter-spacing for a modern, compact look in hero sections.
- **Body:** Standardized on 16px for readability, with 14px used for denser informational components.
- **Labels:** Small, all-caps or high-weight styles are used for badges and eyebrow text (e.g., "Welcome Home") to differentiate them from interactive elements.
- **Responsiveness:** For mobile, `display-lg` should scale down to 32px to ensure readability without excessive wrapping.

## Layout & Spacing
The layout uses a **Fixed Grid** approach for desktop, centered at a 1280px (`max-w-7xl`) container. 

- **Grid:** A 12-column system is used for feature blocks, often splitting into 8+4 or 4+4+4 configurations.
- **Rhythm:** Spacing follows an 8px base unit. Section vertical padding is generous (64px to 80px) to maintain the "airy" feel.
- **Mobile:** Margins shrink to 16px, and multi-column grids collapse into a single-column stack. Components like the navigation bar use a fixed 64px height.

## Elevation & Depth
Depth is created through a mix of **Tonal Layering** and **Glassmorphism**:

- **Level 0 (Background):** `surface-sky` (#f1fbff).
- **Level 1 (Cards):** Pure white surfaces with a 1px `outline-variant` border. No shadow or very subtle `shadow-sm`.
- **Level 2 (Floating/Interactive):** Elements like the navigation bar or specific feature cards use `shadow-md` on hover.
- **Special Elevation:** The "Glass Card" effect uses `backdrop-blur(12px)` and a semi-transparent white background to overlay images, creating a sophisticated layered look.
- **Hero Depth:** Soft radial gradients (Mesh) provide a sense of atmospheric depth without using hard shadows.

## Shapes
The shape language is consistently **Rounded**.

- **Standard Buttons & Cards:** Use a 0.5rem (8px) radius.
- **Larger Containers:** Use 0.75rem to 1rem (12px to 16px) for a softer, more modern appearance.
- **Badges/Chips:** Use "Full" pill-shaped rounding to distinguish them from actionable buttons.
- **Media:** Images should always carry the `rounded-xl` (12px) treatment to match the UI container style.

## Components

### Buttons
- **Primary:** Solid `#5341cd` background with white text. 8px border radius. Hover state involves a slight shadow increase and background shift to `primary-container`.
- **Secondary/Outline:** 1px border using `outline-variant`, primary color text.
- **Ghost:** No border or background, transitions to `surface-container-low` on hover.

### Cards
- **Feature Cards:** White background, 1px border, 16px padding.
- **Glass Cards:** 70% white opacity, 12px blur, used for overlaying text on imagery.

### Badges
- Small, pill-shaped containers. Primary badge uses `primary-fixed` background with `on-primary-fixed-variant` text.

### Inputs & Fields
- Not explicitly shown but should follow the 8px rounding, using `outline-variant` for borders and `surface-container-low` for subtle background fills in inactive states.

### Icons
- Use **Material Symbols Outlined**. Standardize on 20px-24px size. Icons within primary containers should use a "Fill" variation on hover to add interactivity.