"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const branchRepo = require("../src/blessboard/repositories/blessBoardBranchRepository");

test("service-time repository contract reads and writes tenant-scoped branch mode", async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes("SELECT b.service_times_mode")) {
        return { rows: [{ service_times_mode: "hidden" }] };
      }
      return { rows: [{ service_times_mode: "override" }] };
    },
  };

  const mode = await branchRepo.getBranchServiceTimesMode(
    client,
    "branch-id",
    "church-id",
    "organization-id"
  );
  const updated = await branchRepo.setBranchServiceTimesMode(client, {
    branchId: "branch-id",
    churchId: "church-id",
    organizationId: "organization-id",
    mode: "override",
  });

  assert.equal(mode, "hidden");
  assert.equal(updated.service_times_mode, "override");
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /c\.organization_id = \$3::uuid/);
  assert.match(calls[1].sql, /c\.organization_id = \$4::uuid/);
});
