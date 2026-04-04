import { wrapAppShell } from "../story-utils.js";

export default {
  title: "Design system/Components/Input",
  parameters: {
    docs: {
      description: {
        component:
          "`.input-field`, `.join-plain-input`, `.input-field--error`, `.pro-ac` shells match join + search forms. EJS partials remain authoritative for production.",
      },
    },
  },
};

export const Default = () =>
  wrapAppShell(`<div class="join-field input-field">
  <label class="input-field__label" for="sb-in-def">Full name</label>
  <input id="sb-in-def" class="join-plain-input input-field__control" type="text" placeholder="e.g. Jane Banda" autocomplete="name" />
</div>`);

export const Focused = () =>
  wrapAppShell(`<div class="join-field input-field">
  <label class="input-field__label" for="sb-in-foc">Email</label>
  <input id="sb-in-foc" class="join-plain-input input-field__control sb-input-focus-target" type="email" value="you@example.com" autocomplete="email" />
</div>`);

Focused.decorators = [
  (story) => {
    const html = story();
    return `<div class="sb-input-focus-preview is-focus-simulated">${html}</div>`;
  },
];

Focused.storyName = "Focused (simulated ring)";

export const WithHelper = () =>
  wrapAppShell(`<div class="join-field input-field">
  <label class="input-field__label" for="sb-in-help">Business name</label>
  <input id="sb-in-help" class="join-plain-input input-field__control" type="text" />
  <p class="input-field__help">Shown on your public profile.</p>
</div>`);

WithHelper.storyName = "With helper text";

export const Error = () =>
  wrapAppShell(`<div class="join-field input-field input-field--error">
  <label class="input-field__label" for="sb-in-err">Phone</label>
  <input id="sb-in-err" class="join-plain-input input-field__control" type="tel" aria-invalid="true" />
  <p class="input-field__error" role="alert">Enter a valid phone number.</p>
</div>`);

export const LongLabel = () =>
  wrapAppShell(`<div class="join-field input-field">
  <label class="input-field__label" for="sb-in-long">Registered business legal name as shown on tax documents</label>
  <input id="sb-in-long" class="join-plain-input input-field__control" type="text" />
</div>`);

LongLabel.storyName = "Long label";

export const SelectControl = () =>
  wrapAppShell(`<div class="input-field">
  <label class="input-field__label" for="sb-sel">Category</label>
  <select id="sb-sel" class="pro-search-form__select input-field__control" aria-label="Category">
    <option value="">All categories</option>
    <option value="builders">Builders</option>
    <option value="plumbing">Plumbing</option>
  </select>
</div>`);

SelectControl.storyName = "Select (search styling)";
