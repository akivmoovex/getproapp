"use strict";

/**
 * V2.06 — BlessBoard church service times: draft save → website publish → public.
 *
 * Root cause covered: save_draft left page_sections.status=draft while website
 * publish only flipped public_pages; public resolvers require published sections.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const {
  saveHomeServiceTimes,
  loadAdminServiceTimes,
  resolvePublicServiceTimesEntries,
  SERVICE_TIMES_SCHEMA,
} = require("../src/blessboard/services/homeServiceTimesService");
const {
  publishChurchWebsite,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  buildPublicationSnapshot,
} = require("../src/blessboard/services/websitePublicationVersionService");
const contentRepo = require("../src/blessboard/repositories/publicContentRepository");
const {
  listStructuredDrafts,
} = require("../src/blessboard/repositories/websiteStructuredDraftRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

async function provisionChurch(pool) {
  const key = uniq("v206st");
  const row = await appRepo.createApplication(pool, {
    church_name: `V206 Services ${key}`,
    country: "Zambia",
    city: "Lusaka",
    contact_name: "Site Admin",
    contact_email: `${key}@example.org`,
    contact_phone: `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
    selected_plan: "foundation",
    consent_terms: true,
    branch_name: "Main Campus",
  });
  const result = await provisionRegisteredBlessBoardChurch(pool, {
    applicationId: row.id,
    administratorPassword: PASSWORD,
    requestId: `req-${key}`,
    actorContext: {
      type: "test",
      source: "unit",
      dataEnvironment: "testing",
      deploymentCode: "blessboard-org-staging",
    },
  });
  assert.equal(result.ok, true, result.message || result.status);
  return result.records;
}

describe("V2.06 BlessBoard church services publish", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("1–7: save_draft → reopen → publish → public → republish", async () => {
    requireDb();
    const records = await provisionChurch(pool);
    const entries = [
      {
        id: "svc-1",
        name: "Sunday Worship V206",
        day: "sunday",
        startTime: "10:00",
        endTime: "11:30",
        enabled: true,
        primary: true,
        sortOrder: 10,
      },
    ];

    const saved = await saveHomeServiceTimes(pool, {
      churchId: records.churchId,
      branchId: null,
      organizationId: records.organizationId,
      actorUserId: records.administratorUserId,
      action: "save_draft",
      entries,
    });
    assert.equal(saved.ok, true, saved.message || saved.reason);
    assert.equal(saved.published, false);

    const reopened = await loadAdminServiceTimes(pool, {
      churchId: records.churchId,
      branchId: null,
    });
    assert.equal(reopened.ok, true);
    assert.equal(reopened.draftOverlay, true);
    assert.ok(
      (reopened.entries || []).some((e) => e.name === "Sunday Worship V206"),
      "draft reopen should retain service times"
    );

    const published = await publishChurchWebsite(pool, {
      churchId: records.churchId,
      organizationId: records.organizationId,
      branchId: null,
      actorUserId: records.administratorUserId,
      deferServiceTimes: true,
      confirmPublish: true,
      forcePublishVersion: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
    });
    assert.equal(published.ok, true, published.message || published.reason || published.status);

    const page = await contentRepo.findPageByScope(pool, {
      churchId: records.churchId,
      branchId: null,
      pageKey: "home",
    });
    assert.equal(page.status, "published");
    const sections = await contentRepo.listSectionsForPage(pool, page.id, {
      status: "published",
    });
    const st = (sections || []).find((s) => s.sectionKey === "service_times");
    assert.ok(st, "service_times section must be published after website publish");
    assert.equal(st.status, "published");
    assert.equal(st.layoutMetadata.schema, SERVICE_TIMES_SCHEMA);
    assert.ok(
      (st.layoutMetadata.entries || []).some((e) => e.name === "Sunday Worship V206")
    );

    const snapshot = await buildPublicationSnapshot(pool, records.churchId, null);
    const home = (snapshot.pages || []).find((p) => p.pageKey === "home");
    const snapSt =
      home && (home.sections || []).find((s) => s.sectionKey === "service_times");
    assert.ok(snapSt && snapSt.layoutMetadata);
    assert.ok(
      (snapSt.layoutMetadata.entries || []).some((e) => e.name === "Sunday Worship V206")
    );

    const pub = await resolvePublicServiceTimesEntries(pool, {
      churchId: records.churchId,
      branchId: null,
    });
    assert.deepEqual(
      pub.entries.map((e) => e.name),
      ["Sunday Worship V206"]
    );

    const updated = await saveHomeServiceTimes(pool, {
      churchId: records.churchId,
      branchId: null,
      organizationId: records.organizationId,
      actorUserId: records.administratorUserId,
      action: "save_draft",
      entries: [
        {
          id: "svc-1",
          name: "Sunday Worship UPDATED",
          day: "sunday",
          startTime: "10:30",
          enabled: true,
          primary: true,
          sortOrder: 10,
        },
      ],
    });
    assert.equal(updated.ok, true);
    assert.equal(updated.draftOverlay, true);

    const stillLive = await resolvePublicServiceTimesEntries(pool, {
      churchId: records.churchId,
      branchId: null,
    });
    assert.deepEqual(
      stillLive.entries.map((e) => e.name),
      ["Sunday Worship V206"],
      "draft overlay must not demote live public service times"
    );

    const drafts = await listStructuredDrafts(pool, {
      churchId: records.churchId,
      branchId: null,
    });
    assert.ok(
      (drafts || []).some((d) => d.draftKind === "service_times"),
      "live-site draft save should create structured overlay"
    );

    const republished = await publishChurchWebsite(pool, {
      churchId: records.churchId,
      organizationId: records.organizationId,
      branchId: null,
      actorUserId: records.administratorUserId,
      deferServiceTimes: true,
      confirmPublish: true,
      forcePublishVersion: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
    });
    assert.equal(republished.ok, true, republished.message || republished.reason);

    const after = await resolvePublicServiceTimesEntries(pool, {
      churchId: records.churchId,
      branchId: null,
    });
    assert.deepEqual(
      after.entries.map((e) => e.name),
      ["Sunday Worship UPDATED"]
    );
  });

  it("draft page_sections are promoted on BB website publish", async () => {
    requireDb();
    const records = await provisionChurch(pool);
    // Simulate legacy save_draft demotion: entries on a draft section while home is published.
    const page = await contentRepo.findPageByScope(pool, {
      churchId: records.churchId,
      branchId: null,
      pageKey: "home",
    });
    assert.ok(page);
    const sections = await contentRepo.listSectionsForPage(pool, page.id, {});
    const st = (sections || []).find((s) => s.sectionKey === "service_times");
    assert.ok(st);
    await contentRepo.updateSection(pool, st.id, {
      heading: "Service Times",
      bodyText: "Promoted Service · sunday 10:00",
      sectionType: "service_times",
      layoutMetadata: {
        schema: SERVICE_TIMES_SCHEMA,
        entries: [
          {
            id: "svc-demoted",
            name: "Promoted Service",
            day: "sunday",
            startTime: "10:00",
            enabled: true,
            primary: true,
            sortOrder: 10,
          },
        ],
      },
      status: "draft",
    });

    const before = await resolvePublicServiceTimesEntries(pool, {
      churchId: records.churchId,
      branchId: null,
    });
    assert.equal(
      before.entries.some((e) => e.name === "Promoted Service"),
      false,
      "draft section must not be public yet"
    );

    const published = await publishChurchWebsite(pool, {
      churchId: records.churchId,
      organizationId: records.organizationId,
      branchId: null,
      actorUserId: records.administratorUserId,
      deferServiceTimes: true,
      confirmPublish: true,
      forcePublishVersion: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
    });
    assert.equal(published.ok, true, published.message || published.reason);

    const after = await resolvePublicServiceTimesEntries(pool, {
      churchId: records.churchId,
      branchId: null,
    });
    assert.ok(
      after.entries.some((e) => e.name === "Promoted Service"),
      "BB publish must promote draft service_times sections"
    );
  });

  it("8: tenant isolation", async () => {
    requireDb();
    const churchA = await provisionChurch(pool);
    const churchB = await provisionChurch(pool);

    await saveHomeServiceTimes(pool, {
      churchId: churchA.churchId,
      branchId: null,
      organizationId: churchA.organizationId,
      actorUserId: churchA.administratorUserId,
      action: "save_draft",
      entries: [
        {
          name: "Church A Only",
          day: "sunday",
          startTime: "09:00",
          enabled: true,
          primary: true,
          sortOrder: 10,
        },
      ],
    });
    const published = await publishChurchWebsite(pool, {
      churchId: churchA.churchId,
      organizationId: churchA.organizationId,
      branchId: null,
      actorUserId: churchA.administratorUserId,
      deferServiceTimes: true,
      confirmPublish: true,
      forcePublishVersion: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
    });
    assert.equal(published.ok, true);

    const pubA = await resolvePublicServiceTimesEntries(pool, {
      churchId: churchA.churchId,
      branchId: null,
    });
    const pubB = await resolvePublicServiceTimesEntries(pool, {
      churchId: churchB.churchId,
      branchId: null,
    });
    assert.ok(pubA.entries.some((e) => e.name === "Church A Only"));
    assert.equal(
      pubB.entries.some((e) => e.name === "Church A Only"),
      false
    );
  });

  it("9: generic BB website publishing still publishes pages (regression)", async () => {
    requireDb();
    const records = await provisionChurch(pool);
    const published = await publishChurchWebsite(pool, {
      churchId: records.churchId,
      organizationId: records.organizationId,
      branchId: null,
      actorUserId: records.administratorUserId,
      deferServiceTimes: true,
      confirmPublish: true,
      forcePublishVersion: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
    });
    assert.equal(published.ok, true, published.message || published.reason);
    const home = await contentRepo.findPageByScope(pool, {
      churchId: records.churchId,
      branchId: null,
      pageKey: "home",
    });
    assert.equal(home.status, "published");
  });

  it("10: AC publish workflow smoke (untouched)", async () => {
    const acPublish = require("../src/platform/website/publishWorkflow");
    assert.equal(typeof acPublish.publish, "function");
    assert.equal(acPublish.PUBLISH_WORKFLOW.engine, "publicationOrchestrator");
  });
});
