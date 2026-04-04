export default {
  title: "Design system/Foundations/Colors",
  parameters: {
    docs: {
      description: {
        component:
          "Semantic color roles from `public/theme.css`. Toggle **App theme** and **Brand** in the toolbar to verify contrast.",
      },
    },
  },
};

const swatch = (cls, title, token) => `
  <div class="sb-fd-swatch ${cls}">
    <div class="sb-fd-swatch__chip" aria-hidden="true"></div>
    <div class="sb-fd-swatch__label">${title}</div>
    <div class="sb-fd-swatch__meta">${token}</div>
  </div>`;

export const SemanticPalette = () =>
  `<div class="sb-fd-grid">
    ${swatch("sb-fd--primary", "Primary", "--color-primary")}
    ${swatch("sb-fd--on-primary", "On primary", "--color-on-primary")}
    ${swatch("sb-fd--bg", "Background", "--color-background")}
    ${swatch("sb-fd--surface", "Surface", "--color-surface")}
    ${swatch("sb-fd--surface-variant", "Surface variant", "--color-surface-variant")}
    ${swatch("sb-fd--on-surface", "On surface", "--color-on-surface")}
    ${swatch("sb-fd--muted", "Muted", "--color-muted")}
    ${swatch("sb-fd--outline", "Outline", "--color-outline")}
    ${swatch("sb-fd--error", "Error", "--color-error")}
  </div>`;

SemanticPalette.storyName = "Semantic roles";
