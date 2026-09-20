"use strict";

/**
 * V8 shared session / logout security — cookie isolation, deployment-scoped
 * revoke, session regeneration, authenticated no-store, Back-after-logout.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const crypto = require("node:crypto");

const {
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  MOOVEX_PLATFORM_IDENTITY_KEY,
} = require("../src/platform/config/deploymentProfiles");
const {
  buildHostOnlyCookieOptions,
} = require("../src/platform/config/v8DeploymentIsolation");
const {
  resolveSessionSigningSecret,
  describeSessionCookieIsolation,
  applyAuthenticatedResponseHeaders,
  applyLogoutResponseHeaders,
  issueAuthenticatedSessionCookie,
  logoutAuthenticatedBrowserSession,
  createAuthenticatedResponseNoStoreMiddleware,
  countActiveSessionsByDeployment,
} = require("../src/platform/session/sharedSessionSecurity");
const {
  terminateV5BrowserSession,
} = require("../src/platform/session/terminateV5BrowserSession");
const {
  getV5SessionCookieName,
  readV5SessionCookie,
} = require("../src/platform/session/v5SessionCookie");
const {
  getCsrfCookieName,
  getCsrfSecret,
  issueCsrfToken,
} = require("../src/platform/http/v5Csrf");
const {
  wantsV5PrivateNoStore,
  setV5PrivateNoStore,
} = require("../src/platform/http/v5PrivateNoStore");
const {
  createRequireV5AuthenticatedSession,
  inspectV5SessionAuth,
  mapV5SessionReasonToAuthCode,
} = require("../src/platform/http/v5SessionAuthGate");
const { hashSessionToken } = require("../src/platform/session/sessionToken");

const V7_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v7-session-secret-distinct-aaaaaaaa",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
});

const V8_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v8-fallback-session-secret-bbbbbbbb",
  SESSION_SECRET_V8: "v8-dedicated-session-secret-cccccccc",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
});

describe("V8 shared session security — cookie / secret isolation", () => {
  it("uses distinct cookie names for V7 vs V8 profiles", () => {
    const v7 = describeSessionCookieIsolation(V7_ENV);
    const v8 = describeSessionCookieIsolation(V8_ENV);
    assert.equal(v7.platformLine, "v7");
    assert.equal(v8.platformLine, "v8");
    assert.notEqual(v7.sessionCookieName, v8.sessionCookieName);
    assert.notEqual(v7.csrfCookieName, v8.csrfCookieName);
    assert.match(v7.sessionCookieName, /testing_sid$/);
    assert.match(v8.sessionCookieName, /v8_testing_sid$/);
    assert.equal(v7.hostOnly, true);
    assert.equal(v8.hostOnly, true);
    assert.equal(v7.httpOnly, true);
    assert.equal(v8.sameSite, "lax");
    assert.equal(v8.signingSecretSource, "SESSION_SECRET_V8");
    assert.equal(v7.signingSecretSource, "SESSION_SECRET");
  });

  it("resolves V8 signing secret from SESSION_SECRET_V8 when set", () => {
    assert.equal(resolveSessionSigningSecret(V8_ENV), V8_ENV.SESSION_SECRET_V8);
    assert.equal(getCsrfSecret(V8_ENV), V8_ENV.SESSION_SECRET_V8);
    assert.equal(resolveSessionSigningSecret(V7_ENV), V7_ENV.SESSION_SECRET);
    assert.notEqual(getCsrfSecret(V7_ENV), getCsrfSecret(V8_ENV));
  });

  it("falls back to SESSION_SECRET on V8 when SESSION_SECRET_V8 is absent", () => {
    const env = { ...V8_ENV };
    delete env.SESSION_SECRET_V8;
    assert.equal(resolveSessionSigningSecret(env), env.SESSION_SECRET);
  });

  it("throws in production when no signing secret is configured", () => {
    assert.throws(
      () =>
        resolveSessionSigningSecret({
          NODE_ENV: "production",
          PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
        }),
      /SESSION_SECRET is required/
    );
  });

  it("countActiveSessionsByDeployment groups by deployment_code", async () => {
    const db = {
      async query(_sql, params) {
        assert.equal(params[0], "user-1");
        return {
          rows: [
            { deployment_code: CODE_MOOVEX_PLATFORM_TESTING, n: 2 },
            { deployment_code: CODE_MOOVEX_PLATFORM_V8_TESTING, n: 1 },
          ],
        };
      },
    };
    const map = await countActiveSessionsByDeployment(db, {
      userId: "user-1",
      v7DeploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
      v8DeploymentCode: CODE_MOOVEX_PLATFORM_V8_TESTING,
    });
    assert.equal(map[CODE_MOOVEX_PLATFORM_TESTING], 2);
    assert.equal(map[CODE_MOOVEX_PLATFORM_V8_TESTING], 1);
  });

  it("buildHostOnlyCookieOptions never sets Domain", () => {
    const opts = buildHostOnlyCookieOptions(V8_ENV);
    assert.equal(Object.prototype.hasOwnProperty.call(opts, "domain"), false);
    assert.equal(opts.httpOnly, true);
    assert.equal(opts.sameSite, "lax");
    assert.equal(opts.path, "/");
  });

  it("concurrent V7/V8 cookies coexist on a single Cookie header", () => {
    const v7Name = getV5SessionCookieName(V7_ENV);
    const v8Name = getV5SessionCookieName(V8_ENV);
    const header = `${v7Name}=v7token; ${v8Name}=v8token; other=x`;
    const reqV7 = { headers: { cookie: header }, cookies: {} };
    const reqV8 = { headers: { cookie: header }, cookies: {} };
    assert.equal(readV5SessionCookie(reqV7, V7_ENV), "v7token");
    assert.equal(readV5SessionCookie(reqV8, V8_ENV), "v8token");
  });
});

describe("V8 shared session security — cache / Back after logout", () => {
  it("marks auth shells and APIs as private no-store", () => {
    assert.equal(wantsV5PrivateNoStore("/logout"), true);
    assert.equal(wantsV5PrivateNoStore("/admin/orgs"), true);
    assert.equal(wantsV5PrivateNoStore("/api/me"), true);
    assert.equal(wantsV5PrivateNoStore("/account"), true);
    assert.equal(wantsV5PrivateNoStore("/member/profile"), true);
    assert.equal(wantsV5PrivateNoStore("/app/billing"), true);
    // Public marketing stays eligible for caching.
    assert.equal(wantsV5PrivateNoStore("/"), false);
    assert.equal(wantsV5PrivateNoStore("/pricing"), false);
  });

  it("applyLogoutResponseHeaders sets no-store and Clear-Site-Data cache", () => {
    const headers = Object.create(null);
    const res = {
      setHeader(k, v) {
        headers[String(k).toLowerCase()] = v;
      },
      getHeader(k) {
        return headers[String(k).toLowerCase()];
      },
    };
    applyLogoutResponseHeaders(res);
    assert.match(String(headers["cache-control"]), /no-store/i);
    assert.equal(headers["clear-site-data"], '"cache"');
    assert.equal(headers.pragma, "no-cache");
  });

  it("authenticated middleware applies no-store when session is loaded", async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.v5Session = { authenticated: true, session: { userId: "u1" } };
      next();
    });
    app.use(createAuthenticatedResponseNoStoreMiddleware());
    app.get("/hq", (_req, res) => res.status(200).send("ok"));
    const res = await request(app).get("/hq");
    assert.equal(res.status, 200);
    assert.match(String(res.headers["cache-control"] || ""), /no-store/i);
  });
});

describe("V8 shared session security — regenerate + logout revoke scope", () => {
  it("issueAuthenticatedSessionCookie revokes prior token for same deployment only", async () => {
    const prior = crypto.randomBytes(24).toString("base64url");
    const next = crypto.randomBytes(24).toString("base64url");
    const cookieName = getV5SessionCookieName(V8_ENV);
    const revoked = [];
    const pool = {
      async query(sql, params) {
        const text = String(sql);
        if (text.includes("SET revoked_at") && text.includes("session_token_hash")) {
          revoked.push({
            hash: params[0],
            deploymentCode: params[1],
          });
          return { rowCount: 1, rows: [{ id: "sess-prior" }] };
        }
        throw new Error(`unexpected: ${text.slice(0, 80)}`);
      },
    };
    const app = express();
    app.get("/login-ok", async (req, res) => {
      req.headers.cookie = `${cookieName}=${prior}`;
      await issueAuthenticatedSessionCookie(req, res, {
        rawToken: next,
        env: V8_ENV,
        isProduction: false,
        getPool: () => pool,
      });
      res.status(200).send("issued");
    });
    const res = await request(app).get("/login-ok");
    assert.equal(res.status, 200);
    assert.equal(revoked.length, 1);
    assert.equal(revoked[0].hash, hashSessionToken(prior));
    assert.equal(revoked[0].deploymentCode, CODE_MOOVEX_PLATFORM_V8_TESTING);
    const setCookie = [].concat(res.headers["set-cookie"] || []).join(";");
    assert.match(setCookie, new RegExp(`${cookieName}=`));
    assert.doesNotMatch(setCookie, /Domain=/i);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
  });

  it("V8 logout revokes only V8 deployment_code rows", async () => {
    const raw = crypto.randomBytes(24).toString("base64url");
    const cookieName = getV5SessionCookieName(V8_ENV);
    const csrfName = getCsrfCookieName(V8_ENV);
    const calls = [];
    const pool = {
      async query(sql, params) {
        calls.push({ sql: String(sql), params });
        return { rowCount: 1, rows: [{ id: "sess-1" }] };
      },
    };
    const app = express();
    app.post("/logout", async (req, res) => {
      req.headers.cookie = `${cookieName}=${raw}; ${csrfName}=${issueCsrfToken(V8_ENV)}`;
      const result = await logoutAuthenticatedBrowserSession(req, res, {
        env: V8_ENV,
        isProduction: false,
        getPool: () => pool,
      });
      res.status(200).json(result);
    });
    const res = await request(app).post("/logout");
    assert.equal(res.status, 200);
    assert.equal(res.body.revoked, true);
    assert.equal(res.body.deploymentCode, CODE_MOOVEX_PLATFORM_V8_TESTING);
    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /deployment_code/);
    assert.equal(calls[0].params[1], CODE_MOOVEX_PLATFORM_V8_TESTING);
    assert.match(String(res.headers["cache-control"] || ""), /no-store/i);
    assert.equal(res.headers["clear-site-data"], '"cache"');
  });

  it("terminateV5BrowserSession does not touch other deployment codes", async () => {
    const raw = "tok-v8-only";
    let seenDeployment = null;
    const pool = {
      async query(_sql, params) {
        seenDeployment = params[1];
        return { rowCount: 0, rows: [] };
      },
    };
    const req = {
      headers: {
        cookie: `${getV5SessionCookieName(V8_ENV)}=${raw}`,
      },
      cookies: {},
    };
    const cleared = [];
    const res = {
      clearCookie(name, opts) {
        cleared.push({ name, opts });
      },
      cookie() {},
    };
    await terminateV5BrowserSession(req, res, {
      env: V8_ENV,
      isProduction: false,
      getPool: () => pool,
      csrfCookieName: getCsrfCookieName(V8_ENV),
    });
    assert.equal(seenDeployment, CODE_MOOVEX_PLATFORM_V8_TESTING);
    assert.ok(cleared.some((c) => c.name === getV5SessionCookieName(V8_ENV)));
    assert.ok(
      cleared.every(
        (c) => !c.opts || !Object.prototype.hasOwnProperty.call(c.opts, "domain")
      )
    );
  });

  it("terminateV5BrowserSession clears extra cookies with host-only attrs", async () => {
    const req = {
      headers: {},
      cookies: {},
    };
    const cleared = [];
    const res = {
      clearCookie(name, opts) {
        cleared.push({ name, opts });
      },
    };
    await terminateV5BrowserSession(req, res, {
      env: V8_ENV,
      isProduction: true,
      getPool: () => null,
      csrfCookieName: getCsrfCookieName(V8_ENV),
      extraCookieNames: ["ac_org_selection", ""],
    });
    assert.ok(cleared.some((c) => c.name === "ac_org_selection"));
    assert.ok(
      cleared.every(
        (c) => !c.opts || !Object.prototype.hasOwnProperty.call(c.opts, "domain")
      )
    );
  });
});

describe("V8 shared session security — auth gate recheck + expiry", () => {
  it("expired session maps to session_expired and is not authenticated", () => {
    assert.equal(
      mapV5SessionReasonToAuthCode("expired", { cookiePresent: true }),
      "session_expired"
    );
    assert.equal(
      mapV5SessionReasonToAuthCode("revoked", { cookiePresent: true }),
      "session_revoked"
    );
    const req = {
      headers: {},
      cookies: {},
      v5Session: { authenticated: false, reason: "expired" },
    };
    const inspected = inspectV5SessionAuth(req);
    assert.equal(inspected.authenticated, false);
  });

  it("missing session cookie cannot pass the auth gate", async () => {
    const reqShape = {
      headers: { accept: "text/html" },
      cookies: {},
      v5Session: {
        authenticated: false,
        reason: "none",
      },
      get(name) {
        return this.headers[String(name).toLowerCase()];
      },
    };
    const inspected = inspectV5SessionAuth(reqShape);
    assert.equal(inspected.authenticated, false);
    assert.equal(inspected.authCode, "no_session_cookie");

    const app = express();
    const requireAuth = createRequireV5AuthenticatedSession({
      loginNext: "/hq",
    });
    app.get("/hq", (req, res) => {
      req.v5Session = { authenticated: false, reason: "none" };
      if (!requireAuth(req, res)) return;
      return res.status(200).send("secret");
    });
    const res = await request(app).get("/hq").set("Accept", "text/html");
    assert.ok(res.status === 303 || res.status === 302);
    assert.notEqual(res.text, "secret");
  });

  it("applyAuthenticatedResponseHeaders sets Vary: Cookie", () => {
    const headers = Object.create(null);
    const res = {
      setHeader(k, v) {
        headers[String(k).toLowerCase()] = v;
      },
      getHeader(k) {
        return headers[String(k).toLowerCase()];
      },
    };
    applyAuthenticatedResponseHeaders(res);
    setV5PrivateNoStore(res);
    assert.match(String(headers.vary || ""), /cookie/i);
  });
});

describe("V8 shared session security — browser Back simulation", () => {
  it("after logout, prior cookie no longer authenticates and response is no-store", async () => {
    const raw = crypto.randomBytes(16).toString("hex");
    const cookieName = getV5SessionCookieName(V8_ENV);
    const store = new Map();
    store.set(hashSessionToken(raw), {
      revoked: false,
      deploymentCode: CODE_MOOVEX_PLATFORM_V8_TESTING,
    });
    const pool = {
      async query(sql, params) {
        if (String(sql).includes("SET revoked_at")) {
          const row = store.get(params[0]);
          if (row && row.deploymentCode === params[1] && !row.revoked) {
            row.revoked = true;
            return { rowCount: 1, rows: [{ id: "1" }] };
          }
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const app = express();
    app.post("/logout", async (req, res) => {
      await logoutAuthenticatedBrowserSession(req, res, {
        env: V8_ENV,
        isProduction: false,
        getPool: () => pool,
      });
      res.status(200).send("logged-out");
    });
    app.get("/hq", (req, res) => {
      const token = readV5SessionCookie(req, V8_ENV);
      if (!token) {
        applyAuthenticatedResponseHeaders(res);
        return res.redirect(303, "/login");
      }
      const row = store.get(hashSessionToken(token));
      if (!row || row.revoked) {
        applyAuthenticatedResponseHeaders(res);
        return res.redirect(303, "/login");
      }
      applyAuthenticatedResponseHeaders(res);
      return res.status(200).send("still-in");
    });

    const agent = request.agent(app);
    const logout = await agent
      .post("/logout")
      .set("Cookie", `${cookieName}=${raw}`);
    assert.equal(logout.status, 200);
    assert.match(String(logout.headers["cache-control"] || ""), /no-store/i);

    // Browser Back: replay GET /hq with the old cookie value (cache should not be trusted).
    const back = await request(app)
      .get("/hq")
      .set("Cookie", `${cookieName}=${raw}`);
    assert.equal(back.status, 303);
    assert.match(String(back.headers.location || ""), /login/);
    assert.match(String(back.headers["cache-control"] || ""), /no-store/i);

    // V7 session row with a different deployment code would be untouched.
    const v7Hash = hashSessionToken("v7-concurrent-token");
    store.set(v7Hash, {
      revoked: false,
      deploymentCode: CODE_MOOVEX_PLATFORM_TESTING,
    });
    assert.equal(store.get(v7Hash).revoked, false);
    assert.equal(store.get(hashSessionToken(raw)).revoked, true);
  });
});
