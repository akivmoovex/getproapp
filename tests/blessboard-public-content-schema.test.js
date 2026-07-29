"use strict";

/**
 * BlessBoard V5 public website content schema + service rules.
 * No UI routes; no legacy public.* tables; no demo content seeding.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const {
  provisionEmptyPublicPages,
  updatePublicPage,
  createPageSection,
  updatePageSection,
  createLeader,
  updateLeader,
  createEvent,
  createMinistry,
  PUBLIC_PAGE_KEYS,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  getPublishedPage,
  listPublishedLeaders,
  listPublishedEvents,
} = require("../src/blessboard/services/publicContentReadService");

const EXPECTED_TABLES = [
  "announcement_attachments",
  "announcement_audiences",
  "announcement_reads",
  "announcements",
  "attendance_entries",
  "attendance_events",
  "branch_settings",
  "branches",
  "church_settings",
  "churches",
  "contact_channels",
  "event_registrations",
  "events",
  "form_submissions",
  "forms",
  "giving_categories",
  "giving_entries",
  "giving_methods",
  "leaders",
  "media_assets",
  "member_branch_memberships",
  "member_notification_preferences",
  "member_notifications",
  "member_registrations",
  "member_request_status_history",
  "member_requests",
  "members",
  "message_audiences",
  "message_delivery_attempts",
  "messages",
  "ministries",
  "ministry_memberships",
  "organization_growth_trial_offers",
  "organization_onboarding",
  "organization_support_contacts",
  "page_sections",
  "platform_church_registration_applications",
  "public_pages",
  "registration_application_communications",
  "registration_duplicate_matches",
  "registration_email_verification_tokens",
  "registration_phone_verification_attempts",
  "resources",
  "sermons",
  "user_invitations",
  "user_roles",
  "users",
  "website_approval_settings",
  "website_audit_events",
  "website_change_submission_events",
  "website_change_submissions",
  "website_inline_field_drafts",
  "website_publication_versions",
  "website_structured_drafts",
];

async function seedChurch(pool, key) {
  const org = await provisionPlatformTenant(pool, {
    organizationKey: key,
    displayName: `Org ${key}`,
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: key,
    hostname: `${key}.blessboard.test`,
    domainType: "canonical",
    deploymentCode: "blessboard-org-v5",
    isPrimary: true,
  });
  assert.equal(org.ok, true, org.message);
  const church = await provisionBlessBoardChurch(pool, {
    organizationKey: key,
    churchKey: key,
    displayName: `Church ${key}`,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "HQ",
  });
  assert.equal(church.ok, true, church.message);
  return {
    organization: org.records.organization,
    church: church.records.church,
    branch: church.records.hqBranch,
  };
}

describe("blessboard public content schema", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let fixture;

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      fixture = await seedChurch(pool, "pub-content-a");
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("creates approved public content tables only (no legacy public CMS)", async () => {
    requireDb();
    const tables = await pool.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'blessboard' AND table_type = 'BASE TABLE'
        ORDER BY table_name`
    );
    assert.deepEqual(
      tables.rows.map((r) => r.table_name),
      EXPECTED_TABLES
    );

    const legacy = await pool.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('tenants', 'session', 'pages', 'page_sections', 'content')`
    );
    assert.equal(legacy.rowCount, 0);
  });

  it("provisions empty draft pages with canonical empty service_times section", async () => {
    requireDb();
    const churchId = fixture.church.id;
    const first = await provisionEmptyPublicPages(pool, { churchId });
    assert.equal(first.ok, true);
    assert.equal(first.createdCount, PUBLIC_PAGE_KEYS.length);
    assert.equal(first.pages.length, PUBLIC_PAGE_KEYS.length);
    assert.ok(first.pages.every((p) => p.status === "draft"));
    assert.deepEqual(
      first.pages.map((p) => p.pageKey).sort(),
      [...PUBLIC_PAGE_KEYS].sort()
    );

    const second = await provisionEmptyPublicPages(pool, { churchId });
    assert.equal(second.ok, true);
    assert.equal(second.createdCount, 0);

    const sectionCount = await pool.query(
      `SELECT COUNT(*)::int AS n,
              COUNT(*) FILTER (
                WHERE s.section_key = 'service_times'
                  AND NULLIF(TRIM(COALESCE(s.body_text, '')), '') IS NULL
              )::int AS empty_service_times
         FROM blessboard.page_sections s
         JOIN blessboard.public_pages p ON p.id = s.page_id
        WHERE p.church_id = $1`,
      [churchId]
    );
    assert.equal(sectionCount.rows[0].n, 1);
    assert.equal(sectionCount.rows[0].empty_service_times, 1);

    const readDraft = await getPublishedPage(pool, { churchId, pageKey: "home" });
    assert.equal(readDraft.ok, false);
    assert.equal(readDraft.status, "not_found");
  });

  it("enforces page_key immutability and unique church/branch scope", async () => {
    requireDb();
    const churchId = fixture.church.id;
    const page = (await provisionEmptyPublicPages(pool, { churchId })).pages.find(
      (p) => p.pageKey === "about"
    );
    await assert.rejects(
      () => pool.query(`UPDATE blessboard.public_pages SET page_key = 'renamed' WHERE id = $1`, [page.id]),
      /immutable/i
    );

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.public_pages (church_id, page_key, title, status)
           VALUES ($1, 'about', 'Dup', 'draft')`,
          [churchId]
        ),
      /unique|duplicate/i
    );

    const branchPages = await provisionEmptyPublicPages(pool, {
      churchId,
      branchId: fixture.branch.id,
    });
    assert.equal(branchPages.ok, true);
    assert.equal(branchPages.createdCount, PUBLIC_PAGE_KEYS.length);
  });

  it("rejects foreign branch ownership and inactive publish", async () => {
    requireDb();
    const other = await seedChurch(pool, "pub-content-b");
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.leaders
             (church_id, branch_id, display_name, role_title, status)
           VALUES ($1, $2, 'X', 'Pastor', 'draft')`,
          [fixture.church.id, other.branch.id]
        ),
      /belong|integrity/i
    );

    await pool.query(`UPDATE blessboard.churches SET status = 'suspended' WHERE id = $1`, [
      fixture.church.id,
    ]);
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.leaders
             (church_id, display_name, role_title, status)
           VALUES ($1, 'Y', 'Pastor', 'published')`,
          [fixture.church.id]
        ),
      /active church/i
    );
    await pool.query(`UPDATE blessboard.churches SET status = 'active' WHERE id = $1`, [
      fixture.church.id,
    ]);
  });

  it("publishes pages/sections for read service; drafts stay hidden", async () => {
    requireDb();
    const churchId = fixture.church.id;
    const pages = await provisionEmptyPublicPages(pool, { churchId });
    const home = pages.pages.find((p) => p.pageKey === "home");

    const drafted = await createPageSection(pool, {
      pageId: home.id,
      sectionKey: "hero",
      sectionType: "hero",
      heading: "Welcome",
      bodyText: "Plain text body",
      sortOrder: 2,
      status: "draft",
    });
    assert.equal(drafted.ok, true);

    const publishedSection = await createPageSection(pool, {
      pageId: home.id,
      sectionKey: "intro",
      sectionType: "text",
      heading: "Intro",
      bodyText: "Published copy",
      sortOrder: 1,
      status: "draft",
    });
    assert.equal(publishedSection.ok, true);

    const pubPage = await updatePublicPage(pool, home.id, { status: "published" });
    assert.equal(pubPage.ok, true);
    assert.equal(pubPage.page.status, "published");
    assert.ok(pubPage.page.publishedAt);

    await updatePageSection(pool, publishedSection.section.id, { status: "published" });

    const read = await getPublishedPage(pool, { churchId, pageKey: "home" });
    assert.equal(read.ok, true);
    assert.equal(read.sections.length, 1);
    assert.equal(read.sections[0].sectionKey, "intro");
    assert.equal(read.sections[0].sortOrder, 1);
  });

  it("orders leaders by sort_order and hides drafts from read service", async () => {
    requireDb();
    const churchId = fixture.church.id;
    const a = await createLeader(pool, {
      churchId,
      displayName: "Second",
      roleTitle: "Elder",
      sortOrder: 20,
      status: "published",
    });
    const b = await createLeader(pool, {
      churchId,
      displayName: "First",
      roleTitle: "Pastor",
      sortOrder: 10,
      status: "published",
    });
    const draft = await createLeader(pool, {
      churchId,
      displayName: "Hidden",
      roleTitle: "Intern",
      sortOrder: 5,
      status: "draft",
    });
    assert.equal(a.ok && b.ok && draft.ok, true);

    const published = await listPublishedLeaders(pool, { churchId });
    assert.equal(published.ok, true);
    const names = published.items.map((i) => i.displayName);
    assert.ok(names.includes("First"));
    assert.ok(names.includes("Second"));
    assert.ok(!names.includes("Hidden"));
    const firstIdx = names.indexOf("First");
    const secondIdx = names.indexOf("Second");
    assert.ok(firstIdx < secondIdx);
  });

  it("blocks archive reactivation and section_key mutation", async () => {
    requireDb();
    const churchId = fixture.church.id;
    const leader = await createLeader(pool, {
      churchId,
      displayName: "Archive Me",
      roleTitle: "Deacon",
      status: "draft",
    });
    const archived = await updateLeader(pool, leader.item.id, { status: "archived" });
    assert.equal(archived.ok, true);
    const revive = await updateLeader(pool, leader.item.id, { status: "draft" });
    assert.equal(revive.ok, false);
    assert.equal(revive.status, "constraint");

    const pages = await provisionEmptyPublicPages(pool, { churchId });
    const about = pages.pages.find((p) => p.pageKey === "about");
    const section = await createPageSection(pool, {
      pageId: about.id,
      sectionKey: "mission",
      sectionType: "text",
      bodyText: "Mission",
    });
    await assert.rejects(
      () =>
        pool.query(`UPDATE blessboard.page_sections SET section_key = 'other' WHERE id = $1`, [
          section.section.id,
        ]),
      /immutable/i
    );
  });

  it("rejects HTML-looking body text in admin service", async () => {
    requireDb();
    const churchId = fixture.church.id;
    const pages = await provisionEmptyPublicPages(pool, { churchId });
    const contact = pages.pages.find((p) => p.pageKey === "contact");
    const bad = await createPageSection(pool, {
      pageId: contact.id,
      sectionKey: "html",
      sectionType: "text",
      bodyText: "<script>alert(1)</script>",
    });
    assert.equal(bad.ok, false);
    assert.match(bad.reason, /html/i);
  });

  it("supports event statuses and inactive branch publish block", async () => {
    requireDb();
    const churchId = fixture.church.id;
    const branchId = fixture.branch.id;
    const event = await createEvent(pool, {
      churchId,
      branchId,
      title: "Sunday Service",
      startsAt: new Date("2026-08-01T09:00:00Z"),
      timezone: "Africa/Lusaka",
      status: "draft",
    });
    assert.equal(event.ok, true);

    await pool.query(`UPDATE blessboard.branches SET status = 'inactive' WHERE id = $1`, [branchId]);
    await assert.rejects(
      () =>
        pool.query(`UPDATE blessboard.events SET status = 'published' WHERE id = $1`, [event.item.id]),
      /active branch/i
    );
    await pool.query(`UPDATE blessboard.branches SET status = 'active' WHERE id = $1`, [branchId]);

    const ministry = await createMinistry(pool, {
      churchId,
      name: "Youth",
      summary: "Youth ministry",
      status: "published",
    });
    assert.equal(ministry.ok, true);

    const events = await listPublishedEvents(pool, { churchId, branchId });
    assert.equal(events.ok, true);
    assert.equal(events.items.length, 0);
  });

  it("does not invent demo leaders/ministries/events on provision", async () => {
    requireDb();
    const churchId = fixture.church.id;
    const counts = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM blessboard.leaders WHERE church_id = $1 AND display_name LIKE 'Demo%') AS leaders,
         (SELECT COUNT(*)::int FROM blessboard.ministries WHERE church_id = $1 AND name LIKE 'Demo%') AS ministries,
         (SELECT COUNT(*)::int FROM blessboard.events WHERE church_id = $1 AND title LIKE 'Demo%') AS events`,
      [churchId]
    );
    assert.equal(counts.rows[0].leaders, 0);
    assert.equal(counts.rows[0].ministries, 0);
    assert.equal(counts.rows[0].events, 0);
  });
});
