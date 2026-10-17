"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const {
  PURPOSE,
  issueMemberPortalInvitation,
  revokeMemberPortalInvitation,
} = require("../src/blessboard/services/memberPortalInvitationService");

let pool;
describe("V211 member portal invitation service", () => {
  before(() => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || "postgresql:///getpro_v211_test_01?host=/tmp",
    });
  });
  after(async () => { await pool.end(); });

  it("rejects an unapproved invitation purpose before database work", async () => {
    const result = await issueMemberPortalInvitation(pool, {
      purpose: "STAFF_INVITATION",
      actorUserId: "not-used",
    });
    assert.deepEqual(result, { ok: false, code: "invalid_purpose" });
  });

  it("rejects missing and foreign invitation targets without creating records", async () => {
    const result = await issueMemberPortalInvitation(pool, {
      purpose: PURPOSE,
      actorUserId: "00000000-0000-4000-8000-000000000001",
      organizationId: "00000000-0000-4000-8000-000000000002",
      churchId: "00000000-0000-4000-8000-000000000003",
      memberId: "00000000-0000-4000-8000-000000000004",
    });
    assert.equal(result.ok, false);
    assert.ok(["not_found", "failed"].includes(result.code));
  });

  it("rejects an invalid invitation identifier without mutating storage", async () => {
    const result = await revokeMemberPortalInvitation(pool, {
      invitationId: "00000000-0000-4000-8000-000000000005",
      actorUserId: "00000000-0000-4000-8000-000000000001",
      organizationId: "00000000-0000-4000-8000-000000000002",
      churchId: "00000000-0000-4000-8000-000000000003",
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "not_found");
  });
});
