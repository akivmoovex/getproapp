"use strict";

/**
 * Safe HTML renderers for V5 apex shell + read-only tenant landing.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const { renderV5Ejs } = require("./v5EjsTemplateCache");

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

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderApexView(relativePath, data) {
  return renderV5Ejs(relativePath, data);
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
:root { color-scheme: light; --violet: #6C5CE7; --violet-deep: #5341cd; --ink: #1a1625; --muted: #5c5668; --bg: #f7f5fb; --line: #e4dfec; --err: #b42318; --err-bg: #fef3f2; --ok: #0f766e; --getpro: #ff9800; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Hanken Grotesk", system-ui, sans-serif; background: var(--bg); color: var(--ink); line-height: 1.5; }
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
 * Classify login/auth error copy for presentation only (does not change server messages).
 * @param {string | null | undefined} message
 * @returns {null | 'credentials' | 'throttled' | 'expired' | 'consumed' | 'unauthorized' | 'generic'}
 */
function classifyAuthErrorState(message) {
  const m = String(message || "").trim();
  if (!m) return null;
  if (/too many sign-in attempts/i.test(m)) return "throttled";
  if (/do not have access|not available for this account/i.test(m)) return "unauthorized";
  if (/already been used|already used/i.test(m)) return "consumed";
  if (/invalid or has expired|has expired|session has expired|please sign in again/i.test(m)) {
    return "expired";
  }
  if (/invalid email or password/i.test(m)) return "credentials";
  return "generic";
}

/**
 * @param {string | null | undefined} state
 */
function authErrorTitle(state) {
  if (state === "throttled") return "Too many sign-in attempts";
  if (state === "expired") return "Sign-in link expired";
  if (state === "consumed") return "Sign-in link already used";
  if (state === "unauthorized") return "Access not available";
  if (state === "credentials") return "Sign-in could not continue";
  return "Sign-in could not continue";
}

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
  return renderApexView("apex/page.ejs", {
    pageTitle: opts.title || "BlessBoard",
    bodyHtml: opts.bodyHtml || "",
    authenticated: Boolean(opts.authenticated),
    activeNav: opts.active || "home",
    csrfToken: opts.csrfToken || "",
  });
}

/**
 * @param {{ authenticated?: boolean, csrfToken?: string | null }} opts
 */
function renderFoundationHome(opts) {
  return renderApexView("apex/home.ejs", {
    pageTitle: "Home",
    authenticated: Boolean(opts && opts.authenticated),
    activeNav: "home",
    csrfToken: (opts && opts.csrfToken) || "",
  });
}

/**
 * Apex continuation / password form.
 * Never embeds raw transfer tokens in HTML — when opened as GET /login?tr=…,
 * the form posts to the current URL so the query is preserved by the browser.
 * @param {{ error?: string, csrfToken: string, authenticated?: boolean, hostKind?: 'apex'|'tenant', churchDisplayName?: string, nextPath?: string | null, transferToken?: string | null, transferHostname?: string | null, emailValue?: string | null, loggedOut?: boolean }} opts
 */
function renderLoginPage(opts) {
  const hostKind = opts.hostKind === "tenant" ? "tenant" : "apex";
  const error = opts.error ? String(opts.error) : "";
  const errorState = classifyAuthErrorState(error);
  // Hostname is safe to show only after authoritative transfer load (caller responsibility).
  const transferHostname =
    hostKind === "apex" && opts.transferHostname ? String(opts.transferHostname) : "";
  const subtitle =
    hostKind === "tenant"
      ? opts.churchDisplayName
        ? `Sign in to ${String(opts.churchDisplayName)}`
        : "BlessBoard tenant sign-in"
      : transferHostname
        ? "Welcome back to your church family"
        : "Sign in with your BlessBoard account.";
  const panelTitle = transferHostname ? "Member Access" : "Sign in";
  const panelLead = transferHostname
    ? "Authenticate on BlessBoard to open your church workspace. Passwords are never collected on the church hostname."
    : "One secure place to access your church sites and account.";

  return renderApexView("apex/login.ejs", {
    csrfToken: opts.csrfToken || "",
    error,
    errorState,
    errorTitle: authErrorTitle(errorState),
    emailValue: opts.emailValue ? String(opts.emailValue) : "",
    // Intentionally omitted from template: raw transfer tokens must not appear in HTML.
    transferHostname,
    hostKind,
    subtitle,
    panelTitle,
    panelLead,
    loggedOut: Boolean(opts.loggedOut),
  });
}

/**
 * Presentation-only auth error / callback failure screen (no secrets).
 * @param {string} message
 */
function renderAuthErrorPage(message) {
  const text = String(message || "Sign-in could not continue.");
  const errorState = classifyAuthErrorState(text) || "generic";
  const pageTitle = authErrorTitle(errorState);
  return renderApexView("apex/auth-error.ejs", {
    message: text,
    errorState,
    pageTitle,
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
  const roleKeys = Array.isArray(account.roles) ? account.roles : [];
  const roleBadges = roleKeys.map((r) => formatRoleLabel(r)).filter(Boolean);
  const rolesLabel = roleBadges.join(", ") || "(none)";
  return renderApexView("apex/account.ejs", {
    pageTitle: "Account",
    authenticated: true,
    activeNav: "account",
    csrfToken: account.csrfToken || "",
    displayName: String(account.displayName || ""),
    rolesLabel,
    roleBadges,
    hostKind,
    churchDisplayName: account.churchDisplayName ? String(account.churchDisplayName) : "",
    branchDisplayName: account.branchDisplayName ? String(account.branchDisplayName) : "",
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
  classifyAuthErrorState,
  authErrorTitle,
  renderApexNav,
  renderApexShell,
  renderFoundationHome,
  renderLoginPage,
  renderAuthErrorPage,
  renderAccountPage,
  renderTenantLandingPage,
  renderControlledErrorPage,
};
