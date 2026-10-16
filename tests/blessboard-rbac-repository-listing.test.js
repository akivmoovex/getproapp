"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { listAssignmentsForChurch } = require("../src/blessboard/repositories/blessBoardRbacRepository");

function client(rows = []) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      return { rows };
    },
  };
}

test("lists canonical HQ and owned branch assignments", async () => {
  const db = client([
    { id: "hq", scope_type: "church", scope_id: "church-a", church_id: "church-a" },
    { id: "branch", scope_type: "branch", scope_id: "branch-a", church_id: "church-a" },
  ]);
  const rows = await listAssignmentsForChurch(db, {
    organizationId: "org-a",
    churchId: "church-a",
  });
  assert.deepEqual(rows.map((row) => row.id), ["hq", "branch"]);
  assert.match(db.calls[0].sql, /scope_type = 'church'/);
  assert.match(db.calls[0].sql, /scope_type = 'branch'/);
  assert.deepEqual(db.calls[0].params, ["org-a", "church-a"]);
});

test("filters explicitly requested branch scope", async () => {
  const db = client([{ id: "branch", scope_type: "branch" }]);
  const rows = await listAssignmentsForChurch(db, {
    organizationId: "org-a",
    churchId: "church-a",
    scopeType: "branch",
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(db.calls[0].params, ["org-a", "church-a", "branch"]);
});

test("keeps cross-church and empty results empty", async () => {
  const db = client([]);
  assert.deepEqual(await listAssignmentsForChurch(db, {
    organizationId: "org-a",
    churchId: "church-a",
  }), []);
  assert.deepEqual(await listAssignmentsForChurch(db, {
    organizationId: "org-a",
    churchId: "church-a",
    scopeType: "other",
  }), []);
  assert.equal(db.calls.length, 1);
});

test("rejects invalid scope inputs without querying", async () => {
  const db = client();
  assert.deepEqual(await listAssignmentsForChurch(db, {
    organizationId: "",
    churchId: "church-a",
  }), []);
  assert.deepEqual(await listAssignmentsForChurch(db, {
    organizationId: "org-a",
    churchId: "church-a",
    scopeType: "user",
  }), []);
  assert.equal(db.calls.length, 0);
});

test("uses parameters rather than interpolating tenant values", async () => {
  const db = client();
  await listAssignmentsForChurch(db, {
    organizationId: "org'; DROP TABLE blessboard.user_role_assignments; --",
    churchId: "church-a",
  });
  assert.equal(db.calls.length, 1);
  assert.doesNotMatch(db.calls[0].sql, /DROP TABLE|org';/i);
  assert.equal(db.calls[0].params[0], "org'; DROP TABLE blessboard.user_role_assignments; --");
});
