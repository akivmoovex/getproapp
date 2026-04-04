import { wrapAppShell, wrapDsContainer } from "../story-utils.js";
import { buildSearchBarForm } from "../fixtures/search-bar-html.js";
import { directoryCardHtml } from "../fixtures/directory-card-html.js";
import { directoryEmptyRichHtml } from "../fixtures/empty-state-html.js";

export default {
  title: "Design system/Patterns/Directory",
  parameters: {
    docs: {
      description: {
        component: "Directory toolbar + meta + results grid patterns (static composition).",
      },
    },
  },
};

export const ToolbarAndMeta = () =>
  wrapAppShell(
    wrapDsContainer(`<div class="sb-preview-wide">
    <div id="site-search-bar" class="c-search-bar-shell gp-home-search gp-home-search-card" aria-label="Directory search">
    ${buildSearchBarForm({ idPrefix: "sb-dtb", searchQuery: "Electrician", cityQuery: "Lusaka" })}
    </div>
    <p class="muted sb-mt-2"><strong>24</strong> results · “Electrician” · Lusaka</p>
  </div>`)
  );

ToolbarAndMeta.storyName = "Toolbar + meta line";

export const CardGrid = () =>
  wrapAppShell(
    wrapDsContainer(`<div class="sb-grid-2">
    ${directoryCardHtml({ title: "Alpha Build Co.", initials: "AB" })}
    ${directoryCardHtml({ title: "Beta Plumbing Ltd", category: "Plumbing", initials: "BP" })}
  </div>`)
  );

CardGrid.storyName = "Result card grid";

export const EmptyState = () => wrapAppShell(wrapDsContainer(directoryEmptyRichHtml()));

EmptyState.storyName = "Empty state";

export const DenseResults = () =>
  wrapAppShell(
    wrapDsContainer(`<div class="sb-dense-stack">
    ${directoryCardHtml({ title: "One" })}
    ${directoryCardHtml({ title: "Two", category: "Electrical" })}
    ${directoryCardHtml({ title: "Three", category: "HVAC" })}
    ${directoryCardHtml({ title: "Four" })}
  </div>`)
  );

DenseResults.storyName = "Dense list";
