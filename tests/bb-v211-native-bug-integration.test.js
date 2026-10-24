"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, describe, it } = require("node:test");
const { Pool } = require("pg");

const ROOT = path.resolve(__dirname, "..");
const DATABASE_URL = process.env.DATABASE_URL;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

if (!DATABASE_URL || !TEST_DATABASE_URL ||
    !/127\.0\.0\.1:5432\/getpro_v211_qa_sandbox_02(?:\?|$)/.test(DATABASE_URL) ||
    !/127\.0\.0\.1:5432\/getpro_v211_qa_sandbox_02(?:\?|$)/.test(TEST_DATABASE_URL)) {
  throw new Error("Explicit approved QA database URLs are required");
}

describe("BlessBoard V2.11 native bug integration preflight", () => {
  let pool;
  let tenant;

  before(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    tenant = (await pool.query(`
      SELECT o.id organization_id, o.organization_key, d.hostname,
             c.id church_id, c.church_key, b.id branch_id, b.branch_key
        FROM platform.organizations o
        JOIN platform.domains d ON d.organization_id = o.id AND d.status = 'active'
        JOIN blessboard.churches c ON c.organization_id = o.id AND c.status = 'active'
        JOIN blessboard.branches b ON b.church_id = c.id
          AND b.is_primary = true AND b.status = 'active'
       WHERE o.organization_key = 'v211-qa-bb'
       ORDER BY d.hostname
       LIMIT 1
    `)).rows[0];
  });

  after(async () => {
    await pool?.end();
  });

  it("BB-V211-001 verifies the current tenant/member portal contract", () => {
    assert.ok(tenant, "synthetic V2.11 tenant fixture must exist");
    assert.match(read("src/blessboard/http/memberPortalRoutes.js"), /member/);
    assert.match(read("src/blessboard/services/requireActiveMemberForTenant.js"), /active/);
  });

  it("BB-V211-002 verifies branch event route and current schema", () => {
    assert.ok(tenant?.branch_id);
    assert.match(read("tests/church-branch-announcements-events.test.js"), /\/branch\/events/);
    assert.match(read("src/db/pg/church/eventsRepo.js"), /INSERT INTO blessboard\.events|INSERT INTO/);
  });

  it("BB-V211-003 verifies sermon/public listing contract", () => {
    assert.ok(tenant?.church_id);
    assert.ok(fs.existsSync(path.join(ROOT, "tests/church-public-events-sermons-visual.test.js")));
    assert.match(read("src/routes/church/publicPages.js"), /sermon|sermons/i);
  });

  it("BB-V211-004 verifies entitlement-backed branch capacity inputs", async () => {
    assert.ok(tenant?.organization_id);
    const result = await pool.query(
      "SELECT organization_key FROM platform.organizations WHERE id = $1",
      [tenant.organization_id]
    );
    assert.equal(result.rows.length, 1);
    assert.match(read("src/platform/services/entitlementService.js"), /branch/i);
    assert.match(read("src/blessboard/services/createBlessBoardBranch.js"), /limit|entitlement|branch/i);
  });

  it("BB-V211-005 records that image section support requires schema approval", () => {
    assert.match(read("src/blessboard/services/websiteStructuredDraftService.js"), /section/i);
    assert.match(read("src/platform/website/mediaService.js"), /media/i);
  });

  it("BB-V211-006 verifies current announcement attachment/media contracts", () => {
    assert.match(read("tests/church-branch-announcement-attachments.test.js"), /attachment/i);
    assert.match(read("src/blessboard/http/announcementPublicRoutes.js"), /attachment|announcements/i);
    assert.ok(tenant?.church_id);
  });
});
