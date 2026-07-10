"use strict";

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const SCRIPT = path.join(__dirname, "../scripts/create-demo-church-admin.js");
const BRANCH_ADMIN_AUTH = path.join(__dirname, "../src/church/branchAdminAuth.js");
const BRANCH_LOGIN = path.join(__dirname, "../src/routes/church/branchAdmin.js");

test("create-demo-church-admin script exists", () => {
  assert.ok(fs.existsSync(SCRIPT), "scripts/create-demo-church-admin.js should exist");
});

test("create-demo-church-admin uses branch admin password hashing helper", () => {
  const text = fs.readFileSync(SCRIPT, "utf8");
  assert.match(text, /hashBranchAdminPassword/);
  assert.match(text, /branchAdminAuth/);
  assert.match(text, /host_slug|findBranchByHostSlug/);
  assert.match(text, /['"]demo['"]|DEMO_CHURCH_SLUG|DEMO_HOST_SLUG/);
  assert.match(text, /admin@demo\.blessboard\.com/);
  assert.doesNotMatch(text, /seedChurchDemoOrganizationIfMissing|app\.listen|createServer/);
  assert.match(text, /isPgConfigured|DATABASE_URL/);
});

test("branch admin auth exports hashBranchAdminPassword used by login", () => {
  const auth = fs.readFileSync(BRANCH_ADMIN_AUTH, "utf8");
  assert.match(auth, /hashBranchAdminPassword:\s*hashMemberPassword/);
  assert.match(auth, /verifyBranchAdminPassword:\s*verifyMemberPassword/);

  const login = fs.readFileSync(BRANCH_LOGIN, "utf8");
  assert.match(login, /router\.get\("\/branch\/login"/);
  assert.match(login, /verifyBranchAdminPassword/);
});

test("package.json includes church:demo-admin script", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
  assert.equal(pkg.scripts["church:demo-admin"], "node scripts/create-demo-church-admin.js");
});
