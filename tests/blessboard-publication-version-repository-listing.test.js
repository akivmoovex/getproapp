"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  listPlatformVersionsByOrganization,
} = require("../src/blessboard/repositories/websitePublicationVersionRepository");

function fakeDb(rows) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      return { rows };
    },
  };
}

describe("platform website version compatibility listing", () => {
  it("scopes organization, orders deterministically, bounds limit, and maps shape", async () => {
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const db = fakeDb([
      {
        id: "v2",
        organization_id: organizationId,
        version_number: "2",
        snapshot_json: { page: "new" },
        status: "published",
        published_at: "2026-01-02T00:00:00.000Z",
      },
    ]);
    const rows = await listPlatformVersionsByOrganization(db, organizationId, 999);
    assert.deepEqual(rows, [
      {
        id: "v2",
        organizationId,
        branchId: null,
        versionNumber: 2,
        snapshot: { page: "new" },
        status: "published",
        publishedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    assert.match(db.calls[0].sql, /platform\.website_versions/);
    assert.match(db.calls[0].sql, /organization_id = \$1/);
    assert.match(db.calls[0].sql, /ORDER BY version_number DESC/);
    assert.deepEqual(db.calls[0].params, [organizationId, 100]);
  });

  it("returns empty results and rejects invalid organization ids without querying", async () => {
    const empty = fakeDb([]);
    assert.deepEqual(
      await listPlatformVersionsByOrganization(
        empty,
        "11111111-1111-4111-8111-111111111111",
        10
      ),
      []
    );
    assert.deepEqual(await listPlatformVersionsByOrganization(empty, "not-a-uuid"), []);
    assert.equal(empty.calls.length, 1);
  });
});
