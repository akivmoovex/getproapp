"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  FAILURE_KINDS,
  sanitizePublicMessage,
  mapErrorToFailure,
  renderChurchFailureState,
  unavailableKindFromStatus,
  churchFailureErrorHandler,
} = require("../src/church/churchFailureStates");
const { requestCorrelationId, getCorrelationId } = require("../src/middleware/requestCorrelationId");
const { churchOperationalAccessGate, renderChurchNotFound } = require("../src/church/churchStatusAccess");
const churchRoutes = require("../src/routes/church");
const { PACKAGE_FEATURE_DENIED } = require("../src/services/church/churchPackageFeatureGateService");

function makeFailureApp(ctx, opts = {}) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestCorrelationId);
  app.use(
    session({
      secret: "church-failure-states-test",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = opts.isChurchHost !== false;
    req.churchContext = ctx || {
      kind: "branch",
      hostSlug: "demo",
      organization: { id: 1, name: "Demo Church", status: "active" },
      branch: { id: 1, name: "Main", status: "active" },
    };
    if (opts.member) req.session.churchMember = opts.member;
    if (opts.branchAdmin) req.session.churchBranchAdmin = opts.branchAdmin;
    next();
  });
  if (opts.withGate) {
    app.use(churchOperationalAccessGate);
  }
  if (typeof opts.mount === "function") {
    opts.mount(app);
  }
  if (opts.withChurchRoutes) {
    app.use(churchRoutes());
  } else if (!opts.gateOnly) {
    app.get("/__fail/:kind", (req, res) => {
      return renderChurchFailureState(req, res, req.params.kind, {
        message: req.query.message || undefined,
      });
    });
    app.get("/__boom", (req, res, next) => {
      const err = new Error("SELECT * FROM secrets WHERE password='hunter2' at /Users/dev/app/src/x.js:12");
      err.code = "INTERNAL";
      return next(err);
    });
    app.get("/__quota", (req, res, next) => {
      const err = new Error("Active members limit reached on Foundation.");
      err.code = "FOUNDATION_MEMBER_LIMIT";
      return next(err);
    });
    app.get("/__package", (req, res, next) => {
      const err = new Error("Appointments require Growth.");
      err.code = PACKAGE_FEATURE_DENIED;
      return next(err);
    });
    app.get("/__validation", (req, res, next) => {
      const err = new Error("Email is required.");
      err.code = "VALIDATION";
      return next(err);
    });
    app.get("/member/dashboard", (req, res, next) => {
      const { requireChurchMemberSession } = require("../src/church/memberAuth");
      return requireChurchMemberSession(req, res, () => res.status(200).type("text").send("member-ok"));
    });
    app.get("/branch/dashboard", (req, res, next) => {
      const { requireChurchBranchAdminSession } = require("../src/church/branchAdminAuth");
      return requireChurchBranchAdminSession(req, res, () => res.status(200).type("text").send("admin-ok"));
    });
    app.use(churchFailureErrorHandler);
  }
  app.use((req, res) => res.status(404).type("text").send("fallback"));
  return app;
}

test("failure catalogue covers required status codes", () => {
  const expected = {
    validation: 400,
    unauthenticated: 401,
    forbidden: 403,
    not_found: 404,
    package_restricted: 409,
    quota_conflict: 409,
    rate_limited: 429,
    internal_error: 500,
    service_unavailable: 503,
    organization_suspended: 503,
    organization_dormant: 503,
    branch_suspended: 503,
    branch_inactive: 503,
  };
  for (const [kind, status] of Object.entries(expected)) {
    assert.equal(FAILURE_KINDS[kind].status, status, kind);
  }
});

test("sanitizePublicMessage redacts secrets, SQL, stacks and paths", () => {
  assert.equal(
    sanitizePublicMessage("password=hunter2 DATABASE_URL=postgres://u:p@h/db", "safe"),
    "safe"
  );
  assert.equal(sanitizePublicMessage("at Object.<anonymous> (/Users/dev/x.js:10:5)", "safe"), "safe");
  assert.equal(sanitizePublicMessage("SELECT * FROM church_members", "safe"), "safe");
  assert.equal(sanitizePublicMessage("Email is required.", "safe"), "Email is required.");
});

test("mapErrorToFailure distinguishes package restriction from permission denial", () => {
  const pkg = mapErrorToFailure({ code: PACKAGE_FEATURE_DENIED, message: "Needs Growth" });
  assert.equal(pkg.kind, "package_restricted");

  const quota = mapErrorToFailure({ code: "FOUNDATION_MEMBER_LIMIT", message: "limit" });
  assert.equal(quota.kind, "quota_conflict");

  const forbidden = mapErrorToFailure({ status: 403, message: "No access" });
  assert.equal(forbidden.kind, "forbidden");
});

test("unavailableKindFromStatus distinguishes dormant, suspended and inactive branch", () => {
  assert.equal(unavailableKindFromStatus("dormant", "active"), "organization_dormant");
  assert.equal(unavailableKindFromStatus("suspended", "active"), "organization_suspended");
  assert.equal(unavailableKindFromStatus("active", "suspended"), "branch_suspended");
  assert.equal(unavailableKindFromStatus("active", "archived"), "branch_inactive");
});

test("each status code renders safe HTML with correlation id and next actions", async () => {
  const app = makeFailureApp(null);
  const kinds = [
    "validation",
    "unauthenticated",
    "forbidden",
    "not_found",
    "package_restricted",
    "quota_conflict",
    "rate_limited",
    "internal_error",
    "service_unavailable",
    "organization_suspended",
    "organization_dormant",
    "branch_inactive",
  ];

  for (const kind of kinds) {
    const res = await request(app).get(`/__fail/${kind}`).set("X-Request-Id", `test-${kind}-abcdef12`);
    assert.equal(res.status, FAILURE_KINDS[kind].status, kind);
    assert.equal(res.headers["x-request-id"], `test-${kind}-abcdef12`);
    assert.match(res.text, /church-unavailable|failure-kind|Reference:/i);
    assert.doesNotMatch(res.text, /postgres:\/\/|DATABASE_URL|\/Users\/|SELECT \*|password=hunter/i);
    assert.match(res.text, /church-btn|Sign in|Back to home|BlessBoard|package|Try again|HQ sign in/i);
  }
});

test("production error redaction on 500", async () => {
  const app = makeFailureApp(null);
  const res = await request(app).get("/__boom");
  assert.equal(res.status, 500);
  assert.doesNotMatch(res.text, /hunter2|SELECT \*|\/Users\/dev|secrets/i);
  assert.match(res.text, /Something went wrong|unexpected problem/i);
  assert.ok(res.headers["x-request-id"]);
});

test("quota conflict returns 409", async () => {
  const app = makeFailureApp(null);
  const res = await request(app).get("/__quota");
  assert.equal(res.status, 409);
  assert.match(res.text, /package limit|limit reached|quota/i);
  assert.match(res.text, /data-failure-kind="quota_conflict"/);
});

test("package restriction returns 409 not permission denial", async () => {
  const app = makeFailureApp(null);
  const res = await request(app).get("/__package");
  assert.equal(res.status, 409);
  assert.match(res.text, /package|Growth|not a permissions|Not included/i);
  assert.doesNotMatch(res.text, /data-failure-kind="forbidden"/);
});

test("validation failure returns 400", async () => {
  const app = makeFailureApp(null);
  const res = await request(app).get("/__validation");
  assert.equal(res.status, 400);
  assert.match(res.text, /Email is required|could not process/i);
});

test("public route invalid tenant uses not-found failure", async () => {
  const app = makeFailureApp(
    { kind: "branch", hostSlug: "missing-church", organization: null, branch: null },
    {
      withGate: true,
      gateOnly: true,
      mount: (app) => {
        app.get("/", (req, res) => renderChurchNotFound(req, res));
      },
    }
  );
  const res = await request(app).get("/");
  assert.equal(res.status, 404);
  assert.match(res.text, /not found|could not find/i);
  assert.doesNotMatch(res.text, /Welcome to|Sunday service|fabricated/i);
});

test("suspended organisation blocks public with suspended messaging", async () => {
  const app = makeFailureApp(
    {
      kind: "branch",
      hostSlug: "demo",
      organization: { id: 1, name: "Paused Church", status: "suspended" },
      branch: { id: 1, name: "Main", status: "active" },
    },
    {
      withGate: true,
      gateOnly: true,
      mount: (app) => {
        app.get("/", (req, res) => res.status(200).type("text").send("should-not-render"));
      },
    }
  );
  const res = await request(app).get("/");
  assert.equal(res.status, 503);
  assert.match(res.text, /suspended|temporarily unavailable/i);
  assert.match(res.text, /Paused Church|organisation is suspended/i);
});

test("inactive branch blocks public with inactive messaging", async () => {
  const app = makeFailureApp(
    {
      kind: "branch",
      hostSlug: "demo",
      organization: { id: 1, name: "Active Org", status: "active" },
      branch: { id: 1, name: "West Campus", status: "archived" },
    },
    {
      withGate: true,
      gateOnly: true,
      mount: (app) => {
        app.get("/", (req, res) => res.status(200).type("text").send("should-not-render"));
      },
    }
  );
  const res = await request(app).get("/");
  assert.equal(res.status, 503);
  assert.match(res.text, /not active|temporarily unavailable/i);
  assert.match(res.text, /data-failure-kind="branch_inactive"/);
});

test("dormant organisation messaging differs from suspended", async () => {
  const app = makeFailureApp(
    {
      kind: "branch",
      hostSlug: "demo",
      organization: { id: 1, name: "Quiet Church", status: "dormant" },
      branch: { id: 1, name: "Main", status: "active" },
    },
    {
      withGate: true,
      gateOnly: true,
      mount: (app) => {
        app.get("/", (req, res) => res.status(200).type("text").send("should-not-render"));
      },
    }
  );
  const res = await request(app).get("/");
  assert.equal(res.status, 503);
  assert.match(res.text, /dormant/i);
  assert.doesNotMatch(res.text, /data-failure-kind="organization_suspended"/);
  assert.match(res.text, /HQ sign in|reactivate/i);
});

test("member route unauthenticated HTML redirects to login", async () => {
  const app = makeFailureApp(null);
  const res = await request(app).get("/member/dashboard");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/login");
});

test("member route unauthenticated JSON returns 401", async () => {
  const app = makeFailureApp(null);
  const res = await request(app).get("/member/dashboard").set("Accept", "application/json");
  assert.equal(res.status, 401);
  assert.equal(res.body.error, "unauthenticated");
  assert.ok(res.body.correlationId);
  assert.doesNotMatch(JSON.stringify(res.body), /password|stack|\/Users\//i);
});

test("administrator route unauthenticated HTML redirects to branch login", async () => {
  const app = makeFailureApp(null);
  const res = await request(app).get("/branch/dashboard");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/branch/login");
});

test("administrator route unauthenticated JSON returns 401", async () => {
  const app = makeFailureApp(null);
  const res = await request(app).get("/branch/dashboard").set("Accept", "application/json");
  assert.equal(res.status, 401);
  assert.equal(res.body.error, "unauthenticated");
});

test("rate limit failure state is 429 with safe next action", async () => {
  const app = makeFailureApp(null);
  const res = await request(app).get("/__fail/rate_limited");
  assert.equal(res.status, 429);
  assert.match(res.text, /Too many requests|wait a few minutes/i);
  assert.match(res.text, /Try again|home/i);
});

test("forbidden failure is distinct from package restriction", async () => {
  const app = makeFailureApp(null);
  const forbidden = await request(app).get("/__fail/forbidden");
  assert.equal(forbidden.status, 403);
  assert.match(forbidden.text, /do not have access|permission/i);
  assert.doesNotMatch(forbidden.text, /package restriction|Not included in your package/i);

  const pkg = await request(app).get("/__fail/package_restricted");
  assert.equal(pkg.status, 409);
  assert.match(pkg.text, /package/i);
});

test("getCorrelationId reads from request", () => {
  const req = { correlationId: "bb_abc" };
  assert.equal(getCorrelationId(req), "bb_abc");
});
