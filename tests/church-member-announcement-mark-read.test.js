"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const announcementsRepo = require("../src/db/pg/church/announcementsRepo");
const hqBroadcastsRepo = require("../src/db/pg/church/hqBroadcastsRepo");
const feedItemReadsRepo = require("../src/db/pg/church/feedItemReadsRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { churchPgSkipIfUnconfigured, requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const { CSRF_FIELD, TOKEN_PREFIX } = require("../src/church/churchSessionCsrf");
const { loadBroadcastDeliveryAnalytics } = require("../src/church/broadcastDeliveryAnalytics");
const { MEMBER_HQ_AUDIENCES } = require("../src/church/hqBroadcastValidation");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractCsrf(html) {
  const text = String(html || "");
  const m =
    text.match(new RegExp(`name="${CSRF_FIELD}"\\s+value="([^"]+)"`)) ||
    text.match(new RegExp(`name='${CSRF_FIELD}'\\s+value='([^']+)'`));
  return m ? m[1] : null;
}

function makeApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "member-mark-read-test",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    next();
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

async function cleanup(pool, branchIds, orgIds) {
  for (const branchId of branchIds) {
    await pool.query(`DELETE FROM public.church_feed_item_reads WHERE branch_id = $1`, [branchId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_announcement_attachments WHERE branch_id = $1`, [branchId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_announcements WHERE branch_id = $1`, [branchId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_hq_broadcast_attachments WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_hq_broadcasts WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_feed_item_reads WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("member announcement GET handlers do not write feed read receipts", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/routes/church/memberPortal.js"), "utf8");
  const listStart = src.indexOf('router.get("/member/announcements"');
  const detailStart = src.indexOf('router.get(\n    "/member/announcements/:source/:announcementId"');
  const detailStartAlt = src.indexOf('"/member/announcements/:source/:announcementId"');
  const downloadStart = src.indexOf("attachments/:attachmentId/download");
  const postRead = src.indexOf('"/member/announcements/:source/:announcementId/read"');
  assert.ok(listStart > 0);
  assert.ok(detailStartAlt > 0);
  assert.ok(downloadStart > 0);
  assert.ok(postRead > 0);

  const listChunk = src.slice(listStart, detailStartAlt);
  assert.doesNotMatch(listChunk, /markFeedItem(Read|Seen|sSeen|sRead)/);

  const detailChunk = src.slice(detailStartAlt, postRead);
  // GET detail ends before POST /read
  const getDetailOnly = detailChunk.slice(0, detailChunk.indexOf("router.post"));
  assert.doesNotMatch(getDetailOnly, /markFeedItem(Read|Seen)/);
  assert.match(getDetailOnly, /listReceiptsForMember/);

  const downloadChunk = src.slice(downloadStart, downloadStart + 1800);
  assert.doesNotMatch(downloadChunk, /markFeedItem(Read|Seen)/);

  const postChunk = src.slice(postRead, postRead + 1200);
  assert.match(postChunk, /requireChurchSessionCsrf/);
  assert.match(postChunk, /markFeedItemRead/);
});

test("mark-read route remains registered and CSRF inventory stays gap-free", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/routes/church/memberPortal.js"), "utf8");
  assert.match(src, /\/member\/announcements\/:source\/:announcementId\/read/);
  assert.match(src, /requireChurchSessionCsrf/);
  const inventory = fs.readFileSync(
    path.join(__dirname, "church-mutation-csrf-inventory.test.js"),
    "utf8"
  );
  assert.match(inventory, /unexplained CSRF gaps/);
});

test("anonymous mark-read is blocked", async () => {
  const app = makeApp({
    kind: "branch",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).post("/member/announcements/hq/1/read").type("form").send({});
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/login");
});

test(
  "explicit mark-read POST is CSRF-protected and GET routes do not mutate receipts",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const prev = process.env.GETPRO_REQUIRE_CHURCH_CSRF;
    process.env.GETPRO_REQUIRE_CHURCH_CSRF = "1";
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) {
      if (prev === undefined) delete process.env.GETPRO_REQUIRE_CHURCH_CSRF;
      else process.env.GETPRO_REQUIRE_CHURCH_CSRF = prev;
      return;
    }

    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("mread");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `mread_a_${suffix}`.replace(/[^a-z0-9_]/g, "").slice(0, 40),
      name: `Mark Read A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `mread_b_${suffix}`.replace(/[^a-z0-9_]/g, "").slice(0, 40),
      name: `Mark Read B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `Mark Read Branch A ${suffix}`,
    });
    const branchA2 = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "east",
      name: `Mark Read Branch A2 ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `Mark Read Branch B ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    const member = await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `mread_${suffix}@example.com`,
      phone: "0977001001",
      full_name: "Mark Read Member",
      password_hash: passwordHash,
    });
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branchA.id, "verified");

    const hq = await hqBroadcastsRepo.createBroadcastForOrganization(pool, orgA.id, {
      title: `HQ Read ${suffix}`,
      body: "HQ body",
      category: "General",
      audience: "members",
      target_scope: "all_branches",
      status: "published",
      publish_at: new Date(),
      created_by_hq_admin_id: null,
    });
    const branchAnn = await announcementsRepo.createAnnouncementForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      title: `Branch Read ${suffix}`,
      body: "Branch body",
      category: "general",
      audience: "members",
      priority: "normal",
      status: "published",
      publish_at: new Date(),
      created_by_admin_id: null,
    });
    const otherBranchAnn = await announcementsRepo.createAnnouncementForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA2.id,
      title: `Other Branch ${suffix}`,
      body: "secret",
      category: "general",
      audience: "members",
      priority: "normal",
      status: "published",
      publish_at: new Date(),
      created_by_admin_id: null,
    });
    const otherOrgHq = await hqBroadcastsRepo.createBroadcastForOrganization(pool, orgB.id, {
      title: `Other Org ${suffix}`,
      body: "secret",
      category: "General",
      audience: "members",
      target_scope: "all_branches",
      status: "published",
      publish_at: new Date(),
      created_by_hq_admin_id: null,
    });

    try {
      const app = makeApp({
        kind: "branch",
        orgSlug: orgA.slug,
        organization: orgA,
        branch: branchA,
      });
      const agent = request.agent(app);
      await agent.post("/login").type("form").send({
        identifier: `mread_${suffix}@example.com`,
        password: "testpass123",
      });

      const countReceipts = async (sourceType, sourceId) => {
        const r = await pool.query(
          `SELECT COUNT(*)::int AS c FROM public.church_feed_item_reads
           WHERE member_id = $1 AND source_type = $2 AND source_id = $3`,
          [member.id, sourceType, sourceId]
        );
        return r.rows[0].c;
      };

      const list = await agent.get("/member/announcements");
      assert.equal(list.status, 200);
      assert.equal(await countReceipts("hq_broadcast", hq.id), 0);
      assert.equal(await countReceipts("announcement", branchAnn.id), 0);

      const detail = await agent.get(`/member/announcements/hq/${hq.id}`);
      assert.equal(detail.status, 200);
      assert.match(detail.text, /data-member-mark-read-form/);
      assert.match(detail.text, /Mark as read/);
      assert.equal(await countReceipts("hq_broadcast", hq.id), 0);

      const csrf = extractCsrf(detail.text);
      assert.ok(csrf);

      const missing = await agent
        .post(`/member/announcements/hq/${hq.id}/read`)
        .type("form")
        .send({ return_to: `/member/announcements/hq/${hq.id}` });
      assert.equal(missing.status, 403);
      assert.equal(await countReceipts("hq_broadcast", hq.id), 0);

      const invalid = await agent
        .post(`/member/announcements/hq/${hq.id}/read`)
        .type("form")
        .send({
          return_to: `/member/announcements/hq/${hq.id}`,
          [CSRF_FIELD]: `${TOKEN_PREFIX}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`,
        });
      assert.equal(invalid.status, 403);
      assert.equal(await countReceipts("hq_broadcast", hq.id), 0);

      // Preserve first_seen_at: seed a seen-only receipt, then mark read.
      await feedItemReadsRepo.markFeedItemSeen(pool, {
        organization_id: orgA.id,
        branch_id: branchA.id,
        member_id: member.id,
        source_type: "hq_broadcast",
        source_id: hq.id,
      });
      const before = await feedItemReadsRepo.listReceiptsForMember(pool, member.id, [
        { source_type: "hq_broadcast", source_id: hq.id },
      ]);
      const firstSeen = before.get(`hq_broadcast:${hq.id}`).first_seen_at;
      assert.ok(firstSeen);
      assert.equal(before.get(`hq_broadcast:${hq.id}`).read_at, null);

      const marked = await agent
        .post(`/member/announcements/hq/${hq.id}/read`)
        .type("form")
        .send({
          return_to: `/member/announcements/hq/${hq.id}`,
          [CSRF_FIELD]: csrf,
        });
      assert.equal(marked.status, 303);

      const after = await feedItemReadsRepo.listReceiptsForMember(pool, member.id, [
        { source_type: "hq_broadcast", source_id: hq.id },
      ]);
      assert.ok(after.get(`hq_broadcast:${hq.id}`).read_at);
      assert.equal(
        new Date(after.get(`hq_broadcast:${hq.id}`).first_seen_at).getTime(),
        new Date(firstSeen).getTime()
      );
      assert.equal(await countReceipts("hq_broadcast", hq.id), 1);

      const dup = await agent
        .post(`/member/announcements/hq/${hq.id}/read`)
        .type("form")
        .send({
          return_to: `/member/announcements/hq/${hq.id}`,
          [CSRF_FIELD]: csrf,
        });
      assert.equal(dup.status, 303);
      assert.equal(await countReceipts("hq_broadcast", hq.id), 1);

      const detailRead = await agent.get(`/member/announcements/hq/${hq.id}`);
      assert.equal(detailRead.status, 200);
      assert.match(detailRead.text, /data-announcement-read="1"|aria-label="Read"/);
      assert.doesNotMatch(detailRead.text, /data-member-mark-read-form/);

      const branchDetail = await agent.get(`/member/announcements/branch/${branchAnn.id}`);
      assert.equal(branchDetail.status, 200);
      const branchCsrf = extractCsrf(branchDetail.text);
      assert.ok(branchCsrf);
      const branchMark = await agent
        .post(`/member/announcements/branch/${branchAnn.id}/read`)
        .type("form")
        .send({
          return_to: "https://evil.example/phish",
          [CSRF_FIELD]: branchCsrf,
        });
      assert.equal(branchMark.status, 303);
      assert.match(branchMark.headers.location, new RegExp(`/member/announcements/branch/${branchAnn.id}`));
      assert.doesNotMatch(branchMark.headers.location, /evil\.example/);
      assert.equal(await countReceipts("announcement", branchAnn.id), 1);

      assert.equal((await agent.get(`/member/announcements/branch/${otherBranchAnn.id}`)).status, 404);
      assert.equal(
        (
          await agent
            .post(`/member/announcements/branch/${otherBranchAnn.id}/read`)
            .type("form")
            .send({ [CSRF_FIELD]: branchCsrf })
        ).status,
        404
      );
      assert.equal(await countReceipts("announcement", otherBranchAnn.id), 0);

      assert.equal((await agent.get(`/member/announcements/hq/${otherOrgHq.id}`)).status, 404);
      assert.equal(
        (
          await agent
            .post(`/member/announcements/hq/${otherOrgHq.id}/read`)
            .type("form")
            .send({ [CSRF_FIELD]: csrf })
        ).status,
        404
      );
      assert.equal(await countReceipts("hq_broadcast", otherOrgHq.id), 0);

      const analytics = await loadBroadcastDeliveryAnalytics(pool, orgA.id, {
        id: hq.id,
        audience: "members",
        target_scope: "all_branches",
        status: "published",
      });
      assert.ok(analytics.read_count >= 1);
      assert.ok(analytics.seen_count >= analytics.read_count);
      assert.ok(analytics.read_percentage >= 0);
      assert.ok(Array.isArray(analytics.by_branch));
    } finally {
      if (prev === undefined) delete process.env.GETPRO_REQUIRE_CHURCH_CSRF;
      else process.env.GETPRO_REQUIRE_CHURCH_CSRF = prev;
      await cleanup(pool, [branchA.id, branchA2.id, branchB.id], [orgA.id, orgB.id]);
    }
  }
);
