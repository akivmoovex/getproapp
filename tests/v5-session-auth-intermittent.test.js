"use strict";

/**
 * Regression: intermittent authenticated session loss must not force login redirects.
 * Covers touch failures, store lookup errors, auth gate reason codes, and tenant blips.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const { readV5Session } = require("../src/platform/session/readV5Session");
const { createLoadV5Session } = require("../src/platform/http/loadV5Session");
const {
  createRequireV5AuthenticatedSession,
  mapV5SessionReasonToAuthCode,
  inspectV5SessionAuth,
} = require("../src/platform/http/v5SessionAuthGate");
const {
  createLoadSessionScopedTenantContext,
} = require("../src/blessboard/http/loadSessionScopedTenantContext");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");

describe("v5 session auth intermittent loss", () => {
  it("maps store failure reasons to session_store_error", () => {
    assert.equal(
      mapV5SessionReasonToAuthCode("lookup_error", { cookiePresent: true }),
      "session_store_error"
    );
    assert.equal(
      mapV5SessionReasonToAuthCode("pool_unavailable", { cookiePresent: true }),
      "session_store_error"
    );
    assert.equal(
      mapV5SessionReasonToAuthCode("unauthenticated", { cookiePresent: true }),
      "session_not_found"
    );
    assert.equal(
      mapV5SessionReasonToAuthCode("none", { cookiePresent: false }),
      "no_session_cookie"
    );
    assert.equal(
      mapV5SessionReasonToAuthCode("expired", { cookiePresent: true }),
      "session_expired"
    );
  });

  it("survives last_seen touch failure without failing the session read", async () => {
    const row = {
      id: "sess-1",
      deployment_code: "blessboard-org-staging",
      user_id: "user-1",
      organization_id: "org-1",
      church_id: "ch-1",
      branch_id: "br-1",
      created_at: new Date(),
      last_seen_at: new Date(0),
      expires_at: new Date(Date.now() + 3600_000),
      revoked_at: null,
      email_normalized: "a@example.org",
      display_name: "A",
      user_status: "active",
    };
    let selectCount = 0;
    let updateCount = 0;
    const client = {
      async query(sql) {
        const text = String(sql);
        if (text.includes("FROM platform.deployment_sessions")) {
          selectCount += 1;
          return { rows: [row] };
        }
        if (text.includes("SET last_seen_at")) {
          updateCount += 1;
          throw new Error("connection terminated unexpectedly");
        }
        throw new Error(`unexpected query: ${text.slice(0, 80)}`);
      },
    };

    const result = await readV5Session(client, {
      rawToken: "tok-touch-fail",
      deploymentCode: "blessboard-org-staging",
      touch: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.code, "ok");
    assert.equal(result.session.userId, "user-1");
    assert.equal(selectCount, 1);
    assert.equal(updateCount, 1);
  });

  it("loadV5Session retries once then surfaces lookup_error without clearing cookie state", async () => {
    let attempts = 0;
    const load = createLoadV5Session({
      getDeploymentCode: () => ({ ok: true, code: "blessboard-org-staging" }),
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      readSession: async () => {
        attempts += 1;
        throw new Error("temporary pool blip");
      },
      log: () => {},
    });

    const req = {
      path: "/branch-admin/members",
      headers: { cookie: `${DEFAULT_V5_COOKIE}=raw-session-token` },
      cookies: { [DEFAULT_V5_COOKIE]: "raw-session-token" },
      requestId: "req-test-1",
    };
    const res = {
      headers: {},
      setHeader() {},
      getHeader() {
        return undefined;
      },
    };
    let nextCalled = false;
    await load(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(req.v5Session.authenticated, false);
    assert.equal(req.v5Session.reason, "lookup_error");
    assert.equal(attempts, 2);
    assert.equal(req.cookies[DEFAULT_V5_COOKIE], "raw-session-token");
  });

  it("auth gate returns 503 for store errors and does not redirect to login", async () => {
    const requireSession = createRequireV5AuthenticatedSession({
      loginNext: "/branch-admin",
      log: () => {},
    });
    const req = {
      path: "/branch-admin",
      originalUrl: "/branch-admin",
      headers: { cookie: `${DEFAULT_V5_COOKIE}=tok`, accept: "text/html" },
      cookies: { [DEFAULT_V5_COOKIE]: "tok" },
      get(name) {
        return this.headers[String(name).toLowerCase()];
      },
      v5Session: { authenticated: false, reason: "lookup_error", session: null },
      requestId: "req-store-err",
    };
    const res = mockRes();
    const ok = requireSession(req, res);
    assert.equal(ok, false);
    assert.equal(res.statusCode, 503);
    assert.equal(res.redirectLocation, null);
    assert.equal(res.headers["X-BB-Auth-Reason"], "session_store_error");
    assert.match(String(res.headers["Cache-Control"] || ""), /no-store/);
    assert.equal(res.clearedCookies.length, 0);
  });

  it("auth redirects set private no-store so proxies cannot cache login 303s", () => {
    const requireSession = createRequireV5AuthenticatedSession({
      loginNext: "/branch-admin",
      log: () => {},
    });
    const req = {
      path: "/branch-admin",
      originalUrl: "/branch-admin",
      headers: { accept: "text/html" },
      cookies: {},
      get(name) {
        return this.headers[String(name).toLowerCase()];
      },
      v5Session: { authenticated: false, reason: "none", session: null },
    };
    const res = mockRes();
    const ok = requireSession(req, res);
    assert.equal(ok, false);
    assert.equal(res.statusCode, 303);
    assert.match(String(res.redirectLocation), /\/login\?next=/);
    assert.equal(res.headers["X-BB-Auth-Reason"], "no_session_cookie");
    assert.match(String(res.headers["Cache-Control"] || ""), /private/);
    assert.match(String(res.headers["Cache-Control"] || ""), /no-store/);
    assert.match(String(res.headers.Vary || ""), /Cookie/i);
    assert.equal(res.headers["Surrogate-Control"], "no-store");
  });

  it("wantsV5PrivateNoStore covers branch-admin module paths", () => {
    const { wantsV5PrivateNoStore } = require("../src/platform/http/v5PrivateNoStore");
    for (const route of BRANCH_ADMIN_ROUTES) {
      assert.equal(wantsV5PrivateNoStore(route), true, route);
    }
    assert.equal(wantsV5PrivateNoStore("/"), false);
    assert.equal(wantsV5PrivateNoStore("/pricing"), false);
  });

  it("auth gate blocks cookie-present missing sessions without store-error 503", () => {
    const requireSession = createRequireV5AuthenticatedSession({
      loginNext: "/branch-admin",
      log: () => {},
    });
    const req = {
      path: "/branch-admin",
      originalUrl: "/branch-admin",
      headers: { cookie: `${DEFAULT_V5_COOKIE}=gone`, accept: "text/html" },
      cookies: { [DEFAULT_V5_COOKIE]: "gone" },
      get(name) {
        return this.headers[String(name).toLowerCase()];
      },
      v5Session: { authenticated: false, reason: "unauthenticated", session: null },
    };
    const res = mockRes();
    const ok = requireSession(req, res);
    assert.equal(ok, false);
    assert.equal(res.statusCode, 303);
    assert.equal(res.headers["X-BB-Auth-Reason"], "session_not_found");
  });

  it("temporary tenant catalogue failure does not clear or revoke the V5 session", async () => {
    const loadTenant = createLoadSessionScopedTenantContext({
      isApexHost: () => true,
      getPool: () => ({
        async query() {
          throw new Error("catalogue timeout");
        },
      }),
    });
    const req = {
      v5Session: {
        authenticated: true,
        reason: "ok",
        session: {
          organizationId: "11111111-1111-4111-8111-111111111111",
          branchId: null,
        },
      },
      blessBoardTenantContext: null,
    };
    const res = mockRes();
    let nextCalled = false;
    await loadTenant(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(req.v5Session.authenticated, true);
    assert.equal(req.v5Session.reason, "ok");
    assert.equal(req.blessBoardSessionTenantReason, "lookup_error");
    assert.equal(res.clearedCookies.length, 0);
  });

  it("session remains valid across repeated loadV5Session calls (shared store)", async () => {
    const sessionPayload = {
      id: "s1",
      deploymentCode: "blessboard-org-staging",
      userId: "u1",
      organizationId: "o1",
      churchId: "c1",
      branchId: "b1",
      user: { id: "u1", emailNormalized: "u@example.org", displayName: "U", status: "active" },
    };
    let reads = 0;
    const load = createLoadV5Session({
      getDeploymentCode: () => ({ ok: true, code: "blessboard-org-staging" }),
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      readSession: async () => {
        reads += 1;
        return { ok: true, code: "ok", session: sessionPayload };
      },
      log: () => {},
    });

    for (let i = 0; i < 12; i += 1) {
      const req = {
        path: BRANCH_ADMIN_ROUTES[i % BRANCH_ADMIN_ROUTES.length],
        headers: { cookie: `${DEFAULT_V5_COOKIE}=stable-token` },
        cookies: { [DEFAULT_V5_COOKIE]: "stable-token" },
        requestId: `repeat-${i}`,
      };
      await load(req, {}, () => {});
      assert.equal(req.v5Session.authenticated, true);
      assert.equal(req.v5Session.reason, "ok");
      const inspected = inspectV5SessionAuth(req);
      assert.equal(inspected.authenticated, true);
    }
    assert.equal(reads, 12);
  });

  it("express gate survives module navigation without login redirects when session is ok", async () => {
    const app = express();
    const requireSession = createRequireV5AuthenticatedSession({
      loginNext: "/branch-admin",
      log: () => {},
    });
    for (const route of BRANCH_ADMIN_ROUTES) {
      app.get(route, (req, res) => {
        req.v5Session = {
          authenticated: true,
          reason: "ok",
          session: { userId: "u1", organizationId: "o1" },
        };
        req.cookies = { [DEFAULT_V5_COOKIE]: "tok" };
        if (!requireSession(req, res, { loginNext: route })) return;
        res.status(200).type("text").send(`ok:${route}`);
      });
    }

    const server = await listen(app);
    try {
      for (let round = 0; round < 3; round += 1) {
        for (const route of BRANCH_ADMIN_ROUTES) {
          const result = await get(server.port, route, {
            Cookie: `${DEFAULT_V5_COOKIE}=tok`,
            Accept: "text/html",
          });
          assert.equal(result.status, 200, `${route} round ${round}`);
          assert.equal(result.headers.location, undefined);
        }
      }
    } finally {
      await close(server);
    }
  });

  it("store-error responses do not create login redirect loops", async () => {
    const app = express();
    const requireSession = createRequireV5AuthenticatedSession({
      loginNext: "/branch-admin",
      log: () => {},
    });
    app.get("/branch-admin", (req, res) => {
      req.v5Session = { authenticated: false, reason: "lookup_error", session: null };
      req.cookies = { [DEFAULT_V5_COOKIE]: "tok" };
      if (!requireSession(req, res)) return;
      res.status(200).send("ok");
    });
    const server = await listen(app);
    try {
      const result = await get(server.port, "/branch-admin", {
        Cookie: `${DEFAULT_V5_COOKIE}=tok`,
        Accept: "text/html",
      });
      assert.equal(result.status, 503);
      assert.equal(result.headers.location, undefined);
      assert.equal(result.headers["x-bb-auth-reason"], "session_store_error");
    } finally {
      await close(server);
    }
  });
});

const BRANCH_ADMIN_ROUTES = [
  "/branch-admin",
  "/branch-admin/members",
  "/branch-admin/registrations",
  "/branch-admin/announcements",
  "/branch-admin/attendance",
  "/branch-admin/giving",
  "/branch-admin/participation",
  "/branch-admin/resources",
  "/branch-admin/forms",
  "/branch-admin/requests",
];

function mockRes() {
  return {
    statusCode: 200,
    redirectLocation: null,
    headers: {},
    body: "",
    clearedCookies: [],
    setHeader(name, value) {
      this.headers[name] = value;
    },
    getHeader(name) {
      const key = Object.keys(this.headers).find(
        (k) => k.toLowerCase() === String(name).toLowerCase()
      );
      return key ? this.headers[key] : undefined;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    type() {
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    redirect(code, location) {
      this.statusCode = code;
      this.redirectLocation = location;
      return this;
    },
    clearCookie(name) {
      this.clearedCookies.push(name);
      return this;
    },
  };
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
    server.on("error", reject);
  });
}

function close(handle) {
  return new Promise((resolve) => {
    handle.server.close(() => resolve());
  });
}

function get(port, pathOnly, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathOnly,
        method: "GET",
        headers: headers || {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}
