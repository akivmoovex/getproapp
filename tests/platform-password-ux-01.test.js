"use strict";

/**
 * PLATFORM-PASSWORD-UX-01 — Shared GpRegistrationPasswordRules on BB + AC.
 * Canonical server policy is length-only (min/max); no uppercase/special rules.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, CSRF_COOKIE } = require("../src/platform/http/v5Csrf");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  getRegistrationPasswordRules,
  validateRegistrationPasswordPair,
  PASSWORD_MIN,
  PASSWORD_MAX,
} = require("../src/platform/registration/registrationPasswordPolicy");

let pool;
let databaseUrl;
let skipReason = null;

const AC_ENV = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  SESSION_SECRET: "a".repeat(48),
});

const BB_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
});

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function extractFormCsrf(html) {
  const m = String(html || "").match(
    new RegExp(
      `name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`
    )
  );
  return (m && (m[1] || m[2])) || "";
}

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function joinCookies(...responses) {
  const parts = [];
  for (const res of responses) {
    const raw = res && res.headers && res.headers["set-cookie"];
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const line of list) parts.push(String(line).split(";")[0]);
  }
  return parts.join("; ");
}

/** Minimal DOM enough for GpRegistrationPasswordRules.init live updates. */
function createPasswordRulesDom(rules, opts) {
  const minLength = opts && opts.minLength != null ? opts.minLength : PASSWORD_MIN;
  const maxLength = opts && opts.maxLength != null ? opts.maxLength : PASSWORD_MAX;
  const passwordId = (opts && opts.passwordId) || "password";
  const confirmId = (opts && opts.confirmId) || "passwordConfirm";

  function makeEl(tag, attrs) {
    const listeners = {};
    const el = {
      tagName: String(tag).toUpperCase(),
      id: (attrs && attrs.id) || "",
      value: "",
      className: (attrs && attrs.className) || "",
      attributes: Object.assign({}, attrs || {}),
      children: [],
      textContent: "",
      classList: {
        _set: new Set(
          String((attrs && attrs.className) || "")
            .split(/\s+/)
            .filter(Boolean)
        ),
        add(c) {
          this._set.add(c);
          el.className = [...this._set].join(" ");
        },
        remove(c) {
          this._set.delete(c);
          el.className = [...this._set].join(" ");
        },
        toggle(c, force) {
          if (force === true) this.add(c);
          else if (force === false) this.remove(c);
          else if (this._set.has(c)) this.remove(c);
          else this.add(c);
        },
        contains(c) {
          return this._set.has(c);
        },
      },
      getAttribute(name) {
        return this.attributes[name] != null ? String(this.attributes[name]) : null;
      },
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      addEventListener(type, fn) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      dispatch(type) {
        (listeners[type] || []).forEach((fn) => fn());
      },
      querySelector(sel) {
        return this.querySelectorAll(sel)[0] || null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = (node) => {
          if (!node || !node.children) return;
          for (const child of node.children) {
            if (sel.startsWith(".") && child.classList.contains(sel.slice(1))) out.push(child);
            else if (sel.startsWith("#") && child.id === sel.slice(1)) out.push(child);
            else if (sel.startsWith("[") && sel.endsWith("]")) {
              const key = sel.slice(1, -1).split("=")[0];
              if (child.getAttribute(key) != null) out.push(child);
            }
            walk(child);
          }
        };
        walk(node === el ? el : node);
        return out;
      },
    };
    let node = el;
    // fix querySelectorAll walk root
    el.querySelectorAll = function (sel) {
      const out = [];
      const walk = (n) => {
        for (const child of n.children || []) {
          if (sel.startsWith("[data-gp-password-rule]")) {
            if (child.getAttribute("data-gp-password-rule") != null) out.push(child);
          } else if (sel.startsWith(".")) {
            if (child.classList.contains(sel.slice(1))) out.push(child);
          } else if (sel.startsWith("#")) {
            if (child.id === sel.slice(1)) out.push(child);
          }
          walk(child);
        }
      };
      walk(this);
      return out;
    };
    return el;
  }

  const password = makeEl("input", { id: passwordId });
  const confirm = makeEl("input", { id: confirmId });
  const status = makeEl("p", { id: "password-confirm-status" });
  const rulesRoot = makeEl("div", { className: "gp-registration-password-rules" });
  for (const rule of rules) {
    const item = makeEl("li", {});
    item.setAttribute("data-gp-password-rule", rule.id);
    item.setAttribute("aria-checked", "false");
    rulesRoot.children.push(item);
  }
  const root = makeEl("div", {});
  root.children.push(password, confirm, status, rulesRoot);

  const byId = {
    [passwordId]: password,
    [confirmId]: confirm,
    "password-confirm-status": status,
  };

  const document = {
    getElementById(id) {
      return byId[id] || null;
    },
    querySelector(sel) {
      if (sel === `#${passwordId}`) return password;
      if (sel === `#${confirmId}`) return confirm;
      if (sel === "#password-confirm-status") return status;
      if (sel === ".gp-registration-password-rules") return rulesRoot;
      return null;
    },
  };

  return {
    document,
    password,
    confirm,
    status,
    rulesRoot,
    minLength,
    maxLength,
    ruleItems: () => rulesRoot.children,
  };
}

function loadPasswordRulesClient(document) {
  const code = fs.readFileSync(
    path.join(__dirname, "../public/platform/registration-password-rules.js"),
    "utf8"
  );
  const sandbox = { window: {}, document, console };
  sandbox.window.document = document;
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(code, sandbox);
  return sandbox.window.GpRegistrationPasswordRules;
}

describe("PLATFORM-PASSWORD-UX-01 shared registration password rules", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: "blessboard-platform-v5",
        environmentCode: "testing",
      });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function makeAcApp() {
    return createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...AC_ENV, DATABASE_URL: databaseUrl },
    });
  }

  function makeBbApp() {
    return createV5FoundationApp({
      env: BB_ENV,
      getPool: () => pool,
    });
  }

  async function reachAcAdministratorStep(app) {
    const getClinic = await request(app).get("/register-clinic");
    assert.equal(getClinic.status, 200, `clinic GET ${getClinic.status}`);
    const csrf = extractFormCsrf(getClinic.text);
    assert.ok(csrf, "csrf on clinic step");
    const post = await request(app)
      .post("/register-clinic")
      .set("Cookie", joinCookies(getClinic))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        clinicName: "Password UX Clinic",
        clinicType: "clinic",
        countryCode: "ZM",
        city: "Lusaka",
        address: "1 Test Ave",
        action: "next-clinic",
      });
    assert.ok([302, 303].includes(post.status), `clinic step ${post.status}`);
    assert.match(String(post.headers.location || ""), /step=administrator/);
    const admin = await request(app)
      .get(String(post.headers.location).replace(/^https?:\/\/[^/]+/, "") || post.headers.location)
      .set("Cookie", joinCookies(getClinic, post));
    assert.equal(admin.status, 200, `admin GET ${admin.status}`);
    return {
      admin,
      cookie: joinCookies(getClinic, post, admin),
      csrf: extractFormCsrf(admin.text),
    };
  }

  async function reachBbAdministratorStep(app) {
    const page = await request(app)
      .get("/register-church?plan=foundation")
      .set("Host", "blessboard.org");
    assert.equal(page.status, 200, `church GET ${page.status}`);
    const csrf = extractFormCsrf(page.text);
    assert.ok(csrf, "csrf on church step");
    const key = `pwux-${Date.now().toString(36)}`;
    const post = await request(app)
      .post("/register-church")
      .set("Host", "blessboard.org")
      .set("Cookie", joinCookies(page))
      .type("form")
      .send({
        action: "next-church",
        church_name: `Password UX Church ${key}`,
        country: "ZM",
        city: "Lusaka",
        branch_name: "Central",
        selected_plan: "foundation",
        [CSRF_FIELD]: csrf,
      });
    assert.ok([302, 303].includes(post.status), `church step ${post.status}`);
    assert.match(String(post.headers.location || ""), /step=administrator/);
    const admin = await request(app)
      .get(String(post.headers.location).replace(/^https?:\/\/[^/]+/, "") || post.headers.location)
      .set("Host", "blessboard.org")
      .set("Cookie", joinCookies(page, post));
    assert.equal(admin.status, 200, `admin GET ${admin.status}`);
    return {
      admin,
      cookie: joinCookies(page, post, admin),
      csrf: extractFormCsrf(admin.text),
    };
  }

  it("A: AC password/admin step initializes shared GpRegistrationPasswordRules", async () => {
    requireDb();
    const app = makeAcApp();
    const { admin } = await reachAcAdministratorStep(app);
    assert.match(admin.text, /id="password"/);
    assert.match(admin.text, /gp-registration-password-rules/);
    assert.match(admin.text, /data-gp-password-rule="min_length"/);
    assert.match(admin.text, /data-gp-password-rule="max_length"/);
    assert.match(admin.text, /GpRegistrationPasswordRules\.init/);
    assert.match(admin.text, /passwordInput:\s*"#password"/);
    // Init must not be clinic-only: clinic step must not contain password init
    const clinic = await request(app).get("/register-clinic");
    assert.equal(clinic.status, 200);
    assert.doesNotMatch(clinic.text, /GpRegistrationPasswordRules\.init/);
    assert.doesNotMatch(clinic.text, /id="password"/);
  });

  it("B: AC live typing updates .is-met for shared rules", () => {
    const serverRules = getRegistrationPasswordRules();
    const dom = createPasswordRulesDom(serverRules, {
      passwordId: "password",
      confirmId: "passwordConfirm",
      minLength: PASSWORD_MIN,
      maxLength: PASSWORD_MAX,
    });
    const api = loadPasswordRulesClient(dom.document);
    assert.ok(api && typeof api.init === "function");
    api.init({
      passwordInput: "#password",
      confirmInput: "#passwordConfirm",
      rulesRoot: ".gp-registration-password-rules",
      confirmStatus: "#password-confirm-status",
      minLength: PASSWORD_MIN,
      maxLength: PASSWORD_MAX,
    });
    const items = dom.ruleItems();
    const minItem = items.find((i) => i.getAttribute("data-gp-password-rule") === "min_length");
    const maxItem = items.find((i) => i.getAttribute("data-gp-password-rule") === "max_length");
    assert.ok(minItem && maxItem);

    dom.password.value = "short";
    dom.password.dispatch("input");
    assert.equal(minItem.classList.contains("is-met"), false);
    assert.equal(minItem.getAttribute("aria-checked"), "false");
    assert.equal(maxItem.classList.contains("is-met"), true);

    dom.password.value = "a".repeat(PASSWORD_MIN);
    dom.password.dispatch("input");
    assert.equal(minItem.classList.contains("is-met"), true);
    assert.equal(minItem.getAttribute("aria-checked"), "true");
    assert.equal(maxItem.classList.contains("is-met"), true);
  });

  it("C: BB registration initializes shared GpRegistrationPasswordRules", async () => {
    requireDb();
    const app = makeBbApp();
    const { admin } = await reachBbAdministratorStep(app);
    assert.match(admin.text, /register_password/);
    assert.match(admin.text, /gp-registration-password-rules/);
    assert.match(admin.text, /GpRegistrationPasswordRules\.init/);
    assert.match(admin.text, /#register_password/);
    assert.match(admin.text, /data-gp-password-rule="min_length"/);
    assert.match(admin.text, /data-gp-password-rule="max_length"/);
  });

  it("D: BB live typing updates .is-met for shared rules", () => {
    const serverRules = getRegistrationPasswordRules();
    const dom = createPasswordRulesDom(serverRules, {
      passwordId: "register_password",
      confirmId: "register_password_confirm",
      minLength: PASSWORD_MIN,
      maxLength: PASSWORD_MAX,
    });
    const api = loadPasswordRulesClient(dom.document);
    api.init({
      passwordInput: "#register_password",
      confirmInput: "#register_password_confirm",
      rulesRoot: ".gp-registration-password-rules",
      confirmStatus: "#password-confirm-status",
      minLength: PASSWORD_MIN,
      maxLength: PASSWORD_MAX,
    });
    const minItem = dom
      .ruleItems()
      .find((i) => i.getAttribute("data-gp-password-rule") === "min_length");
    dom.password.value = "tiny";
    dom.password.dispatch("input");
    assert.equal(minItem.classList.contains("is-met"), false);
    dom.password.value = "ValidLength99!";
    dom.password.dispatch("input");
    assert.equal(minItem.classList.contains("is-met"), true);
    assert.equal(minItem.getAttribute("aria-checked"), "true");
  });

  it("E: short invalid password rejected by server (AC admin step)", async () => {
    requireDb();
    const app = makeAcApp();
    const { admin, cookie, csrf } = await reachAcAdministratorStep(app);
    const short = "short";
    assert.ok(short.length < PASSWORD_MIN);
    const fail = await request(app)
      .post("/register-clinic")
      .set("Cookie", cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        contactName: "Admin User",
        contactEmail: `pwux-short-${Date.now()}@example.com`,
        phone_country: "ZM",
        phone_national: "971234567",
        password: short,
        passwordConfirm: short,
        action: "next-admin",
      });
    assert.ok([200, 400].includes(fail.status), `status ${fail.status} body=${String(fail.text).slice(0, 200)}`);
    assert.doesNotMatch(String(fail.headers.location || ""), /step=review/);
    assert.match(fail.text, /password|at least|characters/i);
    assert.match(fail.text, /data-ac-register-step="administrator"|Administrator/i);
  });

  it("F: valid password accepted by canonical registration pair contract", () => {
    const valid = "a".repeat(PASSWORD_MIN);
    const ok = validateRegistrationPasswordPair(valid, valid);
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(ok.value, valid);

    const mismatch = validateRegistrationPasswordPair(valid, `${valid}x`);
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, "confirmation_mismatch");

    const tooLong = "a".repeat(PASSWORD_MAX + 1);
    const longFail = validateRegistrationPasswordPair(tooLong, tooLong);
    assert.equal(longFail.ok, false);
    assert.equal(longFail.code, "weak_password");
  });

  it("G: displayed requirements match server validation rules (length-only canonical)", async () => {
    requireDb();
    const rules = getRegistrationPasswordRules();
    assert.deepEqual(
      rules.map((r) => r.id).sort(),
      ["max_length", "min_length"],
      "canonical policy is length-only (no uppercase/special)"
    );
    assert.match(rules.find((r) => r.id === "min_length").label, new RegExp(String(PASSWORD_MIN)));
    assert.match(rules.find((r) => r.id === "max_length").label, new RegExp(String(PASSWORD_MAX)));

    const app = makeAcApp();
    const { admin } = await reachAcAdministratorStep(app);
    for (const rule of rules) {
      assert.match(admin.text, new RegExp(`data-gp-password-rule="${rule.id}"`));
      assert.match(admin.text, new RegExp(rule.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.doesNotMatch(admin.text, /data-gp-password-rule="uppercase"|data-gp-password-rule="special/);

    const bb = makeBbApp();
    const { admin: bbAdmin } = await reachBbAdministratorStep(bb);
    for (const rule of rules) {
      assert.match(bbAdmin.text, new RegExp(`data-gp-password-rule="${rule.id}"`));
      assert.match(bbAdmin.text, new RegExp(rule.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    // Client JS only evaluates the same length rule ids
    const clientJs = fs.readFileSync(
      path.join(__dirname, "../public/platform/registration-password-rules.js"),
      "utf8"
    );
    assert.match(clientJs, /min_length/);
    assert.match(clientJs, /max_length/);
    assert.doesNotMatch(clientJs, /uppercase|special.?char/i);
  });
});
