"use strict";

/**
 * Static audit: every V5 POST/PUT/PATCH/DELETE registration validates CSRF
 * via validateCsrf / validateCsrfPost / postDecision (registration helper).
 * Also: V5 EJS POST forms include CSRF fields; media-picker sends CSRF.
 *
 * Non-writing compatibility stubs that always return 404/not_found without
 * touching the database may be classified as noopNotFoundStub (CSRF N/A).
 *
 * Scanner is handler-aware: thin route wrappers that call a same-file named
 * handler include that handler body when checking for validateCsrf.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function listRouteFiles() {
  const bless = fs
    .readdirSync(path.join(ROOT, "src/blessboard/http"))
    .filter((f) => f.endsWith("Routes.js"))
    .map((f) => `src/blessboard/http/${f}`);
  return [
    "src/platform/http/v5FoundationServer.js",
    "src/platform/http/platformAdminRoutes.js",
    ...bless,
  ];
}

/**
 * Extract named function bodies from a route module (same-file helpers).
 * @param {string} text
 * @returns {Map<string, string>}
 */
function extractNamedFunctionBodies(text) {
  const map = new Map();
  const re =
    /(?:async\s+)?function\s+([A-Za-z_][\w]*)\s*\([^)]*\)\s*\{|(?:const|let|var)\s+([A-Za-z_][\w]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1] || m[2];
    const startBrace = text.indexOf("{", m.index);
    if (startBrace < 0) continue;
    let depth = 0;
    let i = startBrace;
    for (; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          map.set(name, text.slice(startBrace, i + 1));
          break;
        }
      }
    }
  }
  return map;
}

/**
 * Expand a route registration window with same-file handlers it invokes.
 * @param {string} window
 * @param {Map<string, string>} fnBodies
 */
function expandHandlerWindow(window, fnBodies) {
  let expanded = window;
  const called = new Set();
  const callRe = /\b([A-Za-z_][\w]*)\s*\(/g;
  let cm;
  while ((cm = callRe.exec(window))) {
    const name = cm[1];
    if (
      name === "validateCsrf" ||
      name === "validateCsrfPost" ||
      name === "postDecision" ||
      name === "if" ||
      name === "for" ||
      name === "while" ||
      name === "switch" ||
      name === "catch" ||
      name === "function" ||
      name === "async" ||
      name === "return" ||
      name === "await" ||
      name === "Promise" ||
      name === "Boolean" ||
      name === "String" ||
      name === "Number" ||
      name === "Array" ||
      name === "Object" ||
      name === "encodeURIComponent" ||
      name === "setTimeout"
    ) {
      continue;
    }
    if (fnBodies.has(name)) called.add(name);
  }
  for (const name of called) {
    expanded += `\n/* handler:${name} */\n${fnBodies.get(name)}`;
  }
  return expanded;
}

function hasCsrfProtection(scanText) {
  return (
    /validateCsrf(Post)?\s*\(/.test(scanText) ||
    /postDecision\s*\(/.test(scanText)
  );
}

function extractMutations(fileRel) {
  const text = read(fileRel);
  const fnBodies = extractNamedFunctionBodies(text);
  const out = [];
  const re =
    /(app|router)\.(post|put|patch|delete)\(\s*((?:`[^`]+`|'[^']+'|"[^"]+"|[A-Za-z_][\w.]*))/g;
  let m;
  while ((m = re.exec(text))) {
    const method = m[2].toUpperCase();
    let routePath = m[3];
    if (/^[`'"]/.test(routePath)) routePath = routePath.slice(1, -1);
    const rest = text.slice(m.index);
    const next = rest.search(/\n\s*(router|app)\.(get|post|put|patch|delete)\(/);
    const window = next > 0 ? rest.slice(0, next) : rest.slice(0, rest.length);
    const scanText = expandHandlerWindow(window, fnBodies);
    const csrfProtected = hasCsrfProtection(scanText);
    // Deliberate non-writing compatibility stubs (always 404 / not_found; no mutation).
    const noopNotFoundStub =
      /status\s*\(\s*404\s*\)/.test(window) &&
      /not_found/.test(window) &&
      !/\b(getPool|query\s*\(|insert|update|delete|save|publish|override)\b/i.test(window);
    out.push({
      file: fileRel,
      method,
      path: routePath,
      csrfProtected,
      noopNotFoundStub,
      window: scanText,
    });
  }
  return out;
}

function walkEjs(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkEjs(full, out);
    else if (ent.name.endsWith(".ejs")) out.push(full);
  }
  return out;
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
      if (ejsText[i] === ">") {
        opens.push({ attrs, bodyStart: i + 1 });
        break;
      }
      attrs += ejsText[i];
      i += 1;
    }
  }
  return opens;
}

describe("blessboard v5 CSRF action audit", () => {
  const mutations = listRouteFiles().flatMap(extractMutations);

  it("inventories V5 state-changing route registrations", () => {
    assert.ok(mutations.length >= 45, `expected many POSTs, got ${mutations.length}`);
    assert.equal(
      mutations.filter((m) => m.method !== "POST").length,
      0,
      "V5 should not use PUT/PATCH/DELETE yet"
    );
  });

  it("every V5 POST registration validates CSRF before mutating", () => {
    const missing = mutations
      .filter((m) => !m.csrfProtected && !m.noopNotFoundStub)
      .map((m) => `${m.method} ${m.path} (${m.file})`);
    assert.deepEqual(missing, []);
  });

  it("classifies deliberate public website settings POST as a non-writing 404 stub", () => {
    const stub = mutations.find(
      (m) =>
        m.file === "src/blessboard/http/websiteScopeSettingsAdminRoutes.js" &&
        m.path === "/public/website/settings" &&
        m.method === "POST"
    );
    assert.ok(stub, "expected POST /public/website/settings registration");
    assert.equal(stub.noopNotFoundStub, true);
    assert.equal(stub.csrfProtected, false);
    assert.match(stub.window, /status\s*\(\s*404\s*\)/);
    assert.match(stub.window, /not_found/);
  });

  it("noopNotFoundStub is not applied to real write routes", () => {
    const writes = mutations.filter(
      (m) =>
        m.path.includes("/hq/website/publish") ||
        m.path.includes("service-times") ||
        m.path.includes("approval-settings")
    );
    assert.ok(writes.length >= 4);
    for (const w of writes) {
      assert.equal(w.noopNotFoundStub, false, `${w.method} ${w.path} must not be a stub`);
      assert.equal(w.csrfProtected, true, `${w.method} ${w.path} must validate CSRF`);
    }
  });

  it("every V5 EJS POST form includes a CSRF field", () => {
    const files = walkEjs(path.join(ROOT, "views/blessboard/v5"));
    const bad = [];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const rel = path.relative(ROOT, file);
      for (const open of extractFormOpeners(text)) {
        if (!/\bmethod\s*=\s*(["'])post\1/i.test(open.attrs)) continue;
        const closeIdx = text.toLowerCase().indexOf("</form>", open.bodyStart);
        const body = closeIdx >= 0 ? text.slice(open.bodyStart, closeIdx) : "";
        const hasCsrf =
          /name\s*=\s*(["'])_csrf\1/i.test(body) ||
          /csrfField|csrfName|csrfToken/.test(body);
        if (!hasCsrf) bad.push(rel);
      }
    }
    assert.deepEqual(bad, []);
  });

  it("media-picker.js sends CSRF on upload and archive", () => {
    const js = read("public/blessboard/v5/media-picker.js");
    assert.match(js, /fd\.append\(["']_csrf["']/);
    assert.match(js, /X-CSRF-Token/);
    assert.match(js, /_csrf=/);
  });

  it("content-admin media routes accept body or X-CSRF-Token header", () => {
    const src = read("src/blessboard/http/contentAdminRoutes.js");
    assert.match(src, /X-CSRF-Token|x-csrf-token/);
    assert.match(src, /validateCsrf\(req,\s*submitted/);
  });

  it("logout routes are POST and CSRF-protected", () => {
    const expected = [
      { file: "src/platform/http/v5FoundationServer.js", path: "/logout" },
      { file: "src/platform/http/platformAdminRoutes.js", path: "/admin/logout" },
      { file: "src/blessboard/http/hqAdminRoutes.js", path: "/hq/logout" },
      { file: "src/blessboard/http/branchAdminRoutes.js", path: "/branch-admin/logout" },
      { file: "src/blessboard/http/memberPortalRoutes.js", path: "/member/logout" },
    ];
    for (const exp of expected) {
      const hit = mutations.find((m) => m.file === exp.file && m.path === exp.path && m.method === "POST");
      assert.ok(hit, `missing POST ${exp.path}`);
      assert.equal(hit.csrfProtected, true);
    }
  });

  it("does not expose sensitive mutations as GET handlers in route modules", () => {
    // Soft-delete/archive/publish/approve must be POST. GET …/publish is a form page only.
    const announce = read("src/blessboard/http/announcementAdminRoutes.js");
    assert.match(announce, /router\.post\(`\$\{mountPrefix\}\/:id\/publish`/);
    assert.match(announce, /router\.post\(`\$\{mountPrefix\}\/:id\/archive`/);
    assert.match(announce, /router\.get\(`\$\{mountPrefix\}\/:id\/publish`/); // form page OK
    const getPublishWindow = announce.slice(announce.indexOf("router.get(`${mountPrefix}/:id/publish`"));
    const getHandler = getPublishWindow.slice(0, getPublishWindow.search(/\n\s*router\.(get|post)/) || 800);
    assert.doesNotMatch(getHandler, /publishAnnouncement|archiveAnnouncement|UPDATE\b/i);
  });
});
