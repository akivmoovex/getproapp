import { wrapAppShell, wrapDsContainer } from "../story-utils.js";

export default {
  title: "Design system/Components/Container",
  parameters: {
    docs: {
      description: {
        component:
          "Public layout band: `.ds-container` (shared with `.container`). Max width `--layout-content-max-width`, gutters `--layout-gutter-x-*`.",
      },
    },
  },
};

export const StandardBand = () =>
  wrapAppShell(
    wrapDsContainer(
      `<p class="muted sb-p-flush">Content column — same band as homepage / directory main column.</p>`
    )
  );

StandardBand.storyName = "Standard page band";

export const NestedContent = () =>
  wrapAppShell(
    wrapDsContainer(
      `<div class="card">
      <div class="card__header"><h3 class="card__title">Inside container</h3></div>
      <div class="card__body"><p class="muted sb-p-flush">Cards and forms should live inside the layout band.</p></div>
    </div>`
    )
  );

NestedContent.storyName = "Nested content";

export const Alignment = () =>
  wrapAppShell(`<div class="ds-container">
    <div class="row-between">
      <span class="muted">Left</span>
      <span class="muted">Right</span>
    </div>
    <p class="muted sb-p-flush sb-mt-2">Use utility classes like row-between inside the band for alignment.</p>
  </div>`);
