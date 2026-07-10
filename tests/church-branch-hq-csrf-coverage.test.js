"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  CSRF_FIELD,
  issueChurchSessionCsrfToken,
  requireChurchSessionCsrf,
  TOKEN_PREFIX,
} = require("../src/church/churchSessionCsrf");

const EXEMPT_BRANCH_HQ = new Set([
  "/branch/login",
  "/branch/forgot-password",
  "/hq/login",
  "/hq/forgot-password",
]);

const ROUTE_GROUPS = [
  {
    name: "members",
    file: "branchAdminMembers.js",
    paths: [
      "/branch/members/:memberId",
      "/branch/members/:memberId/approve",
      "/branch/members/:memberId/reject",
      "/branch/members/:memberId/request-more-info",
      "/branch/members/:memberId/verify",
      "/branch/members/:memberId/suspend",
      "/branch/members/:memberId/reactivate",
      "/branch/members/:memberId/add-note",
    ],
  },
  {
    name: "member-requests",
    file: "branchAdminMemberRequests.js",
    paths: [
      "/branch/requests/:requestId/start-review",
      "/branch/requests/:requestId/approve",
      "/branch/requests/:requestId/reject",
      "/branch/requests/:requestId/request-more-info",
      "/branch/requests/:requestId/complete",
    ],
  },
  {
    name: "prayer-requests",
    file: "branchAdminPrayerRequests.js",
    paths: [
      "/branch/prayer-requests/:prayerRequestId/mark-reviewed",
      "/branch/prayer-requests/:prayerRequestId/close",
    ],
  },
  {
    name: "events",
    file: "branchAdminEvents.js",
    paths: [
      "/branch/events",
      "/branch/events/:eventId",
      "/branch/events/:eventId/publish",
      "/branch/events/:eventId/cancel",
    ],
  },
  {
    name: "ministries",
    file: "branchAdminMinistries.js",
    paths: [
      "/branch/ministries",
      "/branch/ministries/:ministryId",
      "/branch/ministries/:ministryId/publish",
      "/branch/ministries/:ministryId/archive",
    ],
  },
  {
    name: "departments",
    file: "branchAdminDepartments.js",
    paths: [
      "/branch/departments",
      "/branch/departments/:departmentId",
      "/branch/departments/:departmentId/activate",
      "/branch/departments/:departmentId/archive",
    ],
  },
  {
    name: "leaders",
    file: "branchAdminLeaders.js",
    paths: [
      "/branch/leaders",
      "/branch/leaders/:leaderId",
      "/branch/leaders/:leaderId/activate",
      "/branch/leaders/:leaderId/deactivate",
      "/branch/leaders/:leaderId/reset-password",
    ],
  },
  {
    name: "duty-roster",
    file: "branchAdminDutyRoster.js",
    paths: [
      "/branch/duty-roster",
      "/branch/duty-roster/:dutyId",
      "/branch/duty-roster/:dutyId/confirm",
      "/branch/duty-roster/:dutyId/cancel",
    ],
  },
  {
    name: "attendance",
    file: "branchAdminAttendance.js",
    paths: ["/branch/attendance", "/branch/attendance/:recordId/update-status"],
  },
  {
    name: "giving",
    file: "branchAdminGiving.js",
    paths: ["/branch/giving-summary"],
  },
  {
    name: "giving-settings",
    file: "branchAdminGivingSettings.js",
    paths: ["/branch/giving-settings"],
  },
  {
    name: "reports",
    file: "branchAdminReports.js",
    paths: ["/branch/reports", "/branch/reports/:reportId/save-draft", "/branch/reports/:reportId/submit"],
  },
  {
    name: "website-site-settings",
    file: "branchAdminWebsiteEditor.js",
    paths: ["/branch/website-editor"],
  },
  {
    name: "site-settings-contact",
    file: "branchAdminSiteSettings.js",
    paths: ["/branch/site-settings", "/branch/contact-submissions/:submissionId"],
  },
  {
    name: "sermons",
    file: "branchAdminSermons.js",
    paths: ["/branch/sermons", "/branch/sermons/:sermonId"],
  },
  {
    name: "resources",
    file: "branchAdminResources.js",
    paths: ["/branch/resources", "/branch/resources/:resourceId"],
  },
  {
    name: "password-reset-inbox",
    file: "branchAdminPasswordResetRequests.js",
    paths: [
      "/branch/password-reset-requests/:requestId/mark-reviewed",
      "/branch/password-reset-requests/:requestId/reset-password",
      "/branch/password-reset-requests/:requestId/reject",
    ],
  },
  {
    name: "leader-password-reset-inbox",
    file: "branchAdminLeaderPasswordResetRequests.js",
    paths: [
      "/branch/leader-password-reset-requests/:requestId/mark-reviewed",
      "/branch/leader-password-reset-requests/:requestId/reset-password",
      "/branch/leader-password-reset-requests/:requestId/reject",
    ],
  },
  {
    name: "ministry-activity",
    file: "branchAdminMinistryActivity.js",
    paths: [
      "/branch/ministry-activity/:noteId/mark-reviewed",
      "/branch/ministry-activity/:noteId/request-follow-up",
    ],
  },
  {
    name: "branch-account-logout",
    file: "branchAdmin.js",
    paths: ["/branch/logout", "/branch/account/change-password"],
  },
  {
    name: "hq-account-reports-logout",
    file: "hqAdmin.js",
    paths: [
      "/hq/logout",
      "/hq/account/change-password",
      "/hq/reports/:reportId/approve",
      "/hq/reports/:reportId/request-changes",
    ],
  },
];

function readRouteFile(name) {
  return fs.readFileSync(path.join(__dirname, "../src/routes/church", name), "utf8");
}

function assertPathProtected(src, routePath) {
  const needle = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`router\\.(post|put|patch|delete)\\([\\s\\S]{0,200}?["']${needle}["'][\\s\\S]{0,500}?requireChurchSessionCsrf`);
  assert.match(src, re, `expected CSRF on ${routePath}`);
}

test("every remaining Branch Admin and HQ mutation route group enforces church CSRF", () => {
  for (const group of ROUTE_GROUPS) {
    const src = readRouteFile(group.file);
    assert.match(src, /requireChurchSessionCsrf/);
    for (const routePath of group.paths) {
      assertPathProtected(src, routePath);
    }
  }
});

test("login and forgot-password remain CSRF-exempt", () => {
  const branch = readRouteFile("branchAdmin.js");
  const hq = readRouteFile("hqAdmin.js");
  for (const p of EXEMPT_BRANCH_HQ) {
    const src = p.startsWith("/hq") ? hq : branch;
    const idx = src.indexOf(`"${p}"`);
    assert.ok(idx > 0, p);
    const window = src.slice(idx, idx + 250);
    assert.doesNotMatch(window, /requireChurchSessionCsrf/);
  }
});

test("already-protected Leader/announcement/broadcast/join CSRF remains present", () => {
  assert.match(readRouteFile("leaderJoinRequests.js"), /requireChurchSessionCsrf/);
  assert.match(readRouteFile("leaderPortal.js"), /requireChurchSessionCsrf/);
  assert.match(readRouteFile("branchAdminAnnouncements.js"), /requireChurchSessionCsrf/);
  assert.match(readRouteFile("branchAdminMinistryJoinRequests.js"), /requireChurchSessionCsrf/);
  assert.match(readRouteFile("hqAdminBroadcasts.js"), /requireChurchSessionCsrf/);
  const platform = fs.readFileSync(
    path.join(__dirname, "../src/church/platformAdminCsrf.js"),
    "utf8"
  );
  assert.match(platform, /pac1/);
  assert.match(platform, /requirePlatformAdminCsrf/);
});

test("HQ publish confirmation token remains distinct from church CSRF", () => {
  const src = readRouteFile("hqAdminBroadcasts.js");
  assert.match(src, /_publish_token|hqBroadcastPublishToken|issuePublishToken/);
  assert.match(src, /requireChurchSessionCsrf/);
  const view = fs.readFileSync(
    path.join(__dirname, "../views/church/hq/broadcast_confirm_publish.ejs"),
    "utf8"
  );
  assert.match(view, /_publish_token/);
  assert.match(view, /csrf_field|_csrf/);
});

test("representative Branch/HQ forms include CSRF field partial", () => {
  const forms = [
    "views/church/branch-admin/member_profile.ejs",
    "views/church/branch-admin/request_detail.ejs",
    "views/church/branch-admin/prayer_request_detail.ejs",
    "views/church/branch-admin/event_form.ejs",
    "views/church/branch-admin/ministry_form.ejs",
    "views/church/branch-admin/department_form.ejs",
    "views/church/branch-admin/leader_form.ejs",
    "views/church/branch-admin/duty_roster_form.ejs",
    "views/church/branch-admin/attendance_tracker.ejs",
    "views/church/branch-admin/giving_summary.ejs",
    "views/church/branch-admin/submit_monthly_report.ejs",
    "views/church/branch-admin/website_editor.ejs",
    "views/church/branch-admin/sermon_form.ejs",
    "views/church/branch-admin/resource_form.ejs",
    "views/church/branch-admin/password_reset_request_detail.ejs",
    "views/church/branch-admin/account.ejs",
    "views/church/hq/report_review_detail.ejs",
    "views/church/hq/account.ejs",
    "views/church/partials/branch_admin_shell_start.ejs",
    "views/church/partials/hq_shell_start.ejs",
  ];
  for (const rel of forms) {
    const text = fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
    assert.match(text, /csrf_field/, rel);
  }
});

function makeCsrfOnlyApp() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "branch-hq-csrf-unit",
      resave: false,
      saveUninitialized: true,
    })
  );
  let mutated = false;
  app.post("/probe", requireChurchSessionCsrf, (req, res) => {
    mutated = true;
    return res.status(200).type("text").send("ok");
  });
  app.get("/probe-state", (req, res) => res.json({ mutated }));
  app.get("/token", (req, res) => {
    const token = issueChurchSessionCsrfToken(req);
    return res.json({ token });
  });
  return app;
}

test("missing and invalid church CSRF tokens reject without mutation; valid token permits", async () => {
  const prev = process.env.GETPRO_REQUIRE_CHURCH_CSRF;
  process.env.GETPRO_REQUIRE_CHURCH_CSRF = "1";
  try {
    const app = makeCsrfOnlyApp();
    const agent = request.agent(app);

    const missing = await agent.post("/probe").type("form").send({ foo: "1" });
    assert.equal(missing.status, 403);
    assert.match(missing.text, /form token/i);
    assert.equal((await agent.get("/probe-state")).body.mutated, false);

    const invalid = await agent
      .post("/probe")
      .type("form")
      .send({
        foo: "1",
        [CSRF_FIELD]: `${TOKEN_PREFIX}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`,
      });
    assert.equal(invalid.status, 403);
    assert.equal((await agent.get("/probe-state")).body.mutated, false);

    const tokenRes = await agent.get("/token");
    const token = tokenRes.body.token;
    assert.ok(token);
    const token2 = (await agent.get("/token")).body.token;
    assert.notEqual(token, token2);

    const valid = await agent.post("/probe").type("form").send({ foo: "1", [CSRF_FIELD]: token });
    assert.equal(valid.status, 200);
    assert.equal((await agent.get("/probe-state")).body.mutated, true);

    const tabStillWorks = await agent.post("/probe").type("form").send({ foo: "1", [CSRF_FIELD]: token2 });
    assert.equal(tabStillWorks.status, 200);

    const headerOk = await agent
      .post("/probe")
      .set("x-csrf-token", token)
      .type("form")
      .send({ foo: "1" });
    assert.equal(headerOk.status, 200);
  } finally {
    if (prev === undefined) delete process.env.GETPRO_REQUIRE_CHURCH_CSRF;
    else process.env.GETPRO_REQUIRE_CHURCH_CSRF = prev;
  }
});

test("GET routes are not CSRF-gated by requireChurchSessionCsrfOnMutations pattern in church helper", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/church/churchSessionCsrf.js"), "utf8");
  assert.match(src, /requireChurchSessionCsrfOnMutations/);
  assert.match(src, /method === "GET"/);
});
