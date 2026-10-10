"use strict";

/**
 * Shared public contract and renderer for an existing tenant whose public
 * website has not been published. Product routes provide the adapter; this
 * module intentionally knows nothing about product routing or RBAC.
 */
const escapeHtml = (value) =>
  String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function createWebsiteUnpublishedState(input) {
  const value = input || {};
  return Object.freeze({
    product: String(value.product || ""),
    organizationName: String(value.organizationName || "This organization"),
    organizationType: String(value.organizationType || "organization"),
    directoryUrl: String(value.directoryUrl || "/directory"),
    loginUrl: String(value.loginUrl || "/login"),
    customizeUrl: value.customizeUrl ? String(value.customizeUrl) : null,
    isAuthenticated: value.isAuthenticated === true,
    canEditWebsite: value.canEditWebsite === true,
    status: String(value.status || "setup_in_progress"),
    branding: value.branding && typeof value.branding === "object" ? { ...value.branding } : {},
  });
}

function renderWebsiteUnpublishedState(input) {
  const state = createWebsiteUnpublishedState(input);
  const brand = state.branding.name || (state.product === "activeclinic" ? "ActiveClinic" : "BlessBoard");
  const action = state.canEditWebsite && state.customizeUrl
    ? `<a class="wus-button wus-button--primary" href="${escapeHtml(state.customizeUrl)}">Continue website setup</a>`
    : state.isAuthenticated
      ? ""
      : `<a class="wus-button wus-button--secondary" href="${escapeHtml(state.loginUrl)}">Sign in to customize website</a>`;
  const color = state.branding.primary || (state.product === "activeclinic" ? "#2563eb" : "#6c5ce7");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(state.organizationName)} · Coming soon</title><style>
  :root{--wus-brand:${escapeHtml(color)}}*{box-sizing:border-box}body{margin:0;background:#f8f7f4;color:#20202a;font-family:Arial,sans-serif}.wus{min-height:100vh;display:grid;place-items:center;padding:24px}.wus-card{width:min(100%,720px);padding:clamp(32px,7vw,76px);background:#fff;border:1px solid #e8e5df;border-radius:24px;box-shadow:0 16px 50px #24201b12;text-align:center}.wus-brand{color:var(--wus-brand);font-weight:700;letter-spacing:.04em}.wus-status{display:inline-block;margin:22px 0 8px;padding:8px 12px;border-radius:999px;background:#f0edff;color:var(--wus-brand);font-size:13px;font-weight:700}.wus h1{margin:12px 0;font-size:clamp(30px,5vw,52px);line-height:1.08}.wus p{color:#65636b;line-height:1.6}.wus-actions{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:28px}.wus-button{min-height:48px;padding:14px 20px;border-radius:12px;text-decoration:none;font-weight:700}.wus-button--primary{background:var(--wus-brand);color:#fff}.wus-button--secondary{border:1px solid #d8d5cf;color:#26252c}.wus-button:focus-visible{outline:3px solid #f6b73c;outline-offset:3px}@media(max-width:520px){.wus-card{border-radius:18px}.wus-actions>*{width:100%}}
  </style></head><body><main class="wus"><section class="wus-card" aria-labelledby="wus-title"><div class="wus-brand">${escapeHtml(brand)}</div><div class="wus-status">Setup in progress</div><h1 id="wus-title">${escapeHtml(state.organizationName)}’s website is being prepared</h1><p>This website is being prepared and is not public yet. Please check back soon.</p><div class="wus-actions">${action}<a class="wus-button wus-button--secondary" href="${escapeHtml(state.directoryUrl)}">Return to ${escapeHtml(state.organizationType)} directory</a></div></section></main></body></html>`;
}

module.exports = { createWebsiteUnpublishedState, renderWebsiteUnpublishedState };
