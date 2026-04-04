export default {
  title: "Design system/Foundations/Breakpoints",
  parameters: {
    docs: {
      description: {
        component:
          "Canonical layout breakpoints from `--bp-*` (used in media queries in `public/styles.css`). Use Storybook viewport toolbar for responsive QA.",
      },
    },
  },
};

export const TokenReference = () => `<div class="sb-dense-stack">
  <div class="sb-fd-bp">--bp-xs: 480px</div>
  <div class="sb-fd-bp">--bp-sm: 600px</div>
  <div class="sb-fd-bp">--bp-md-tab: 768px</div>
  <div class="sb-fd-bp">--bp-lg: 860px</div>
  <div class="sb-fd-bp">--bp-xl-2: 920px</div>
  <div class="sb-fd-bp">--bp-max-xl: 1200px (content max)</div>
</div>`;

TokenReference.storyName = "Breakpoint tokens";
