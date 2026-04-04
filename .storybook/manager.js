import { addons } from "@storybook/manager-api";
import { create } from "@storybook/theming/create";

addons.setConfig({
  theme: create({
    base: "light",
    brandTitle: "GetPro · design system",
    brandUrl: "/",
    colorPrimary: "#6c5ce7",
    colorSecondary: "#5a4bd1",
  }),
});
