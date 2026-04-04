import { wrapAppShell } from "../story-utils.js";

export default {
  title: "Design system/Components/Button",
  parameters: {
    docs: {
      description: {
        component:
          "Production classes: `.btn` + `.btn--primary` | `.btn--secondary` | `.btn--outline` | `.btn--text`, sizes `.btn--sm` | `.btn--lg` | `.btn--icon`. Source of truth for markup: `views/partials/components/button.ejs`.",
      },
    },
  },
};

const shell = (html) => wrapAppShell(`<div class="flex-row-wrap">${html}</div>`);

export const Primary = () => shell(`<button type="button" class="btn btn--primary">Primary</button>`);

export const Secondary = () => shell(`<button type="button" class="btn btn--secondary">Secondary</button>`);

export const Outline = () => shell(`<button type="button" class="btn btn--outline">Outline</button>`);

export const Text = () => shell(`<button type="button" class="btn btn--text">Text</button>`);

export const Disabled = () =>
  shell(`
  <button type="button" class="btn btn--primary" disabled>Primary</button>
  <button type="button" class="btn btn--secondary" disabled>Secondary</button>
  <button type="button" class="btn btn--text" disabled>Text</button>
`);

const SEARCH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>`;

export const WithIcon = () =>
  shell(`<button type="submit" class="btn btn--primary pro-search-form__submit pro-home-search-submit">
  <span class="btn__text">Search</span>
  <span class="btn__icon" aria-hidden="true">${SEARCH_SVG}</span>
</button>`);

WithIcon.storyName = "With icon (search)";

export const Sizes = () =>
  shell(`
  <button type="button" class="btn btn--primary btn--sm">Small</button>
  <button type="button" class="btn btn--primary">Default</button>
  <button type="button" class="btn btn--primary btn--lg">Large</button>
  <button type="button" class="btn btn--primary btn--icon" aria-label="Add"><span class="btn__icon" aria-hidden="true">+</span></button>
`);

export const MobileWidth = () =>
  wrapAppShell(`<div class="sb-preview-narrow"><button type="button" class="btn btn--primary btn-block">Full width in narrow column</button></div>`);

MobileWidth.storyName = "Mobile width (block)";
