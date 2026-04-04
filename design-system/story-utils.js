/**
 * Storybook-only helpers. Production UI remains EJS + public/styles.css.
 */

/**
 * @param {string} innerHtml
 * @returns {string}
 */
export function wrapAppShell(innerHtml) {
  return `<div class="app-layout sb-app-shell">
  <div class="app-layout__main sb-app-shell__main">${innerHtml}</div>
</div>`;
}

/**
 * @param {string} innerHtml
 * @param {string} [className]
 */
export function wrapDsContainer(innerHtml, className = "") {
  const extra = className ? ` ${className}` : "";
  return `<div class="ds-container${extra}">${innerHtml}</div>`;
}
