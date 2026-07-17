"use strict";

/**
 * Machine-readable inventory of cookie-authenticated church mutation routes.
 * Fails if any authenticated mutation lacks church CSRF, platform CSRF, or an explicit exemption.
 */

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROUTES_DIR = path.join(__dirname, "../src/routes/church");
const PLATFORM_ADMIN_FILES = [
  path.join(__dirname, "../src/routes/admin/adminChurchPlatform.js"),
  path.join(__dirname, "../src/routes/blessboardAdmin.js"),
];

/** Unauthenticated / public mutations — not cookie-authenticated. */
const EXEMPT = new Map([
  ["/register", "public registration"],
  ["/login", "public member login"],
  ["/forgot-password", "public member password-reset request"],
  ["/branch/login", "public branch-admin login"],
  ["/branch/forgot-password", "public branch-admin password-reset request"],
  ["/hq/login", "public HQ login"],
  ["/hq/forgot-password", "public HQ password-reset request"],
  ["/leader/login", "public leader login"],
  ["/leader/forgot-password", "public leader password-reset request"],
  ["/contact", "public contact form (no authenticated session)"],
  ["/branches/:branchSlug/contact", "public branch contact form (no authenticated session)"],
  ["/churches/:churchSlug/branches/:branchSlug/open", "public church selection redirect (navigation preference only)"],
  ["/churches/preference/clear", "public clear remembered church preference"],
]);

function listJsFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(dir, f));
}

function extractMutations(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const out = [];
  const re = /router\.(post|put|patch|delete)\(\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(text))) {
    const method = m[1].toUpperCase();
    const routePath = m[2];
    // Window after the path for middleware detection
    const window = text.slice(m.index, m.index + 700);
    out.push({ file: path.basename(filePath), method, path: routePath, window, fullPath: filePath });
  }
  return out;
}

function classify(entry) {
  if (EXEMPT.has(entry.path)) {
    return { status: "exempt", reason: EXEMPT.get(entry.path) };
  }
  if (/requireChurchSessionCsrf/.test(entry.window)) {
    return { status: "church_csrf", reason: "requireChurchSessionCsrf" };
  }
  if (/requirePlatformAdminCsrf(OnMutations)?/.test(entry.window)) {
    return { status: "platform_csrf", reason: "requirePlatformAdminCsrf" };
  }
  // Platform admin router.use(requirePlatformAdminCsrfOnMutations) covers all mutations in file
  if (
    entry.fullPath.includes("adminChurchPlatform.js") ||
    entry.fullPath.includes("blessboardAdmin.js")
  ) {
    const fileText = fs.readFileSync(entry.fullPath, "utf8");
    if (/requirePlatformAdminCsrfOnMutations|requirePlatformAdminCsrf/.test(fileText)) {
      return { status: "platform_csrf", reason: "file-level platform CSRF" };
    }
  }
  // Logout without session is handled inside handler with requireChurchSessionCsrf when session exists
  if (entry.path === "/logout" && /requireChurchSessionCsrf/.test(fs.readFileSync(entry.fullPath, "utf8"))) {
    return { status: "church_csrf", reason: "session-gated CSRF on /logout" };
  }
  return { status: "gap", reason: "unexplained authenticated mutation" };
}

test("church authenticated mutation inventory has no unexplained CSRF gaps", () => {
  const files = [...listJsFiles(ROUTES_DIR), ...PLATFORM_ADMIN_FILES.filter((f) => fs.existsSync(f))];
  const mutations = files.flatMap(extractMutations);

  const summary = {
    total: mutations.length,
    church_csrf: 0,
    platform_csrf: 0,
    other: 0,
    exempt: 0,
    gaps: [],
  };

  const report = [];
  for (const entry of mutations) {
    const cls = classify(entry);
    report.push({
      file: entry.file,
      method: entry.method,
      path: entry.path,
      status: cls.status,
      reason: cls.reason,
    });
    if (cls.status === "church_csrf") summary.church_csrf += 1;
    else if (cls.status === "platform_csrf") summary.platform_csrf += 1;
    else if (cls.status === "exempt") summary.exempt += 1;
    else if (cls.status === "other") summary.other += 1;
    else summary.gaps.push(`${entry.method} ${entry.path} (${entry.file})`);
  }

  // Persist machine-readable report for operators (not secrets).
  const outDir = path.join(__dirname, "../tmp");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "church-mutation-csrf-inventory.json"),
    JSON.stringify({ summary, report }, null, 2)
  );

  assert.equal(
    summary.gaps.length,
    0,
    `Unexplained CSRF gaps:\n${summary.gaps.join("\n")}`
  );
  assert.ok(summary.total > 50, "expected a substantial mutation inventory");
  assert.ok(summary.church_csrf > 40, "expected broad church CSRF coverage");
  assert.ok(summary.exempt >= 8, "expected documented public exemptions");
});

test("inventory exemptions match documented public auth and contact routes only", () => {
  for (const [p, reason] of EXEMPT) {
    assert.ok(reason && reason.length > 3, p);
    assert.match(
      p,
      /^\/(register|login|forgot-password|contact|branches\/|branch\/|hq\/|leader\/|churches\/)/
    );
  }
});
