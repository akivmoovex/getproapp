/** @type { import('@storybook/html-vite').StorybookConfig } */
const config = {
  stories: [
    "../design-system/docs/**/*.mdx",
    "../design-system/**/*.stories.@(js|mjs)",
  ],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-interactions",
    "@storybook/addon-a11y",
  ],
  framework: {
    name: "@storybook/html-vite",
    options: {},
  },
  staticDirs: ["../public"],
  core: {
    disableTelemetry: true,
  },
};

export default config;
