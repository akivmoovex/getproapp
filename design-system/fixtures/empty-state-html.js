/** Mirror of rich empty state (`pro-directory-empty--rich`). */

export function directoryEmptyRichHtml() {
  return `<div class="pro-directory-empty pro-directory-empty--rich" role="status" aria-live="polite">
  <div class="pro-directory-empty__inner">
    <h2 class="pro-directory-empty__title">No professionals found</h2>
    <p class="pro-directory-empty__hint muted">Leave your details and we’ll help connect you with a suitable professional.</p>
    <div class="pro-directory-empty__edit-search muted">
      <a class="pro-directory-empty__edit-search-link" href="#">Jump to search</a>
    </div>
    <div class="pro-directory-empty__actions">
      <a class="btn btn--primary" href="#" role="button">Request a call</a>
      <a class="btn btn--text" href="#" role="button">Adjust filters</a>
    </div>
  </div>
</div>`;
}
