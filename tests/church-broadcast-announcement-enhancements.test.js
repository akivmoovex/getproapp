"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const hqBroadcastsRepo = require("../src/db/pg/church/hqBroadcastsRepo");
const announcementsRepo = require("../src/db/pg/church/announcementsRepo");
const feedItemReadsRepo = require("../src/db/pg/church/feedItemReadsRepo");
const { mergeAnnouncementFeed } = require("../src/church/announcementFeed");
const { MEMBER_HQ_AUDIENCES } = require("../src/church/hqBroadcastValidation");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeApp(ctx, isChurchHost = true) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-church-broadcast-enhancements",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = isChurchHost;
    req.churchContext = ctx;
    next();
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

async function cleanup(pool, orgId) {
  await pool.query(`DELETE FROM public.church_feed_item_reads WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_broadcast_attachments WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_announcement_attachments WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_broadcast_targets WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_broadcasts WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_announcements WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test(
  "broadcast and announcement enhancements: priority, pin, confirm, search, reads, analytics",
  { skip: !isPgConfigured() },
  async (t) => {
    const pool = getPgPool();
    try {
      await pool.query("SELECT 1");
    } catch (e) {
      t.skip(`PostgreSQL unreachable (${e.code || e.message})`);
      return;
    }
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("bce");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `bce_${suffix}`,
      name: `Broadcast Enh Org ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Branch ${suffix}`,
    });
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: org.id,
      full_name: "HQ Admin",
      email: `hq_${suffix}@example.com`,
      phone: "0977555201",
      password_hash: passwordHash,
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "Branch Admin",
      email: `ba_${suffix}@example.com`,
      phone: "0977555202",
      password_hash: passwordHash,
    });
    await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_${suffix}@example.com`,
      phone: "0977555203",
      full_name: "Verified Member",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
      ministry_interest: "choir",
    });
    const memberRow = await membersRepo.findMemberByEmailOrPhoneForBranch(
      pool,
      branch.id,
      `member_${suffix}@example.com`
    );
    await membersRepo.updateMemberStatusForBranch(pool, memberRow.id, branch.id, "verified");

    const app = makeApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    });
    const hqAgent = request.agent(app);
    await hqAgent.post("/hq/login").type("form").send({
      identifier: `hq_${suffix}@example.com`,
      password: "testpass123",
    });

    const draftRes = await hqAgent.post("/hq/broadcasts").type("form").send({
      title: `Urgent Featured ${suffix}`,
      body: "Priority body with attachment",
      category: "General",
      audience: "members",
      target_scope: "all_branches",
      priority: "urgent",
      is_pinned: "1",
      is_featured: "1",
      action_url: "https://example.com/register",
      action_label: "Register now",
      _intent: "review",
    });
    assert.equal(draftRes.status, 303);
    assert.match(draftRes.headers.location || "", /\/confirm-publish$/);
    const draftMatch = /\/hq\/broadcasts\/(\d+)\/confirm-publish/.exec(draftRes.headers.location || "");
    assert.ok(draftMatch);
    const broadcastId = Number(draftMatch[1]);

    const confirmPage = await hqAgent.get(`/hq/broadcasts/${broadcastId}/confirm-publish`);
    assert.equal(confirmPage.status, 200);
    assert.match(confirmPage.text, /Estimated audience/);
    assert.match(confirmPage.text, /verified members/);

    const publishRes = await hqAgent.post(`/hq/broadcasts/${broadcastId}/publish`).type("form").send({
      _publish_token: /name="_publish_token" value="([^"]+)"/.exec(confirmPage.text)[1],
    });
    assert.equal(publishRes.status, 303);

    const normal = await hqBroadcastsRepo.createBroadcastForOrganization(pool, org.id, {
      title: `Normal Broadcast ${suffix}`,
      body: "Normal body",
      category: "General",
      audience: "members",
      target_scope: "all_branches",
      priority: "normal",
      status: "published",
      publish_at: new Date(),
      created_by_hq_admin_id: null,
    });
    assert.ok(normal);

    const listed = await hqBroadcastsRepo.listBroadcastsForOrganization(pool, org.id, {
      q: "Urgent Featured",
      page: 1,
      limit: 20,
    });
    assert.equal(listed.total, 1);
    assert.equal(listed.rows[0].priority, "urgent");
    assert.equal(listed.rows[0].is_featured, true);
    assert.equal(listed.rows[0].action_label, "Register now");

    const byPriority = await hqBroadcastsRepo.listBroadcastsForOrganization(pool, org.id, {
      priority: "urgent",
      audience: "members",
      page: 1,
      limit: 20,
    });
    assert.equal(byPriority.total, 1);
    assert.equal(byPriority.rows[0].id, broadcastId);

    const hqListPage = await hqAgent.get("/hq/broadcasts?priority=urgent&audience=members");
    assert.equal(hqListPage.status, 200);
    assert.match(hqListPage.text, /Urgent Featured/);
    assert.match(hqListPage.text, /name="priority"/);
    assert.match(hqListPage.text, /name="date_from"/);

    const feed = await hqBroadcastsRepo.listVisibleBroadcastsForBranch(pool, org.id, branch.id, {
      audiences: MEMBER_HQ_AUDIENCES,
      limit: 10,
    });
    assert.equal(feed[0].title.includes("Urgent Featured"), true);

    const estimate = await hqBroadcastsRepo.estimateBroadcastAudience(pool, org.id, {
      id: broadcastId,
      audience: "members",
      target_scope: "all_branches",
    });
    assert.equal(estimate.estimated_recipients, 1);
    assert.equal(estimate.branch_count, 1);

    const branchAgent = request.agent(app);
    await branchAgent.post("/branch/login").type("form").send({
      identifier: `ba_${suffix}@example.com`,
      password: "testpass123",
    });
    const annReview = await branchAgent.post("/branch/announcements").type("form").send({
      title: `Pinned Announcement ${suffix}`,
      body: "Branch announcement body",
      category: "Service",
      audience: "members",
      priority: "important",
      is_pinned: "1",
      action_url: "https://example.com/serve",
      action_label: "Serve",
      _intent: "review",
    });
    assert.equal(annReview.status, 303);
    assert.match(annReview.headers.location || "", /\/confirm-publish$/);
    const annMatch = /\/branch\/announcements\/(\d+)\/confirm-publish/.exec(annReview.headers.location || "");
    assert.ok(annMatch);
    const announcementId = Number(annMatch[1]);
    const annPublish = await branchAgent.post(`/branch/announcements/${announcementId}/publish`);
    assert.equal(annPublish.status, 303);

    const annSearch = await announcementsRepo.listAnnouncementsForBranch(pool, branch.id, {
      q: "Pinned Announcement",
      page: 1,
      limit: 10,
    });
    assert.equal(annSearch.total, 1);
    assert.equal(annSearch.rows[0].priority, "important");

    const memberAgent = request.agent(app);
    await memberAgent.post("/login").type("form").send({
      identifier: `member_${suffix}@example.com`,
      password: "testpass123",
    });
    const firstView = await memberAgent.get("/member/announcements");
    assert.equal(firstView.status, 200);
    assert.match(firstView.text, /Urgent Featured/);
    assert.match(firstView.text, /Register now/);
    assert.match(firstView.text, /unread|Unread/i);
    assert.match(firstView.text, /name="read_status"/);

    const filtered = await memberAgent.get("/member/announcements?source=hq&priority=urgent&q=Urgent");
    assert.equal(filtered.status, 200);
    assert.match(filtered.text, /Urgent Featured/);
    assert.match(filtered.text, /name="q" value="Urgent"/);

    const branchOnly = await memberAgent.get("/member/announcements?source=branch");
    assert.equal(branchOnly.status, 200);
    assert.doesNotMatch(branchOnly.text, /Urgent Featured/);
    assert.match(branchOnly.text, /Pinned Announcement/);

    const memberFeedRepo = require("../src/db/pg/church/memberAnnouncementFeedRepo");
    const paged = await memberFeedRepo.listVisibleMemberFeed(pool, {
      organizationId: org.id,
      branchId: branch.id,
      memberId: memberRow.id,
      audiences: MEMBER_HQ_AUDIENCES,
      page: 1,
      limit: 1,
    });
    assert.equal(paged.limit, 1);
    assert.ok(paged.total >= 2);
    assert.equal(paged.rows.length, 1);
    assert.ok(paged.totalPages >= 2);

    const seenCount = await feedItemReadsRepo.countSeenForSource(pool, org.id, "hq_broadcast", broadcastId);
    assert.equal(seenCount, 1);
    const readCountBefore = await feedItemReadsRepo.countReadsForSource(pool, org.id, "hq_broadcast", broadcastId);
    assert.equal(readCountBefore, 0);

    const detail = await memberAgent.get(`/member/announcements/hq/${broadcastId}`);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Urgent Featured/);
    assert.match(detail.text, /Register now/);
    const readCount = await feedItemReadsRepo.countReadsForSource(pool, org.id, "hq_broadcast", broadcastId);
    assert.equal(readCount, 1);

    const hqDetail = await hqAgent.get(`/hq/broadcasts/${broadcastId}`);
    assert.equal(hqDetail.status, 200);
    assert.match(hqDetail.text, /In-app delivery analytics/);
    assert.match(hqDetail.text, /Current estimated audience/);
    assert.match(hqDetail.text, /do not mean the broadcast was emailed/i);
    assert.match(hqDetail.text, /Seen/);
    assert.match(hqDetail.text, /Breakdown by branch/);
    assert.match(hqDetail.text, /Member reads|Read/);

    const { loadBroadcastDeliveryAnalytics } = require("../src/church/broadcastDeliveryAnalytics");
    const analytics = await loadBroadcastDeliveryAnalytics(pool, org.id, {
      id: broadcastId,
      audience: "members",
      target_scope: "all_branches",
      status: "published",
    });
    assert.equal(analytics.current_estimated_audience, 1);
    assert.equal(analytics.seen_count, 1);
    assert.equal(analytics.read_count, 1);
    assert.equal(analytics.unread_estimated, 0);
    assert.equal(analytics.read_percentage, 100);
    assert.equal(analytics.tracks_action_link_clicks, false);
    assert.ok(Array.isArray(analytics.by_branch));
    assert.equal(analytics.by_branch.length, 1);
    assert.equal(analytics.by_branch[0].read_count, 1);

    const branchItems = await announcementsRepo.listVisibleAnnouncementsForMember(pool, branch.id, { limit: 10 });
    const hqItems = await hqBroadcastsRepo.listVisibleBroadcastsForBranch(pool, org.id, branch.id, {
      audiences: MEMBER_HQ_AUDIENCES,
      limit: 10,
    });
    const merged = mergeAnnouncementFeed(branchItems, hqItems, 10);
    assert.equal(merged[0].is_featured || merged[0].is_pinned || merged[0].priority === "urgent", true);

    await cleanup(pool, org.id);
  }
);

test("validateBroadcastBody rejects javascript action URL", () => {
  const { validateBroadcastBody } = require("../src/church/hqBroadcastValidation");
  const result = validateBroadcastBody({
    title: "T",
    body: "B",
    category: "General",
    audience: "members",
    target_scope: "all_branches",
    action_url: "javascript:alert(1)",
    action_label: "Bad",
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /http/i);
});

test("mergeAnnouncementFeed sorts featured, pinned, and priority ahead of date", () => {
  const { mergeAnnouncementFeed } = require("../src/church/announcementFeed");
  const olderFeatured = {
    id: 1,
    title: "featured",
    publish_at: new Date("2020-01-01"),
    is_featured: true,
    is_pinned: false,
    priority: "normal",
  };
  const newerNormal = {
    id: 2,
    title: "newer",
    publish_at: new Date("2024-01-01"),
    is_featured: false,
    is_pinned: false,
    priority: "normal",
    source: "hq",
  };
  const urgentPinned = {
    id: 3,
    title: "urgent",
    publish_at: new Date("2021-01-01"),
    is_featured: false,
    is_pinned: true,
    priority: "urgent",
  };
  const merged = mergeAnnouncementFeed([olderFeatured, urgentPinned], [newerNormal], 10);
  assert.equal(merged[0].title, "featured");
  assert.equal(merged[1].title, "urgent");
  assert.equal(merged[2].title, "newer");
});

test("partitionAnnouncementFeed keeps featured items out of remaining list", () => {
  const { partitionAnnouncementFeed } = require("../src/church/announcementFeed");
  const items = [
    { id: 1, source: "branch", title: "featured", is_featured: true, is_pinned: true, priority: "normal", publish_at: new Date("2024-01-01") },
    { id: 2, source: "hq", title: "pinned", is_featured: false, is_pinned: true, priority: "important", publish_at: new Date("2024-02-01") },
    { id: 3, source: "branch", title: "normal", is_featured: false, is_pinned: false, priority: "normal", publish_at: new Date("2024-03-01") },
  ];
  const parts = partitionAnnouncementFeed(items);
  assert.equal(parts.featured.length, 1);
  assert.equal(parts.featured[0].title, "featured");
  assert.equal(parts.pinned.length, 1);
  assert.equal(parts.pinned[0].title, "pinned");
  assert.equal(parts.remaining.length, 1);
  assert.equal(parts.remaining[0].title, "normal");
  assert.equal(parts.list.length, 3);
});

test("normalizeMemberFeedOpts clamps page size and validates filters", () => {
  const { normalizeMemberFeedOpts } = require("../src/db/pg/church/memberAnnouncementFeedRepo");
  const opts = normalizeMemberFeedOpts({
    page: 0,
    limit: 999,
    source: "HQ",
    priority: "urgent",
    read_status: "unread",
    pinned_only: "1",
    q: "  hello  ",
  });
  assert.equal(opts.page, 1);
  assert.equal(opts.limit, 50);
  assert.equal(opts.source, "hq");
  assert.equal(opts.priority, "urgent");
  assert.equal(opts.read_status, "unread");
  assert.equal(opts.pinned_only, true);
  assert.equal(opts.q, "hello");
});

test("normalizeMemberFeedOpts ignores invalid enums", () => {
  const { normalizeMemberFeedOpts } = require("../src/db/pg/church/memberAnnouncementFeedRepo");
  const opts = normalizeMemberFeedOpts({
    source: "admin",
    priority: "critical",
    read_status: "maybe",
  });
  assert.equal(opts.source, "all");
  assert.equal(opts.priority, "");
  assert.equal(opts.read_status, "all");
  assert.equal(opts.limit, 20);
});

test("broadcast delivery analytics helpers compute unread and read percentage", () => {
  const { readPercentage, isPersonBasedAudience } = require("../src/church/broadcastDeliveryAnalytics");
  assert.equal(readPercentage(1, 4), 25);
  assert.equal(readPercentage(5, 4), 100);
  assert.equal(readPercentage(0, 0), null);
  assert.equal(isPersonBasedAudience("members"), true);
  assert.equal(isPersonBasedAudience("public"), false);
});


test("validateAnnouncementBody accepts priority and action link", () => {
  const { validateAnnouncementBody } = require("../src/church/announcementsEventsValidation");
  const result = validateAnnouncementBody({
    title: "Serve day",
    body: "Join us",
    category: "Service",
    audience: "members",
    priority: "important",
    is_pinned: "1",
    action_url: "https://example.com/serve",
    action_label: "Sign up",
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.priority, "important");
  assert.equal(result.data.is_pinned, true);
  assert.equal(result.data.action_label, "Sign up");
});

test("validateBroadcastBody requires action label and URL together", () => {
  const { validateBroadcastBody } = require("../src/church/hqBroadcastValidation");
  const missingLabel = validateBroadcastBody({
    title: "T",
    body: "B",
    category: "General",
    audience: "members",
    target_scope: "all_branches",
    action_url: "https://example.com",
  });
  assert.equal(missingLabel.ok, false);
  const missingUrl = validateBroadcastBody({
    title: "T",
    body: "B",
    category: "General",
    audience: "members",
    target_scope: "all_branches",
    action_label: "Go",
  });
  assert.equal(missingUrl.ok, false);
});
