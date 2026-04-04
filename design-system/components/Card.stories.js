import { wrapAppShell } from "../story-utils.js";
import { directoryCardHtml } from "../fixtures/directory-card-html.js";

export default {
  title: "Design system/Components/Card",
  parameters: {
    docs: {
      description: {
        component: "`.card` + BEM helpers (`card__header`, `card__actions`, `card--elevated`). Directory listings use `ds-card pro-directory-card`.",
      },
    },
  },
};

export const Basic = () =>
  wrapAppShell(`<div class="card">
  <div class="card__header">
    <h3 class="card__title">Card title</h3>
    <div class="card__meta">Supporting line</div>
  </div>
  <div class="card__body">
    <p class="muted sb-p-flush">Body copy for secondary reading.</p>
  </div>
</div>`);

export const DirectoryResult = () => wrapAppShell(directoryCardHtml());

DirectoryResult.storyName = "Directory result card";

export const LongContent = () =>
  wrapAppShell(`<div class="card">
  <div class="card__header">
    <h3 class="card__title">Very long professional business name that should wrap cleanly without breaking layout rhythm</h3>
    <div class="card__meta">Category · Location · extra meta line that also wraps</div>
  </div>
  <div class="card__body">
    <p class="muted sb-p-flush">Long excerpt: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p>
  </div>
</div>`);

LongContent.storyName = "Long title / content stress";

export const WithActions = () =>
  wrapAppShell(`<div class="card">
  <div class="card__header">
    <h3 class="card__title">Decision</h3>
    <div class="card__meta">Footer actions</div>
  </div>
  <div class="card__body">
    <p class="muted sb-p-flush">Use card__actions for button groups.</p>
  </div>
  <div class="card__footer">
    <div class="card__actions">
      <button type="button" class="btn btn--primary">Continue</button>
      <button type="button" class="btn btn--secondary">Back</button>
    </div>
  </div>
</div>`);

WithActions.storyName = "Action area";

export const Elevated = () =>
  wrapAppShell(`<div class="card card--elevated">
  <div class="card__header">
    <h3 class="card__title">Elevated</h3>
    <div class="card__meta">card--elevated</div>
  </div>
  <div class="card__body">
    <p class="muted sb-p-flush">Stronger shadow for emphasis.</p>
  </div>
</div>`);
