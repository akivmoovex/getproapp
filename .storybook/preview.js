import "../public/styles.css";
import "./preview.css";
import "../design-system/foundations/foundations-preview.css";

/** @type { import('@storybook/html').Preview } */
const preview = {
  decorators: [
    (storyFn, context) => {
      const root = document.documentElement;
      const theme = context.globals.theme;
      const brand = context.globals.brand;

      if (theme === "dark") root.setAttribute("data-theme", "dark");
      else if (theme === "light") root.setAttribute("data-theme", "light");
      else root.removeAttribute("data-theme");

      if (brand === "getpro") root.setAttribute("data-brand", "getpro");
      else if (brand === "proonline") root.setAttribute("data-brand", "proonline");
      else root.removeAttribute("data-brand");

      return storyFn();
    },
  ],
  globalTypes: {
    theme: {
      name: "App theme",
      description: "Maps to document.documentElement data-theme (same as production)",
      defaultValue: "light",
      toolbar: {
        icon: "mirror",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
          { value: "system", title: "System (unset → light default)" },
        ],
        dynamicTitle: true,
      },
    },
    brand: {
      name: "Brand",
      description: "Maps to data-brand (GetPro indigo vs Pro-online violet)",
      defaultValue: "default",
      toolbar: {
        icon: "component",
        items: [
          { value: "default", title: "Default (root tokens)" },
          { value: "getpro", title: "GetPro" },
          { value: "proonline", title: "Pro-online" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "light",
    brand: "default",
  },
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: "fullscreen",
    viewport: {
      viewports: {
        gpMobile: {
          name: "Mobile (390)",
          styles: { width: "390px", height: "844px" },
        },
        gpTablet: {
          name: "Tablet (768)",
          styles: { width: "768px", height: "1024px" },
        },
        gpDesktop: {
          name: "Desktop (1200)",
          styles: { width: "1200px", height: "800px" },
        },
      },
    },
    docs: {
      toc: true,
    },
    a11y: {
      config: {},
      options: {
        checks: { "color-contrast": { options: { noScroll: true } } },
      },
    },
  },
};

export default preview;
