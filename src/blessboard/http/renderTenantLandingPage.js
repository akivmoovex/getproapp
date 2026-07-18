"use strict";

/**
 * Safe HTML renderers for V5 apex shell + read-only tenant landing.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const TENANT_LANDING_TEMPLATE = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "views",
  "blessboard",
  "v5",
  "tenant-landing.ejs"
);

let tenantLandingSource = null;
function loadTenantLandingSource() {
  if (tenantLandingSource == null) {
    tenantLandingSource = fs.readFileSync(TENANT_LANDING_TEMPLATE, "utf8");
  }
  return tenantLandingSource;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ROLE_LABELS = Object.freeze({
  platform_admin: "Platform admin",
  church_hq_admin: "Church HQ admin",
  branch_admin: "Branch admin",
});

/**
 * @param {string} roleKey
 */
function formatRoleLabel(roleKey) {
  const key = String(roleKey || "");
  return ROLE_LABELS[key] || key.replace(/_/g, " ");
}

/**
 * @param {{
 *   authenticated?: boolean,
 *   active?: 'home'|'login'|'account',
 *   csrfToken?: string | null
 * }} opts
 */
function renderApexNav(opts) {
  const authenticated = Boolean(opts && opts.authenticated);
  const active = (opts && opts.active) || "home";
  const csrf = opts && opts.csrfToken ? String(opts.csrfToken) : "";
  const link = (href, label, key) => {
    const cls = key === active ? ' class="is-active"' : "";
    return `<a href="${href}"${cls}>${escapeHtml(label)}</a>`;
  };

  if (!authenticated) {
    return `<nav class="bb-v5-nav" aria-label="Primary">
  ${link("/", "Home", "home")}
  ${link("/login", "Login", "login")}
</nav>`;
  }

  return `<nav class="bb-v5-nav" aria-label="Primary">
  ${link("/", "Home", "home")}
  ${link("/account", "Account", "account")}
  <form class="bb-v5-nav__logout" method="post" action="/logout">
    <input type="hidden" name="_csrf" value="${escapeHtml(csrf)}" />
    <button type="submit">Logout</button>
  </form>
</nav>`;
}

const SHELL_STYLES = `
:root { color-scheme: light; --violet: #6C5CE7; --ink: #1a1625; --muted: #5c5668; --bg: #f7f5fb; --line: #e4dfec; --err: #b42318; --ok: #0f766e; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Hanken Grotesk", system-ui, sans-serif; background: var(--bg); color: var(--ink); }
.bb-v5-shell { max-width: 42rem; margin: 0 auto; padding: 1.25rem 1.25rem 3rem; }
.bb-v5-brand { font-weight: 700; letter-spacing: -0.02em; color: var(--violet); text-decoration: none; font-size: 1.15rem; }
.bb-v5-top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--line); margin-bottom: 2rem; }
.bb-v5-nav { display: flex; align-items: center; gap: 0.85rem; flex-wrap: wrap; }
.bb-v5-nav a { color: var(--muted); text-decoration: none; font-size: 0.95rem; }
.bb-v5-nav a.is-active { color: var(--ink); font-weight: 600; }
.bb-v5-nav__logout { display: inline; margin: 0; }
.bb-v5-nav__logout button { border: 0; background: transparent; color: var(--muted); font: inherit; cursor: pointer; padding: 0; }
.bb-v5-nav__logout button:hover { color: var(--ink); }
h1 { font-size: 2rem; letter-spacing: -0.02em; margin: 0 0 0.75rem; color: var(--violet); }
p { margin: 0 0 0.75rem; line-height: 1.55; color: var(--muted); }
.note { font-size: 0.9rem; }
.err { color: var(--err); }
label { display: block; font-size: 0.9rem; margin: 0.75rem 0 0.25rem; color: var(--ink); }
input { width: 100%; padding: 0.65rem 0.75rem; border: 1px solid #d0cad8; border-radius: 8px; font: inherit; }
button.bb-v5-btn { margin-top: 1.25rem; width: 100%; padding: 0.7rem 1rem; border: 0; border-radius: 8px; background: var(--violet); color: #fff; font: inherit; cursor: pointer; }
.bb-v5-badge { display: inline-block; font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 999px; background: #efeaff; color: var(--violet); margin-bottom: 0.75rem; }
.bb-v5-env { display: inline-block; font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 999px; background: #ecfdf5; color: var(--ok); margin-left: 0.35rem; }
.bb-v5-meta { margin-top: 1.5rem; font-size: 0.9rem; }
dl { line-height: 1.6; }
dt { font-weight: 600; margin-top: 0.75rem; color: var(--ink); }
dd { margin: 0; color: var(--muted); }
`;

/**
 * @param {{
 *   title: string,
 *   bodyHtml: string,
 *   authenticated?: boolean,
 *   active?: 'home'|'login'|'account',
 *   csrfToken?: string | null
 * }} opts
 */
function renderApexShell(opts) {
  const nav = renderApexNav({
    authenticated: opts.authenticated,
    active: opts.active,
    csrfToken: opts.csrfToken,
  });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)} · BlessBoard</title>
  <style>${SHELL_STYLES}</style>
</head>
<body>
  <div class="bb-v5-shell">
    <header class="bb-v5-top">
      <a class="bb-v5-brand" href="/">BlessBoard</a>
      ${nav}
    </header>
    <main>
      ${opts.bodyHtml}
    </main>
  </div>
</body>
</html>`;
}

/**
 * @param {{ authenticated?: boolean, csrfToken?: string | null }} opts
 */
function renderFoundationHome(opts) {
  const body = `
    <h1>BlessBoard</h1>
    <p>V5 foundation mode is running against the platform database.</p>
    <p class="note">Apex sign-in is available. Tenant portals remain unavailable unless tenant routing is explicitly enabled.</p>
  `;
  return renderApexShell({
    title: "Home",
    bodyHtml: body,
    authenticated: opts && opts.authenticated,
    active: "home",
    csrfToken: opts && opts.csrfToken,
  });
}

/**
 * @param {{ error?: string, csrfToken: string, authenticated?: boolean, hostKind?: 'apex'|'tenant', churchDisplayName?: string, nextPath?: string | null, transferToken?: string | null, transferHostname?: string | null }} opts
 */
function renderLoginPage(opts) {
  const hostKind = opts.hostKind === "tenant" ? "tenant" : "apex";
  const error = opts.error
    ? `<p class="err" role="alert">${escapeHtml(opts.error)}</p>`
    : "";
  const transferNote =
    hostKind === "apex" && opts.transferHostname
      ? `<p class="note">Continue sign-in for <strong>${escapeHtml(opts.transferHostname)}</strong></p>`
      : "";
  const subtitle =
    hostKind === "tenant"
      ? opts.churchDisplayName
        ? `Sign in to ${escapeHtml(opts.churchDisplayName)}`
        : "BlessBoard V5 tenant sign-in"
      : opts.transferHostname
        ? "BlessBoard V5 tenant transfer"
        : "BlessBoard V5 apex authentication";
  const transferField =
    hostKind === "apex" && opts.transferToken
      ? `<input type="hidden" name="tr" value="${escapeHtml(opts.transferToken)}" />`
      : "";
  const body = `
    <h1>Sign in</h1>
    <p class="note">${subtitle}</p>
    ${transferNote}
    ${error}
    <form method="post" action="/login" autocomplete="on">
      <input type="hidden" name="_csrf" value="${escapeHtml(opts.csrfToken)}" />
      ${transferField}
      <label for="email">Email</label>
      <input id="email" name="email" type="email" required autocomplete="username" />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required autocomplete="current-password" />
      <button class="bb-v5-btn" type="submit">Sign in</button>
    </form>
  `;
  return renderApexShell({
    title: "Sign in",
    bodyHtml: body,
    authenticated: false,
    active: "login",
    csrfToken: opts.csrfToken,
  });
}

/**
 * @param {{
 *   displayName: string,
 *   userId: string,
 *   deploymentCode: string,
 *   organizationId?: string | null,
 *   roles: string[],
 *   csrfToken: string,
 *   hostKind?: 'apex'|'tenant',
 *   churchDisplayName?: string,
 *   branchDisplayName?: string
 * }} account
 */
function renderAccountPage(account) {
  const hostKind = account.hostKind === "tenant" ? "tenant" : "apex";
  const roles = (account.roles || []).map((r) => escapeHtml(formatRoleLabel(r))).join(", ") || "(none)";
  const church =
    hostKind === "tenant" && account.churchDisplayName
      ? `<dt>Church</dt><dd>${escapeHtml(account.churchDisplayName)}</dd>`
      : "";
  const branch =
    hostKind === "tenant" && account.branchDisplayName
      ? `<dt>Branch</dt><dd>${escapeHtml(account.branchDisplayName)}</dd>`
      : "";
  const note =
    hostKind === "tenant"
      ? `<p class="note"><a href="/hq">Church HQ</a> · <a href="/branch-admin">Branch admin</a></p>`
      : `<p class="note">Tenant administration requires signing in on the church hostname.</p>`;
  const body = `
    <h1>Account</h1>
    <dl>
      <dt>Display name</dt><dd>${escapeHtml(account.displayName)}</dd>
      <dt>Roles</dt><dd>${roles}</dd>
      ${church}
      ${branch}
    </dl>
    ${note}
  `;
  return renderApexShell({
    title: "Account",
    bodyHtml: body,
    authenticated: true,
    active: "account",
    csrfToken: account.csrfToken,
  });
}

/**
 * Read-only tenant landing (authoritative mode only).
 * @param {{
 *   churchDisplayName: string,
 *   primaryBranchDisplayName: string,
 *   hqBranchDisplayName?: string | null,
 *   showHqIndicator?: boolean,
 *   dataEnvironment?: string | null,
 *   apexHref?: string
 * }} opts
 */
function renderTenantLandingPage(opts) {
  const env = String(opts.dataEnvironment || "").toLowerCase();
  const showEnvBadge = env === "testing" || env === "demo";
  return ejs.render(loadTenantLandingSource(), {
    churchDisplayName: String(opts.churchDisplayName || ""),
    primaryBranchDisplayName: String(opts.primaryBranchDisplayName || ""),
    hqBranchDisplayName: opts.hqBranchDisplayName ? String(opts.hqBranchDisplayName) : "",
    showHqIndicator: Boolean(opts.showHqIndicator),
    dataEnvironment: env,
    showEnvBadge,
    apexHref: opts.apexHref || "https://blessboard.org/",
  });
}

/**
 * @param {number} status
 * @param {string} message
 */
function renderControlledErrorPage(status, message) {
  const title = status === 404 ? "Not found" : "Unavailable";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · BlessBoard</title>
  <style>${SHELL_STYLES}</style>
</head>
<body>
  <div class="bb-v5-shell">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <p><a href="https://blessboard.org/">BlessBoard home</a></p>
  </div>
</body>
</html>`;
}

module.exports = {
  escapeHtml,
  formatRoleLabel,
  renderApexNav,
  renderApexShell,
  renderFoundationHome,
  renderLoginPage,
  renderAccountPage,
  renderTenantLandingPage,
  renderControlledErrorPage,
};
