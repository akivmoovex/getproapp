"use strict";

/**
 * Focused security + regression coverage for HQ broadcast / member announcement enhancements.
 */

const path = require("path");
const fs = require("fs");
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
const membersRepo = require("../src/db/pg/church/membersRepo");
const hqBroadcastsRepo = require("../src/db/pg/church/hqBroadcastsRepo");
const feedItemReadsRepo = require("../src/db/pg/church/feedItemReadsRepo");
const broadcastAttachmentsRepo = require("../src/db/pg/church/broadcastAttachmentsRepo");
const memberAnnouncementFeedRepo = require("../src/db/pg/church/memberAnnouncementFeedRepo");
const { isActivelyFeatured } = require("../src/church/announcementFeed");
const { validateBroadcastBody } = require("../src/church/hqBroadcastValidation");
const { MEMBER_HQ_AUDIENCES } = require("../src/church/hqBroadcastValidation");
const {
  absolutePathForStoredFilename,
  UPLOAD_ROOT,
} = require("../src/church/hqBroadcastUploads");
const { loadBroadcastDeliveryAnalytics } = require("../src/church/broadcastDeliveryAnalytics");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { churchPgSkipIfUnconfigured, requireChurchPgOrSkip } = require("./helpers/churchPgTest");
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
      secret: "test-church-broadcast-security",
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

async function cleanup(pool, orgIds) {
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_feed_item_reads WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_hq_broadcast_attachments WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_hq_broadcast_targets WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_hq_broadcasts WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("default priority is normal; invalid priorities rejected", () => {
  const ok = validateBroadcastBody({
    title: "T",
    body: "B",
    category: "General",
    audience: "members",
    target_scope: "all_branches",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.priority, "normal");

  const bad = validateBroadcastBody({
    title: "T",
    body: "B",
    category: "General",
    audience: "members",
    target_scope: "all_branches",
    priority: "critical",
  });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /priority/i);
});

test("expired featured status is not treated as active", () => {
  assert.equal(
    isActivelyFeatured({
      is_featured: true,
      featured_until: new Date(Date.now() - 60_000),
    }),
    false
  );
  assert.equal(
    isActivelyFeatured({
      is_featured: true,
      featured_until: new Date(Date.now() + 60_000),
    }),
    true
  );
  assert.equal(isActivelyFeatured({ is_featured: true, featured_until: null }), true);
  assert.equal(isActivelyFeatured({ is_featured: false }), false);
});

test("action links require both label and URL; unsafe protocols rejected", () => {
  assert.equal(
    validateBroadcastBody({
      title: "T",
      body: "B",
      category: "General",
      audience: "members",
      target_scope: "all_branches",
      action_url: "https://example.com",
    }).ok,
    false
  );
  assert.equal(
    validateBroadcastBody({
      title: "T",
      body: "B",
      category: "General",
      audience: "members",
      target_scope: "all_branches",
      action_label: "Go",
    }).ok,
    false
  );
  assert.equal(
    validateBroadcastBody({
      title: "T",
      body: "B",
      category: "General",
      audience: "members",
      target_scope: "all_branches",
      action_url: "javascript:alert(1)",
      action_label: "Bad",
    }).ok,
    false
  );
  assert.equal(
    validateBroadcastBody({
      title: "T",
      body: "B",
      category: "General",
      audience: "members",
      target_scope: "all_branches",
      action_url: "https://example.com/ok",
      action_label: "Open",
    }).ok,
    true
  );
});

test("uploaded stored filenames cannot path-traverse outside upload root", () => {
  assert.equal(absolutePathForStoredFilename("../etc/passwd"), null);
  assert.equal(absolutePathForStoredFilename("..\\etc\\passwd"), null);
  assert.equal(absolutePathForStoredFilename("12/../../../etc/passwd"), null);
  const safeRel = "12/34/file.pdf";
  const abs = absolutePathForStoredFilename(safeRel);
  assert.ok(abs);
  assert.ok(abs.startsWith(path.resolve(UPLOAD_ROOT) + path.sep));
  // Absolute-looking paths are stripped to relative under the upload root (still confined).
  const confined = absolutePathForStoredFilename("/12/34/file.pdf");
  assert.ok(confined);
  assert.ok(confined.startsWith(path.resolve(UPLOAD_ROOT) + path.sep));
});

test("member feed search opts clamp page size and ignore unsafe enums", () => {
  const opts = memberAnnouncementFeedRepo.normalizeMemberFeedOpts({
    page: -3,
    limit: 500,
    source: "evil",
    priority: "nope",
    read_status: "all-of-them",
    q: "x".repeat(300),
  });
  assert.equal(opts.page, 1);
  assert.equal(opts.limit, 50);
  assert.equal(opts.source, "all");
  assert.equal(opts.priority, "");
  assert.equal(opts.read_status, "all");
  assert.equal(opts.q.length, 200);
});

test(
  "broadcast security: authz, reads, estimates, analytics, publish token, archive",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("bcs");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `bcs_a_${suffix}`,
      name: `Sec Org A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `bcs_b_${suffix}`,
      name: `Sec Org B ${suffix}`,
    });
    const branchA1 = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `A1 ${suffix}`,
    });
    const branchA2 = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "north",
      name: `A2 ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `B ${suffix}`,
    });

    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgA.id,
      full_name: "HQ A",
      email: `hq_a_${suffix}@example.com`,
      phone: "0977000001",
      password_hash: passwordHash,
    });
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgB.id,
      full_name: "HQ B",
      email: `hq_b_${suffix}@example.com`,
      phone: "0977000002",
      password_hash: passwordHash,
    });

    await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA1.id,
      platform_tenant_id: TENANT_ZM,
      email: `m1_${suffix}@example.com`,
      phone: "0977000003",
      full_name: "Member One",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
      ministry_interest: "choir",
    });
    await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA1.id,
      platform_tenant_id: TENANT_ZM,
      email: `m2_${suffix}@example.com`,
      phone: "0977000004",
      full_name: "Member Two",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
      ministry_interest: "ushering",
    });
    const m1 = await membersRepo.findMemberByEmailOrPhoneForBranch(pool, branchA1.id, `m1_${suffix}@example.com`);
    const m2 = await membersRepo.findMemberByEmailOrPhoneForBranch(pool, branchA1.id, `m2_${suffix}@example.com`);
    await membersRepo.updateMemberStatusForBranch(pool, m1.id, branchA1.id, "verified");
    await membersRepo.updateMemberStatusForBranch(pool, m2.id, branchA1.id, "verified");

    const appA = makeApp({ kind: "branch", orgSlug: orgA.slug, organization: orgA, branch: branchA1 });
    const appB = makeApp({ kind: "branch", orgSlug: orgB.slug, organization: orgB, branch: branchB });
    const hqA = request.agent(appA);
    await hqA.post("/hq/login").type("form").send({
      identifier: `hq_a_${suffix}@example.com`,
      password: "testpass123",
    });

    // Draft save still works; default priority normal.
    const draftRes = await hqA.post("/hq/broadcasts").type("form").send({
      title: `Draft ${suffix}`,
      body: "Draft body",
      category: "General",
      audience: "members",
      target_scope: "all_branches",
      is_pinned: "1",
      is_featured: "1",
      _intent: "draft",
    });
    assert.equal(draftRes.status, 303);
    const draftId = Number(/\/hq\/broadcasts\/(\d+)/.exec(draftRes.headers.location || "")[1]);
    const draft = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, draftId, orgA.id);
    assert.equal(draft.status, "draft");
    assert.equal(draft.priority || "normal", "normal");
    assert.equal(Boolean(draft.is_pinned), true);
    assert.equal(Boolean(draft.is_featured), true);

    // Existing-style list still renders after migrations.
    const listPage = await hqA.get("/hq/broadcasts");
    assert.equal(listPage.status, 200);
    assert.match(listPage.text, /Draft/);

    // Publish confirmation + one-time token.
    const review = await hqA.post(`/hq/broadcasts/${draftId}`).type("form").send({
      title: `Published ${suffix}`,
      body: "Live body",
      category: "General",
      audience: "members",
      target_scope: "selected_branches",
      branch_ids: String(branchA1.id),
      priority: "important",
      is_pinned: "1",
      is_featured: "1",
      _intent: "review",
    });
    assert.equal(review.status, 303);
    assert.match(review.headers.location || "", /confirm-publish/);
    const broadcastId = draftId;

    const confirmPage = await hqA.get(`/hq/broadcasts/${broadcastId}/confirm-publish`);
    assert.equal(confirmPage.status, 200);
    const token = /name="_publish_token" value="([^"]+)"/.exec(confirmPage.text)[1];
    const publish1 = await hqA.post(`/hq/broadcasts/${broadcastId}/publish`).type("form").send({
      _publish_token: token,
    });
    assert.equal(publish1.status, 303);
    const publish2 = await hqA.post(`/hq/broadcasts/${broadcastId}/publish`).type("form").send({
      _publish_token: token,
    });
    assert.equal(publish2.status, 400);
    assert.match(publish2.text, /already used|expired|Review again/i);

    const published = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, broadcastId, orgA.id);
    assert.equal(published.status, "published");
    assert.equal(published.priority, "important");

    // Estimated audience respects selected branches and does not double-count.
    const estimateSelected = await hqBroadcastsRepo.estimateBroadcastAudience(pool, orgA.id, published);
    assert.equal(estimateSelected.branch_count, 1);
    assert.equal(estimateSelected.estimated_recipients, 2);
    const estimateAll = await hqBroadcastsRepo.estimateBroadcastAudience(pool, orgA.id, {
      ...published,
      target_scope: "all_branches",
    });
    assert.equal(estimateAll.branch_count, 2);
    assert.equal(estimateAll.estimated_recipients, 2);

    // Attachment row + authz.
    const storedRel = `${orgA.id}/${broadcastId}/sec_${suffix}.pdf`;
    const absDir = path.join(UPLOAD_ROOT, String(orgA.id), String(broadcastId));
    fs.mkdirSync(absDir, { recursive: true });
    const absFile = path.join(absDir, `sec_${suffix}.pdf`);
    fs.writeFileSync(absFile, Buffer.from("%PDF-1.4 test"));
    const attachment = await broadcastAttachmentsRepo.createBroadcastAttachment(pool, {
      organization_id: orgA.id,
      broadcast_id: broadcastId,
      original_filename: "notes.pdf",
      stored_filename: storedRel,
      mime_type: "application/pdf",
      file_size: 12,
      created_by_hq_admin_id: null,
    });

    const memberAgent = request.agent(appA);
    await memberAgent.post("/login").type("form").send({
      identifier: `m1_${suffix}@example.com`,
      password: "testpass123",
    });

    // Member can open allowed detail without writing a read receipt, then mark read explicitly.
    const detailOk = await memberAgent.get(`/member/announcements/hq/${broadcastId}`);
    assert.equal(detailOk.status, 200);
    assert.match(detailOk.text, /data-member-mark-read-form|Mark as read/);
    const readsAfterGet = await feedItemReadsRepo.countReadsForSource(pool, orgA.id, "hq_broadcast", broadcastId);
    assert.equal(readsAfterGet, 0);
    const csrf =
      (detailOk.text.match(/name="_csrf"\s+value="([^"]+)"/) ||
        detailOk.text.match(/name='_csrf'\s+value='([^']+)'/) ||
        [])[1] || "";
    assert.ok(csrf);
    const markRead = await memberAgent
      .post(`/member/announcements/hq/${broadcastId}/read`)
      .type("form")
      .send({ _csrf: csrf, return_to: `/member/announcements/hq/${broadcastId}` });
    assert.equal(markRead.status, 303);
    const dlOk = await memberAgent.get(
      `/member/announcements/hq/${broadcastId}/attachments/${attachment.id}/download`
    );
    assert.equal(dlOk.status, 200);

    // Unauthorized / unauthenticated attachment access blocked.
    const anonDl = await request(appA).get(
      `/member/announcements/hq/${broadcastId}/attachments/${attachment.id}/download`
    );
    assert.ok([302, 303, 401, 403, 404].includes(anonDl.status));

    // Cross-tenant HQ cannot see broadcast or attachment.
    const hqB = request.agent(appB);
    await hqB.post("/hq/login").type("form").send({
      identifier: `hq_b_${suffix}@example.com`,
      password: "testpass123",
    });
    const crossDetail = await hqB.get(`/hq/broadcasts/${broadcastId}`);
    assert.equal(crossDetail.status, 404);
    const crossDl = await hqB.get(`/hq/broadcasts/${broadcastId}/attachments/${attachment.id}/download`);
    assert.equal(crossDl.status, 404);

    // Member cannot open inaccessible HQ broadcast (other org id).
    const foreign = await hqBroadcastsRepo.createBroadcastForOrganization(pool, orgB.id, {
      title: `Foreign ${suffix}`,
      body: "secret",
      category: "General",
      audience: "members",
      target_scope: "all_branches",
      status: "published",
      publish_at: new Date(),
      created_by_hq_admin_id: null,
    });
    const blocked = await memberAgent.get(`/member/announcements/hq/${foreign.id}`);
    assert.equal(blocked.status, 404);
    const readBefore = await feedItemReadsRepo.countReadsForSource(pool, orgB.id, "hq_broadcast", foreign.id);
    assert.equal(readBefore, 0);

    // Duplicate mark-read does not create duplicate receipts.
    const detailAgain = await memberAgent.get(`/member/announcements/hq/${broadcastId}`);
    assert.equal(detailAgain.status, 200);
    assert.match(detailAgain.text, /aria-label="Read"|data-announcement-read="1"/);
    assert.doesNotMatch(detailAgain.text, /data-member-mark-read-form/);
    const csrf2 =
      (detailOk.text.match(/name="_csrf"\s+value="([^"]+)"/) ||
        detailOk.text.match(/name='_csrf'\s+value='([^']+)'/) ||
        [])[1] || csrf;
    await memberAgent
      .post(`/member/announcements/hq/${broadcastId}/read`)
      .type("form")
      .send({ _csrf: csrf2, return_to: `/member/announcements/hq/${broadcastId}` });
    const receiptCount = await pool.query(
      `SELECT COUNT(*)::int AS c FROM public.church_feed_item_reads
       WHERE member_id = $1 AND source_type = 'hq_broadcast' AND source_id = $2`,
      [m1.id, broadcastId]
    );
    assert.equal(receiptCount.rows[0].c, 1);

    // Unread filtering works (m2 has not read).
    const unreadFeed = await memberAnnouncementFeedRepo.listVisibleMemberFeed(pool, {
      organizationId: orgA.id,
      branchId: branchA1.id,
      memberId: m2.id,
      audiences: MEMBER_HQ_AUDIENCES,
      read_status: "unread",
      q: `Published ${suffix}`,
      page: 1,
      limit: 20,
    });
    assert.equal(unreadFeed.total, 1);
    const readFeed = await memberAnnouncementFeedRepo.listVisibleMemberFeed(pool, {
      organizationId: orgA.id,
      branchId: branchA1.id,
      memberId: m1.id,
      audiences: MEMBER_HQ_AUDIENCES,
      read_status: "read",
      q: `Published ${suffix}`,
      page: 1,
      limit: 20,
    });
    assert.equal(readFeed.total, 1);

    // Server-side search + pagination preserve tenant/audience (no foreign title).
    const searched = await memberAnnouncementFeedRepo.listVisibleMemberFeed(pool, {
      organizationId: orgA.id,
      branchId: branchA1.id,
      memberId: m1.id,
      audiences: MEMBER_HQ_AUDIENCES,
      q: "Foreign",
      page: 1,
      limit: 20,
    });
    assert.equal(searched.total, 0);
    const paged = await memberAnnouncementFeedRepo.listVisibleMemberFeed(pool, {
      organizationId: orgA.id,
      branchId: branchA1.id,
      memberId: m1.id,
      audiences: MEMBER_HQ_AUDIENCES,
      page: 1,
      limit: 1,
    });
    assert.equal(paged.rows.length, 1);
    assert.ok(paged.totalPages >= 1);

    // Analytics totals consistent; no member names exposed.
    const analytics = await loadBroadcastDeliveryAnalytics(pool, orgA.id, published, {
      accessibleBranches: [branchA1, branchA2],
    });
    assert.equal(analytics.current_estimated_audience, 2);
    assert.equal(analytics.seen_count, 1);
    assert.equal(analytics.read_count, 1);
    assert.equal(analytics.unread_estimated, 1);
    assert.equal(analytics.read_percentage, 50);
    assert.equal(analytics.attachment_download_count, 1);
    assert.equal(analytics.by_branch.length, 1);
    assert.equal(analytics.by_branch[0].branch_id, branchA1.id);
    const detailHtml = await hqA.get(`/hq/broadcasts/${broadcastId}`);
    assert.equal(detailHtml.status, 200);
    assert.match(detailHtml.text, /In-app delivery analytics/);
    assert.match(detailHtml.text, /Current estimated audience/);
    assert.doesNotMatch(detailHtml.text, /Member One/);
    assert.doesNotMatch(detailHtml.text, /Member Two/);

    // Archive behaviour.
    const archive = await hqA.post(`/hq/broadcasts/${broadcastId}/archive`);
    assert.equal(archive.status, 303);
    const archived = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, broadcastId, orgA.id);
    assert.equal(archived.status, "archived");
    const memberAfterArchive = await memberAgent.get("/member/announcements");
    assert.equal(memberAfterArchive.status, 200);
    assert.doesNotMatch(memberAfterArchive.text, new RegExp(`Published ${suffix}`));

    try {
      fs.unlinkSync(absFile);
    } catch {
      /* ignore */
    }
    await cleanup(pool, [orgA.id, orgB.id]);
  }
);
