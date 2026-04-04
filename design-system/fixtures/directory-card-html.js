/**
 * Mirror of directory listing card markup (`ds-card pro-directory-card`).
 * Keep aligned with `views/directory.ejs` / card partials when structure changes.
 */

export function directoryCardHtml(opts = {}) {
  const title = opts.title || "Alice Builders";
  const category = opts.category || "Builders";
  const loc = opts.location || "Lusaka";
  const excerpt =
    opts.excerpt ||
    "Clean work, clear timelines, and direct communication for residential construction projects.";
  const footer = opts.footer || "Verified · 4.7 ★";
  const initials = opts.initials || "AB";

  return `<article class="ds-card pro-directory-card">
  <a class="pro-directory-card__link" href="#">
    <div class="pro-directory-card__media" aria-hidden="true">
      <div class="pro-directory-card__avatar"><span class="pro-directory-card__initials">${initials}</span></div>
    </div>
    <div class="pro-directory-card__body">
      <div class="pro-directory-card__header">
        <h3 class="pro-directory-card__title">${title}</h3>
      </div>
      <div class="pro-directory-card__meta-line" aria-label="Listing details">
        <span class="pro-directory-card__category">${category}</span>
        <span class="pro-directory-card__loc">${loc}</span>
      </div>
      <p class="pro-directory-card__excerpt">${excerpt}</p>
      <p class="pro-directory-card__footer">
        <span class="pro-directory-card__host">${footer}</span>
      </p>
    </div>
  </a>
</article>`;
}
