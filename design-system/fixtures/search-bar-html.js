/**
 * Static HTML mirror of `views/partials/components/search_bar.ejs` for Storybook.
 * When the EJS partial changes, update this fixture in the same change.
 */

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SEARCH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>`;

const SUBMIT_BTN = `<button type="submit" class="btn btn--primary pro-search-form__submit pro-home-search-submit"><span class="btn__text">Search</span><span class="btn__icon" aria-hidden="true">${SEARCH_SVG}</span></button>`;

/**
 * @param {object} opts
 * @param {string} [opts.idPrefix]
 * @param {string} [opts.formAction]
 * @param {string} [opts.formId]
 * @param {string} [opts.searchQuery]
 * @param {string} [opts.cityQuery]
 * @param {boolean} [opts.showCategoryFilter]
 * @param {string} [opts.selectedCategory]
 * @param {{slug:string,name:string}[]} [opts.categories]
 * @param {string} [opts.ariaLabel]
 */
export function buildSearchBarForm(opts = {}) {
  const pre = String(opts.idPrefix || "sb").replace(/[^a-z0-9_-]/gi, "") || "sb";
  const action = esc(opts.formAction != null ? opts.formAction : "/directory");
  const q = esc(opts.searchQuery || "");
  const city = esc(opts.cityQuery || "");
  const formIdAttr = opts.formId ? ` id="${esc(opts.formId)}"` : "";
  const aria = esc(opts.ariaLabel || "Search by service and city");
  const categories = Array.isArray(opts.categories) ? opts.categories : [];
  const showCat = !!opts.showCategoryFilter && categories.length > 0;
  const selCat = String(opts.selectedCategory || "").trim();

  let categoryBlock = "";
  if (showCat) {
    const options = categories
      .map((c) => {
        const slug = esc(c.slug);
        const name = esc(c.name);
        const selected = selCat === c.slug ? " selected" : "";
        return `<option value="${slug}"${selected}>${name}</option>`;
      })
      .join("");
    categoryBlock = `<div class="pro-search-form__category input-field">
    <label class="pro-search-form__label pro-home-field-label input-field__label" for="${pre}-category-filter">Category</label>
    <select id="${pre}-category-filter" name="category" class="pro-search-form__select input-field__control" aria-label="Filter by category">
      <option value=""${!selCat ? " selected" : ""}>All categories</option>${options}
    </select>
  </div>`;
  } else if (selCat) {
    categoryBlock = `<input type="hidden" name="category" value="${esc(selCat)}" />`;
  }

  return `<form${formIdAttr} class="pro-search-form gp-search-bar" action="${action}" method="get" role="search" aria-label="${aria}">
  ${categoryBlock}
  <div class="pro-search-form__toolbar-row">
    <div class="pro-search-form__fields pro-home-search-fields">
      <div class="pro-search-form__field pro-home-search-field input-field input-field--search">
        <label class="pro-search-form__label pro-home-field-label input-field__label" for="${pre}-search-q">Service or profession</label>
        <div class="pro-ac" data-ac-list="service" data-watermark-rotate="Electrician|Plumber|Carpenter">
          <input id="${pre}-search-q" class="pro-ac-input input-field__control" type="text" value="${q}" placeholder="" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${pre}-search-q-dropdown" />
          <input type="hidden" class="pro-ac-hidden" name="q" id="${pre}-search-q-value" value="${q}" />
          <ul class="pro-ac-dropdown" id="${pre}-search-q-dropdown" role="listbox" hidden></ul>
          <p class="pro-ac-msg input-field__error" hidden></p>
        </div>
      </div>
      <div class="pro-search-form__field pro-home-search-field input-field input-field--search">
        <label class="pro-search-form__label pro-home-field-label input-field__label" for="${pre}-search-city">City</label>
        <div class="pro-ac" data-ac-list="city" data-watermark-rotate="Lusaka|Ndola|Kitwe">
          <input id="${pre}-search-city" class="pro-ac-input input-field__control" type="text" value="${city}" placeholder="" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${pre}-search-city-dropdown" />
          <input type="hidden" class="pro-ac-hidden" name="city" id="${pre}-search-city-value" value="${city}" />
          <ul class="pro-ac-dropdown" id="${pre}-search-city-dropdown" role="listbox" hidden></ul>
          <p class="pro-ac-msg input-field__error" hidden></p>
        </div>
      </div>
    </div>
    ${SUBMIT_BTN}
  </div>
</form>`;
}

/**
 * Replace the hidden service dropdown with a visible list (static visual QA).
 * @param {string} html from buildSearchBarForm
 * @param {string} idPrefix same prefix passed to buildSearchBarForm
 */
export function withServiceDropdownOpen(html, idPrefix) {
  const pre = String(idPrefix || "sb");
  const emptyUl = `<ul class="pro-ac-dropdown" id="${pre}-search-q-dropdown" role="listbox" hidden></ul>`;
  const openUl = `<ul class="pro-ac-dropdown" id="${pre}-search-q-dropdown" role="listbox">
    <li class="pro-ac-option" role="option">Electrician</li>
    <li class="pro-ac-option is-active" role="option">Electrical engineer</li>
    <li class="pro-ac-option" role="option">Elevator technician</li>
  </ul>`;
  let out = html.replace(emptyUl, openUl);
  out = out.replace('aria-expanded="false"', 'aria-expanded="true"');
  return out;
}
