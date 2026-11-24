"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("member portal forms stay on the church path and the apex login stays tenant-scoped", () => {
  const routes = read("src/blessboard/http/memberPortalAuthRoutes.js");
  const login = read("views/blessboard/v5/member-auth/login.ejs");
  const recovery = read("views/blessboard/v5/member-auth/recovery-verify.ejs");
  assert.match(routes, /function portalBase/);
  assert.match(routes, /res\.redirect\(303, memberHref\(req, "\/member"\)\)/);
  assert.match(login, /portalBase/);
  assert.equal(recovery.includes("testCode"), false);
  assert.equal(recovery.includes("Test code:"), false);
});

test("member OTP delivery is a testing-only harness and the challenge migration stays absent", () => {
  const server = read("src/platform/http/moovexPlatformRuntimeServer.js");
  assert.match(server, /\/__platform\/qa\/blessboard-member-otp-delivery/);
  assert.match(server, /refused_non_testing_environment/);
  assert.match(server, /refused_non_testing_deployment/);
  assert.equal(fs.existsSync(path.join(root, "db/migrations/platform/048_otp_challenges.sql")), false);
});

test("website editor remains an existing invite role without member creation", () => {
  const roles = read("views/blessboard/v5/hq/roles.ejs");
  const invite = read("src/blessboard/services/inviteBlessBoardStaff.js");
  const permissions = read("db/migrations/blessboard/057_create_rbac_permissions_roles.sql");
  assert.match(roles, /value="website_editor"/);
  assert.match(invite, /"website_editor"/);
  assert.match(permissions, /r\.role_key = 'website_editor'/);
  assert.match(permissions, /'website\.view', 'website\.edit'/);
});
