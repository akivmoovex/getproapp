"use strict";

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const HQ_ADMIN_ROUTE = path.join(__dirname, "../src/routes/church/hqAdmin.js");
const BRANCH_ADMIN_ROUTE = path.join(__dirname, "../src/routes/church/branchAdmin.js");
const HQ_AUTH = path.join(__dirname, "../src/church/hqAuth.js");
const HQ_REPO = path.join(__dirname, "../src/db/pg/church/hqAdminsRepo.js");

test("hqAdminsRepo.findHqAdminById expects pool as first argument", () => {
  const text = fs.readFileSync(HQ_REPO, "utf8");
  assert.match(text, /async function findHqAdminById\(pool,\s*adminId\)/);
  assert.match(text, /pool\.query\(`SELECT \* FROM public\.church_hq_admins/);
});

test("hqAuth passes getPgPool() into findHqAdminById", () => {
  const text = fs.readFileSync(HQ_AUTH, "utf8");
  assert.match(text, /findHqAdminById\(getPgPool\(\),\s*admin\.hq_admin_id\)/);
});

test("hqAdmin /hq/account passes pool into findHqAdminById", () => {
  const text = fs.readFileSync(HQ_ADMIN_ROUTE, "utf8");
  assert.match(text, /findHqAdminById\(pool,\s*req\.churchHqAdmin\.hq_admin_id\)/);
  assert.match(text, /findHqAdminById\(pool,\s*adminId\)/);
  assert.doesNotMatch(text, /findHqAdminById\(req\.churchHqAdmin\.hq_admin_id\)/);
  assert.doesNotMatch(text, /findHqAdminById\(adminId\)/);
});

test("branchAdmin /branch/account passes pool into findBranchAdminById", () => {
  const text = fs.readFileSync(BRANCH_ADMIN_ROUTE, "utf8");
  assert.match(text, /findBranchAdminById\(pool,\s*req\.churchBranchAdmin\.admin_id\)/);
  assert.match(text, /findBranchAdminById\(pool,\s*adminId\)/);
  assert.doesNotMatch(text, /findBranchAdminById\(req\.churchBranchAdmin\.admin_id\)/);
});

test("findHqAdminById works when pool.query is provided", async () => {
  const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
  const fakePool = {
    async query(sql, params) {
      assert.match(String(sql), /church_hq_admins/);
      assert.deepEqual(params, [42]);
      return { rows: [{ id: 42, full_name: "Demo HQ", email: "hq@example.com", status: "active" }] };
    },
  };
  const row = await hqAdminsRepo.findHqAdminById(fakePool, 42);
  assert.equal(row.id, 42);
  assert.equal(row.email, "hq@example.com");
});

test("findHqAdminById throws pool.query is not a function when pool is omitted", async () => {
  const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
  await assert.rejects(
    () => hqAdminsRepo.findHqAdminById(42),
    (err) => {
      assert.match(String(err && err.message), /pool\.query is not a function|query is not a function/);
      return true;
    }
  );
});
