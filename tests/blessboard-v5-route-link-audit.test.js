"use strict";

/**
 * BlessBoard V5 route inventory + dead-link / form-target static audit.
 * Does not hit the network or database.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.join(__dirname, "..");
const VIEWS = path.join(ROOT, "views", "blessboard", "v5");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function walkEjs(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkEjs(full, out);
    else if (ent.name.endsWith(".ejs")) out.push(full);
  }
  return out;
}

/** Primary nav hrefs from V5 nav models (enabled entries only). */
function primaryNavHrefs() {
  const {
    BRANCH_ADMIN_NAV,
  } = require("../src/blessboard/http/branchAdminNav");
  const { HQ_ADMIN_NAV } = require("../src/blessboard/http/hqAdminNav");
  const { PORTAL_NAV } = require("../src/blessboard/http/memberPortalNav");
  const {
    PLATFORM_ADMIN_NAV,
  } = require("../src/platform/http/platformAdminNav");
  const { NAV_ITEMS } = require("../src/blessboard/http/tenantPublicPaths");

  const apex = [
    "/",
    "/features",
    "/for-churches",
    "/pricing",
    "/directory",
    "/register-church",
    "/login",
    "/account",
  ];

  return {
    apex,
    tenantPublic: NAV_ITEMS.map((i) => i.href).concat(["/register", "/login"]),
    member: PORTAL_NAV.filter((i) => i.enabled && i.href).map((i) => i.href),
    branchAdmin: BRANCH_ADMIN_NAV.filter((i) => i.enabled && i.href).map((i) => i.href),
    hqAdmin: HQ_ADMIN_NAV.filter((i) => i.enabled && i.href).map((i) => i.href),
    platformAdmin: PLATFORM_ADMIN_NAV.filter((i) => i.enabled && i.href).map((i) => i.href),
  };
}

/**
 * Collect same-file string path constants for static route inventory.
 *
 * Supported only (intentionally narrow — no eval, no require, no AST):
 *   const REGISTER_PATH = "/register-church";
 *   let PATH = '/features';
 * Used when the identifier appears as the first argument to router.get/post/….
 *
 * Rejected / ignored: template literals with ${}, concatenations, member access
 * (cfg.path), require() exports, non-path strings, undefined identifiers.
 *
 * @param {string} source
 * @returns {Map<string, string>}
 */
function collectSimpleStringPathConstants(source) {
  const map = new Map();
  const re =
    /\b(?:const|let|var)\s+([A-Za-z_][\w]*)\s*=\s*(['"])(\/[^'"\\\n]*)\2\s*;/g;
  let m;
  while ((m = re.exec(String(source || "")))) {
    const name = m[1];
    const value = m[3];
    if (!name || !value || !value.startsWith("/")) continue;
    if (value.includes("${") || value.includes("\\")) continue;
    map.set(name, value);
  }
  return map;
}

/**
 * Resolve a router.(get|post|…) first-argument match to a path string, or null.
 * @param {string | undefined} literal
 * @param {string | undefined} ident
 * @param {Map<string, string>} constants
 * @returns {string | null}
 */
function resolveRouterPathArg(literal, ident, constants) {
  if (literal) return literal;
  if (!ident) return null;
  // Member access / dotted names are not safe to resolve statically.
  if (ident.includes(".")) return null;
  const resolved = constants && constants.get(ident);
  return resolved || null;
}

/**
 * Scan one router source file for registered paths (literals + simple constants).
 * @param {string} source
 * @param {(method: string, routePath: string) => void} add
 */
function scanRouterSource(source, add) {
  const constants = collectSimpleStringPathConstants(source);
  const re =
    /router\.(get|post|put|patch|delete)\(\s*(?:[`'"]([^`'"]+)[`'"]|([A-Za-z_][\w.]*))/g;
  let m;
  while ((m = re.exec(String(source || "")))) {
    const method = m[1];
    const pathArg = resolveRouterPathArg(m[2], m[3], constants);
    // Skip unresolved idents and interpolated template fragments.
    if (pathArg && !pathArg.includes("${")) add(method, pathArg);
  }
}

/**
 * Collect registered Express path patterns from V5 routers + foundation.
 * Prefixed admin modules are expanded to concrete mount prefixes.
 */
function collectRegisteredPathPatterns() {
  const patterns = new Set();

  function add(method, routePath) {
    patterns.add(`${String(method).toUpperCase()} ${routePath}`);
    patterns.add(`* ${routePath}`);
  }

  function scanRouterFile(rel) {
    scanRouterSource(read(rel), add);
  }

  const literalFiles = [
    "src/platform/http/platformAdminRoutes.js",
    "src/blessboard/http/apexMarketingRoutes.js",
    "src/blessboard/http/inviteAcceptRoutes.js",
    "src/blessboard/http/tenantRegistrationRoutes.js",
    "src/blessboard/http/publicMediaRoutes.js",
    "src/blessboard/http/hqAdminRoutes.js",
    "src/blessboard/http/churchWebsiteAdminRoutes.js",
    "src/blessboard/http/pathPublicRoutes.js",
    "src/blessboard/http/hqMembersAdminRoutes.js",
    "src/blessboard/http/hqRoleAdminRoutes.js",
    "src/blessboard/http/hqReportsRoutes.js",
    "src/blessboard/http/branchAdminRoutes.js",
    "src/blessboard/http/branchRegistrationAdminRoutes.js",
    "src/blessboard/http/memberPortalRoutes.js",
    "src/blessboard/http/announcementMemberRoutes.js",
    "src/blessboard/http/memberNotificationRoutes.js",
    "src/blessboard/http/broadcastAdminRoutes.js",
    "src/blessboard/http/participationMemberRoutes.js",
    "src/blessboard/http/formsRequestsMemberRoutes.js",
  ];
  for (const f of literalFiles) scanRouterFile(f);

  // Tenant public CMS paths
  const { PATH_TO_PAGE_KEY } = require("../src/blessboard/http/tenantPublicPaths");
  for (const p of Object.keys(PATH_TO_PAGE_KEY)) add("get", p);

  // Foundation auth / health
  const foundation = read("src/platform/http/v5FoundationServer.js");
  const fre = /app\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)[`'"]/g;
  let fm;
  while ((fm = fre.exec(foundation))) add(fm[1], fm[2]);

  function expand(prefixes, suffixes) {
    for (const prefix of prefixes) {
      for (const { method, suffix } of suffixes) {
        add(method, suffix ? `${prefix}${suffix}` : prefix);
      }
    }
  }

  const hqBranch = (base) => [base, `${base}/b/:branchKey`];
  const ba = (base) => [base];

  expand(
    [...hqBranch("/hq/announcements"), ...ba("/branch-admin/announcements")],
    [
      { method: "get", suffix: "" },
      { method: "get", suffix: "/new" },
      { method: "post", suffix: "" },
      { method: "get", suffix: "/:id" },
      { method: "get", suffix: "/:id/edit" },
      { method: "get", suffix: "/:id/preview" },
      { method: "get", suffix: "/:id/publish" },
      { method: "post", suffix: "/:id/publish" },
      { method: "post", suffix: "/:id/archive" },
      { method: "post", suffix: "/:id" },
    ]
  );

  expand(
    [...hqBranch("/hq/participation"), ...ba("/branch-admin/participation")],
    [
      { method: "get", suffix: "" },
      { method: "post", suffix: "/ministries/memberships/:id/review" },
    ]
  );

  expand(
    [...hqBranch("/hq/attendance"), ...ba("/branch-admin/attendance")],
    [
      { method: "get", suffix: "" },
      { method: "get", suffix: "/new" },
      { method: "post", suffix: "" },
      { method: "get", suffix: "/:id" },
      { method: "get", suffix: "/:id/edit" },
      { method: "post", suffix: "/:id/edit" },
      { method: "post", suffix: "/:id/entries" },
      { method: "post", suffix: "/:id/submit" },
      { method: "post", suffix: "/:id/approve" },
      { method: "post", suffix: "/:id/archive" },
    ]
  );

  expand(
    [...hqBranch("/hq/giving"), ...ba("/branch-admin/giving")],
    [
      { method: "get", suffix: "" },
      { method: "get", suffix: "/new" },
      { method: "post", suffix: "" },
      { method: "get", suffix: "/:id" },
      { method: "get", suffix: "/:id/edit" },
      { method: "post", suffix: "/:id" },
      { method: "post", suffix: "/:id/submit" },
      { method: "post", suffix: "/:id/void" },
      { method: "post", suffix: "/:id/approve" },
    ]
  );

  for (const section of ["resources", "forms", "requests"]) {
    expand(
      [...hqBranch(`/hq/${section}`), ...ba(`/branch-admin/${section}`)],
      [
        { method: "get", suffix: "" },
        { method: "post", suffix: "" },
        { method: "get", suffix: "/:id" },
        { method: "post", suffix: "/:id/publish" },
        { method: "get", suffix: "/:id/file" },
        { method: "post", suffix: "/:id/status" },
      ]
    );
  }

  const contentEntities = [
    "leadership",
    "ministries",
    "events",
    "sermons",
    "contact",
    "giving",
  ];
  const contentSuffixes = [
    { method: "get", suffix: "" },
    { method: "get", suffix: "/pages/:pageKey" },
    { method: "post", suffix: "/pages/:pageKey" },
    { method: "get", suffix: "/pages/:pageKey/sections/:sectionKey" },
    { method: "post", suffix: "/pages/:pageKey/sections" },
    { method: "post", suffix: "/pages/:pageKey/sections/:sectionKey" },
    { method: "get", suffix: "/preview/:pageKey" },
    { method: "post", suffix: "/media/upload" },
    { method: "get", suffix: "/media" },
    { method: "post", suffix: "/media/:assetId/archive" },
    { method: "get", suffix: "/media/:assetId" },
    ...contentEntities.flatMap((k) => [
      { method: "get", suffix: `/${k}` },
      { method: "post", suffix: `/${k}` },
    ]),
  ];
  expand(
    [...hqBranch("/hq/content"), ...ba("/branch-admin/content")],
    contentSuffixes
  );

  return patterns;
}

function pathRegistered(patterns, method, pathname) {
  const clean = String(pathname || "").split("?")[0];
  if (patterns.has(`${method.toUpperCase()} ${clean}`) || patterns.has(`* ${clean}`)) {
    return true;
  }
  // Match :param segments
  for (const key of patterns) {
    const [m, p] = key.split(" ");
    if (m !== method.toUpperCase() && m !== "*") continue;
    const re = new RegExp(
      `^${p
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\:([A-Za-z_][\w]*)/g, "[^/]+")}$`
    );
    if (re.test(clean)) return true;
  }
  return false;
}

function extractStaticHrefs(ejsText) {
  const hrefs = [];
  const re = /\bhref\s*=\s*(["'])([^"']*)\1/gi;
  let m;
  while ((m = re.exec(ejsText))) {
    hrefs.push(m[2]);
  }
  return hrefs;
}

function extractFormOpeners(ejsText) {
  const opens = [];
  const startRe = /<form\b/gi;
  let sm;
  while ((sm = startRe.exec(ejsText))) {
    let i = sm.index + sm[0].length;
    let attrs = "";
    while (i < ejsText.length) {
      if (ejsText.startsWith("<%", i)) {
        const end = ejsText.indexOf("%>", i);
        if (end < 0) break;
        attrs += ejsText.slice(i, end + 2);
        i = end + 2;
        continue;
      }
      const ch = ejsText[i];
      if (ch === ">") {
        opens.push({ attrs, bodyStart: i + 1 });
        break;
      }
      attrs += ch;
      i += 1;
    }
  }
  return opens;
}

function extractPostForms(ejsText) {
  const forms = [];
  const opens = extractFormOpeners(ejsText);
  for (const open of opens) {
    const attrs = open.attrs;
    if (!/\bmethod\s*=\s*(["'])post\1/i.test(attrs)) continue;
    const closeIdx = ejsText.toLowerCase().indexOf("</form>", open.bodyStart);
    const body = closeIdx >= 0 ? ejsText.slice(open.bodyStart, closeIdx) : "";
    // Prefer action=... capturing through EJS (may contain quotes inside <% %>).
    let action = null;
    const actionEjs = attrs.match(/\baction\s*=\s*"([\s\S]*?)"/i) || attrs.match(/\baction\s*=\s*'([\s\S]*?)'/i);
    if (actionEjs) action = actionEjs[1];
    forms.push({
      action,
      hasCsrf:
        /name\s*=\s*(["'])_csrf\1/i.test(body) ||
        /name\s*=\s*(["'])<%=?\s*csrfName/i.test(body) ||
        /csrfField|csrfToken|csrfName/.test(body),
      attrs,
    });
  }
  return forms;
}

describe("blessboard v5 route scanner constants", () => {
  it("resolves same-file string path constants used in router calls", () => {
    const source = `
      const REGISTER_PATH = "/register-church";
      const FEATURES = '/features';
      router.get(REGISTER_PATH, handler);
      router.post(REGISTER_PATH, limiter, handler);
      router.get(FEATURES, handler);
      router.get("/pricing", handler);
    `;
    const found = new Set();
    scanRouterSource(source, (method, routePath) => {
      found.add(`${method.toUpperCase()} ${routePath}`);
    });
    assert.ok(found.has("GET /register-church"));
    assert.ok(found.has("POST /register-church"));
    assert.ok(found.has("GET /features"));
    assert.ok(found.has("GET /pricing"));
  });

  it("rejects dynamic expressions and does not invent routes", () => {
    const source = `
      const REGISTER_PATH = "/register-church";
      const cfg = { path: "/invented" };
      router.get(cfg.path, handler);
      router.get(prefix + "/x", handler);
      router.get(\`/tpl/\${id}\`, handler);
      router.post(UNKNOWN_PATH, handler);
      router.get(REGISTER_PATH, handler);
    `;
    const found = [];
    scanRouterSource(source, (method, routePath) => {
      found.push(`${method.toUpperCase()} ${routePath}`);
    });
    assert.deepEqual(found, ["GET /register-church"]);
    assert.ok(!found.some((p) => p.includes("/invented")));
    assert.ok(!found.some((p) => p.includes("/tpl/")));
    assert.ok(!found.some((p) => /UNKNOWN|prefix/.test(p)));
  });

  it("collectSimpleStringPathConstants only keeps rooted path string literals", () => {
    const map = collectSimpleStringPathConstants(`
      const REGISTER_PATH = "/register-church";
      const BAD = "register-church";
      const JOINED = "/a" + "/b";
      const TPL = \`/x/\${y}\`;
    `);
    assert.equal(map.get("REGISTER_PATH"), "/register-church");
    assert.equal(map.has("BAD"), false);
    assert.equal(map.has("JOINED"), false);
    assert.equal(map.has("TPL"), false);
  });
});

describe("blessboard v5 route + link audit", () => {
  const patterns = collectRegisteredPathPatterns();
  const nav = primaryNavHrefs();

  it("inventories a non-trivial set of registered V5 route patterns", () => {
    const methods = [...patterns].filter((k) => !k.startsWith("* "));
    assert.ok(methods.length >= 120, `expected ≥120 method+path patterns, got ${methods.length}`);
  });

  it("inventories GET and POST /register-church from REGISTER_PATH constant", () => {
    assert.ok(pathRegistered(patterns, "get", "/register-church"));
    assert.ok(pathRegistered(patterns, "post", "/register-church"));
    assert.ok(patterns.has("GET /register-church"));
    assert.ok(patterns.has("POST /register-church"));
  });

  it("inventories GET and POST /invite/accept from inviteAcceptRoutes literals", () => {
    assert.ok(pathRegistered(patterns, "get", "/invite/accept"));
    assert.ok(pathRegistered(patterns, "post", "/invite/accept"));
    assert.ok(patterns.has("GET /invite/accept"));
    assert.ok(patterns.has("POST /invite/accept"));
  });

  it("primary navigation hrefs resolve to registered GET routes", () => {
    const groups = Object.entries(nav);
    for (const [area, hrefs] of groups) {
      for (const href of hrefs) {
        assert.ok(
          pathRegistered(patterns, "get", href),
          `unregistered primary nav (${area}): ${href}`
        );
      }
    }
  });

  it("apex navigation and register-church form action resolve", () => {
    assert.ok(nav.apex.includes("/register-church"));
    assert.ok(pathRegistered(patterns, "get", "/register-church"));
    const formSource = read("views/blessboard/v5/apex/register-church.ejs");
    assert.match(formSource, /action="\/register-church"/);
    assert.ok(pathRegistered(patterns, "post", "/register-church"));
  });

  it("enabled nav models do not use placeholders or V4 dashboard paths", () => {
    const all = Object.values(nav).flat();
    for (const href of all) {
      assert.notEqual(href, "#");
      assert.doesNotMatch(href, /^javascript:/i);
      assert.doesNotMatch(href, /^\/member\/dashboard$/i);
      assert.doesNotMatch(href, /^\/hq\/dashboard$/i);
      assert.doesNotMatch(href, /^\/admin\/dashboard$/i);
      assert.doesNotMatch(href, /^\/branch-admin\/dashboard$/i);
      assert.doesNotMatch(href, /^\/church(\/|$)/i);
    }
  });

  it("V5 EJS has no bare href=\"#\", javascript:, or V4 route href prefixes", () => {
    const files = walkEjs(VIEWS);
    assert.ok(files.length > 40, "expected many V5 templates");
    const offenders = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const rel = path.relative(ROOT, file);
      for (const href of extractStaticHrefs(text)) {
        if (href === "#") offenders.push(`${rel}: href="#"`);
        if (/^javascript:/i.test(href)) offenders.push(`${rel}: ${href}`);
        if (/^\/member\/dashboard(\?|$)/i.test(href)) offenders.push(`${rel}: ${href}`);
        if (/^\/hq\/dashboard(\?|$)/i.test(href)) offenders.push(`${rel}: ${href}`);
        if (/^\/admin\/dashboard(\?|$)/i.test(href)) offenders.push(`${rel}: ${href}`);
        if (/^\/church(\/|$)/i.test(href)) offenders.push(`${rel}: ${href}`);
        if (/^\/branch\/login/i.test(href) || /^\/hq\/login/i.test(href)) {
          offenders.push(`${rel}: ${href}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("POST forms in V5 EJS include CSRF and known static action targets", () => {
    const files = walkEjs(VIEWS);
    const bad = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const rel = path.relative(ROOT, file);
      for (const form of extractPostForms(text)) {
        if (!form.hasCsrf) bad.push(`${rel}: POST missing CSRF`);
        if (form.action == null) {
          // Allowed only for apex login (posts to current URL including transfer query).
          if (!rel.endsWith(path.join("apex", "login.ejs")) && !rel.endsWith("apex/login.ejs")) {
            bad.push(`${rel}: POST missing action`);
          }
          continue;
        }
        if (form.action.includes("<%=") || form.action.includes("<%")) continue;
        if (form.action === "#" || /^javascript:/i.test(form.action)) {
          bad.push(`${rel}: bad action ${form.action}`);
          continue;
        }
        if (!pathRegistered(patterns, "post", form.action)) {
          bad.push(`${rel}: unregistered POST action ${form.action}`);
        }
      }
    }
    assert.deepEqual(bad, []);
  });

  it("logout form targets match registered POST routes", () => {
    const expected = [
      "/logout",
      "/admin/logout",
      "/hq/logout",
      "/branch-admin/logout",
      "/member/logout",
    ];
    for (const action of expected) {
      assert.ok(pathRegistered(patterns, "post", action), `missing logout route ${action}`);
    }
    const shells = [
      "views/blessboard/v5/partials/apex-shell-end.ejs",
      "views/blessboard/v5/apex/account.ejs",
      "views/blessboard/v5/partials/platform-admin-shell-start.ejs",
      "views/blessboard/v5/partials/hq-shell-start.ejs",
      "views/blessboard/v5/partials/branch-admin-shell-start.ejs",
      "views/blessboard/v5/partials/member-shell-start.ejs",
    ];
    const found = new Set();
    for (const rel of shells) {
      if (!fs.existsSync(path.join(ROOT, rel))) continue;
      const text = read(rel);
      for (const form of extractPostForms(text)) {
        if (form.action && /logout/i.test(form.action)) found.add(form.action);
      }
    }
    // Also scan all EJS for logout actions
    for (const file of walkEjs(VIEWS)) {
      const text = fs.readFileSync(file, "utf8");
      for (const form of extractPostForms(text)) {
        if (form.action && /logout/i.test(form.action)) found.add(form.action);
      }
    }
    for (const action of expected) {
      assert.ok(found.has(action), `logout form action not found in views: ${action}`);
    }
  });

  it("shared pagination partial never defaults to href=\"#\"", () => {
    const partial = read("views/blessboard/v5/partials/pagination.ejs");
    assert.doesNotMatch(partial, /baseHref[^;]*:\s*'#'/);
    assert.doesNotMatch(partial, /baseHref[^;]*:\s*"#"/);
    assert.match(partial, /_base\s*&&\s*_base\s*!==\s*'#'/);
  });

  it("HQ dashboard does not mark live module links as is-unavailable", () => {
    const dash = read("views/blessboard/v5/hq/dashboard.ejs");
    assert.match(dash, /if\s*\(card\.href\)/);
    assert.doesNotMatch(
      dash,
      /bb-hq-dash-stat--link<%= card\.available \? '' : ' is-unavailable' %>/
    );
  });

  it("apex account does not link tenant portals on apex host", () => {
    const account = read("views/blessboard/v5/apex/account.ejs");
    assert.match(account, /hostKind === 'apex'/);
    assert.match(account, /Tenant administration requires signing in on the church hostname/);
    assert.match(account, /showPlatformAdminLink/);
    assert.match(account, /href="\/admin"/);
    const apexOnly = account.match(
      /hostKind === 'apex'\)\s*\{\s*%>([\s\S]*?)<%\s*\}\s*else\s*\{/
    );
    assert.ok(apexOnly, "expected apex/else hostKind branches");
    assert.doesNotMatch(apexOnly[1], /href="\/hq"/);
    assert.doesNotMatch(apexOnly[1], /href="\/branch-admin"/);
    assert.match(account, /<%\s*\}\s*else\s*\{[\s\S]*href="\/hq"/);
  });
});
