import { wrapAppShell } from "../story-utils.js";
import { buildSearchBarForm, withServiceDropdownOpen } from "../fixtures/search-bar-html.js";

export default {
  title: "Design system/Components/SearchBar",
  parameters: {
    docs: {
      description: {
        component:
          "Markup generated from the same structure as `views/partials/components/search_bar.ejs` via `design-system/fixtures/search-bar-html.js`. Autocomplete JS is not loaded in Storybook — use `/ui` or the app for live lists.",
      },
    },
  },
};

export const DirectoryDefault = () =>
  wrapAppShell(`<div class="sb-preview-wide">${buildSearchBarForm({ idPrefix: "sb-dir", formAction: "/directory" })}</div>`);

DirectoryDefault.storyName = "Directory (wide)";

export const HomepageShell = () =>
  wrapAppShell(`<div id="site-search-bar" class="c-search-bar-shell gp-home-search gp-home-search-card sb-preview-home-search" aria-label="Project search">
  ${buildSearchBarForm({ idPrefix: "sb-home", formAction: "/directory" })}
</div>`);

HomepageShell.storyName = "Homepage (search card shell)";

export const MobileStacked = () =>
  wrapAppShell(`<div class="sb-preview-narrow">${buildSearchBarForm({ idPrefix: "sb-mob" })}</div>`);

MobileStacked.storyName = "Mobile (narrow column)";

export const WithCategory = () =>
  wrapAppShell(`<div class="sb-preview-wide">${buildSearchBarForm({
    idPrefix: "sb-cat",
    showCategoryFilter: true,
    categories: [
      { slug: "builders", name: "Builders" },
      { slug: "plumbing", name: "Plumbing" },
    ],
  })}</div>`);

WithCategory.storyName = "With category filter";

export const AutocompleteOpen = () => {
  const pre = "sb-acopen";
  const html = buildSearchBarForm({ idPrefix: pre, searchQuery: "Ele" });
  return wrapAppShell(`<div class="sb-preview-wide">${withServiceDropdownOpen(html, pre)}</div>`);
};

AutocompleteOpen.storyName = "Service dropdown open (static)";
