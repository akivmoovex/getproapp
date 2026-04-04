import { wrapAppShell } from "../story-utils.js";
import { buildSearchBarForm } from "../fixtures/search-bar-html.js";

export default {
  title: "Design system/Patterns/Homepage",
  parameters: {
    docs: {
      description: {
        component: "Homepage hero search band — structure aligned with `views/index.ejs` search shell.",
      },
    },
  },
};

export const SearchSection = () =>
  wrapAppShell(`<div class="sb-preview-home-search">
  <div id="gp-home-search" class="gp-home-search gp-home-search-card" aria-label="Project search">
    ${buildSearchBarForm({ idPrefix: "sb-hp", formAction: "/directory", searchQuery: "", cityQuery: "" })}
  </div>
</div>`);

SearchSection.storyName = "Search section";
