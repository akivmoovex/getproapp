"use strict";

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
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const announcementsRepo = require("../src/db/pg/church/announcementsRepo");
const broadcastAttachmentsRepo = require("../src/db/pg/church/broadcastAttachmentsRepo");
const {
  ANNOUNCEMENT_UPLOAD_ROOT,
  MAX_ATTACHMENTS_PER_ITEM,
  MAX_ATTACHMENT_BYTES,
  saveBroadcastAttachments,
  absolutePathForAnnouncementStoredFilename,
} = require("../src/church/hqBroadcastUploads");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { churchPgSkipIfUnconfigured, requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-branch-announcement-attachments",
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

async function cleanup(pool, orgIds, branchIds) {
  for (const branchId of branchIds || []) {
    const dir = path.join(ANNOUNCEMENT_UPLOAD_ROOT, String(branchId));
    fs.rmSync(dir, { recursive: true, force: true });
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_announcement_attachments WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_announcements WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]).catch(() => {});
  }
}

function pdfBuffer(label) {
  return Buffer.from(`%PDF-1.4 ${label}`);
}

test("unauthorized users cannot upload or delete branch announcement attachments", async () => {
  const app = makeApp({
    kind: "branch",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const upload = await request(app)
    .post("/branch/announcements/1")
    .field("title", "T")
    .field("body", "B")
    .field("category", "General")
    .field("audience", "members")
    .field("_intent", "draft")
    .attach("attachments", pdfBuffer("x"), "notes.pdf");
  assert.equal(upload.status, 302);
  assert.equal(upload.headers.location, "/branch/login");

  const del = await request(app).post("/branch/announcements/1/attachments/1/delete");
  assert.equal(del.status, 302);
  assert.equal(del.headers.location, "/branch/login");
});

test("HQ broadcast attachment helpers remain exported unchanged", () => {
  assert.equal(typeof saveBroadcastAttachments, "function");
  assert.equal(MAX_ATTACHMENT_BYTES, 5 * 1024 * 1024);
  assert.equal(MAX_ATTACHMENTS_PER_ITEM, 5);
  const hqSrc = fs.readFileSync(
    path.join(__dirname, "../src/routes/church/hqAdminBroadcasts.js"),
    "utf8"
  );
  assert.match(hqSrc, /\/hq\/broadcasts\/:broadcastId\/attachments\/:attachmentId\/download/);
  assert.match(hqSrc, /\/hq\/broadcasts\/:broadcastId\/attachments\/:attachmentId\/delete/);
});

test("branch announcement form and detail include mobile-safe attachment layout markers", () => {
  const form = fs.readFileSync(
    path.join(__dirname, "../views/church/branch-admin/announcement_form.ejs"),
    "utf8"
  );
  const detail = fs.readFileSync(
    path.join(__dirname, "../views/church/branch-admin/announcement_detail.ejs"),
    "utf8"
  );
  assert.match(form, /data-branch-attachments/);
  assert.match(form, /church-branch-attachment-list/);
  assert.match(form, /enctype="multipart\/form-data"/);
  assert.match(form, /name="attachments"/);
  assert.match(detail, /data-branch-attachments/);
  assert.match(detail, /church-branch-attachment-item/);
  assert.doesNotMatch(form, /data\/uploads/);
  assert.doesNotMatch(detail, /data\/uploads/);
  assert.doesNotMatch(form, /ANNOUNCEMENT_UPLOAD_ROOT/);
});

test(
  "branch-admin announcement attachments workflow",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;

    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("baatt");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `baatt_a_${suffix}`.replace(/[^a-z0-9_]/g, "").slice(0, 40),
      name: `Branch Attach Org A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `baatt_b_${suffix}`.replace(/[^a-z0-9_]/g, "").slice(0, 40),
      name: `Branch Attach Org B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      host_slug: `baatt-a-${suffix}`.replace(/[^a-z0-9-]/g, "").slice(0, 48),
      name: `Branch Attach A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      host_slug: `baatt-b-${suffix}`.replace(/[^a-z0-9-]/g, "").slice(0, 48),
      name: `Branch Attach B ${suffix}`,
    });

    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Admin A",
      email: `baatt_a_${suffix}@example.com`,
      phone: "0977555601",
      password_hash: passwordHash,
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      full_name: "Admin B",
      email: `baatt_b_${suffix}@example.com`,
      phone: "0977555602",
      password_hash: passwordHash,
    });
    await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `baatt_m_${suffix}@example.com`,
      phone: "0977555603",
      full_name: "Attach Member",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
      ministry_interest: "choir",
    });
    const memberRow = await membersRepo.findMemberByEmailOrPhoneForBranch(
      pool,
      branchA.id,
      `baatt_m_${suffix}@example.com`
    );
    await membersRepo.updateMemberStatusForBranch(pool, memberRow.id, branchA.id, "verified");

    const appA = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const appB = makeApp({
      kind: "branch",
      orgSlug: orgB.slug,
      organization: orgB,
      branch: branchB,
    });

    const adminA = request.agent(appA);
    await adminA.post("/branch/login").type("form").send({
      identifier: `baatt_a_${suffix}@example.com`,
      password: "testpass123",
    });
    const adminB = request.agent(appB);
    await adminB.post("/branch/login").type("form").send({
      identifier: `baatt_b_${suffix}@example.com`,
      password: "testpass123",
    });

    // Ordinary save without file input still works.
    const plainCreate = await adminA.post("/branch/announcements").type("form").send({
      title: `Plain ${suffix}`,
      body: "No files",
      category: "General",
      audience: "members",
      _intent: "draft",
    });
    assert.equal(plainCreate.status, 303);
    const plainId = Number(String(plainCreate.headers.location).match(/\/branch\/announcements\/(\d+)/)[1]);

    // Authorized upload of approved PDF.
    const uploadOk = await adminA
      .post(`/branch/announcements/${plainId}`)
      .field("title", `Plain ${suffix}`)
      .field("body", "No files")
      .field("category", "General")
      .field("audience", "members")
      .field("priority", "normal")
      .field("_intent", "draft")
      .attach("attachments", pdfBuffer("ok"), {
        filename: "meeting notes.pdf",
        contentType: "application/pdf",
      });
    assert.equal(uploadOk.status, 303);

    const listed = await broadcastAttachmentsRepo.listAttachmentsForAnnouncement(pool, plainId, branchA.id);
    assert.equal(listed.length, 1);
    assert.equal(Number(listed[0].announcement_id), Number(plainId));
    assert.equal(Number(listed[0].branch_id), Number(branchA.id));
    assert.equal(listed[0].original_filename, "meeting notes.pdf");
    assert.equal(listed[0].mime_type, "application/pdf");
    assert.doesNotMatch(listed[0].stored_filename, /^\//);
    assert.doesNotMatch(listed[0].stored_filename, /\.\./);

    const abs = absolutePathForAnnouncementStoredFilename(listed[0].stored_filename);
    assert.ok(abs);
    assert.equal(fs.existsSync(abs), true);

    const editPage = await adminA.get(`/branch/announcements/${plainId}/edit`);
    assert.equal(editPage.status, 200);
    assert.match(editPage.text, /data-branch-attachments/);
    assert.match(editPage.text, /meeting notes\.pdf/);
    assert.match(editPage.text, /church-branch-attachment-list/);
    assert.doesNotMatch(editPage.text, /data\/uploads\/church\/announcements/);
    assert.doesNotMatch(editPage.text, /\/Users\//);

    const detailPage = await adminA.get(`/branch/announcements/${plainId}`);
    assert.equal(detailPage.status, 200);
    assert.match(detailPage.text, /meeting notes\.pdf/);
    assert.doesNotMatch(detailPage.text, /data\/uploads/);

    // Branch-admin download.
    const adminDl = await adminA.get(
      `/branch/announcements/${plainId}/attachments/${listed[0].id}/download`
    );
    assert.equal(adminDl.status, 200);

    // Unsafe file type rejected.
    const badType = await adminA
      .post(`/branch/announcements/${plainId}`)
      .field("title", `Plain ${suffix}`)
      .field("body", "No files")
      .field("category", "General")
      .field("audience", "members")
      .field("priority", "normal")
      .field("_intent", "draft")
      .attach("attachments", Buffer.from("not a pdf"), {
        filename: "malware.exe",
        contentType: "application/octet-stream",
      });
    assert.equal(badType.status, 400);
    assert.match(badType.text, /data-branch-attachment-error|rejected|PDF/i);
    assert.equal(
      (await broadcastAttachmentsRepo.listAttachmentsForAnnouncement(pool, plainId, branchA.id)).length,
      1
    );

    // Oversized file rejected.
    const oversized = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1024, 1);
    const big = await adminA
      .post(`/branch/announcements/${plainId}`)
      .field("title", `Plain ${suffix}`)
      .field("body", "No files")
      .field("category", "General")
      .field("audience", "members")
      .field("priority", "normal")
      .field("_intent", "draft")
      .attach("attachments", oversized, {
        filename: "huge.pdf",
        contentType: "application/pdf",
      });
    assert.equal(big.status, 400);
    assert.match(big.text, /5 MB|attachment/i);
    assert.equal(
      (await broadcastAttachmentsRepo.listAttachmentsForAnnouncement(pool, plainId, branchA.id)).length,
      1
    );

    // Cross-branch / cross-org upload and download rejected.
    const otherAnn = await announcementsRepo.createAnnouncementForBranch(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      title: `Other ${suffix}`,
      body: "Other branch",
      category: "General",
      audience: "members",
      status: "draft",
      created_by_admin_id: null,
    });
    const crossUpload = await adminA
      .post(`/branch/announcements/${otherAnn.id}`)
      .field("title", "Hijack")
      .field("body", "Nope")
      .field("category", "General")
      .field("audience", "members")
      .field("_intent", "draft")
      .attach("attachments", pdfBuffer("cross"), {
        filename: "cross.pdf",
        contentType: "application/pdf",
      });
    assert.equal(crossUpload.status, 404);

    const crossDl = await adminA.get(
      `/branch/announcements/${otherAnn.id}/attachments/999999/download`
    );
    assert.equal(crossDl.status, 404);

    const crossOrgDl = await adminB.get(
      `/branch/announcements/${plainId}/attachments/${listed[0].id}/download`
    );
    assert.equal(crossOrgDl.status, 404);

    // Member download still works for permitted published announcements.
    const published = await announcementsRepo.createAnnouncementForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      title: `Published attach ${suffix}`,
      body: "Visible to members",
      category: "General",
      audience: "members",
      status: "published",
      publish_at: new Date(),
      created_by_admin_id: null,
    });
    const pubStored = `${branchA.id}/${published.id}/member_${suffix}.pdf`;
    const pubDir = path.join(ANNOUNCEMENT_UPLOAD_ROOT, String(branchA.id), String(published.id));
    fs.mkdirSync(pubDir, { recursive: true });
    const pubAbs = path.join(pubDir, `member_${suffix}.pdf`);
    fs.writeFileSync(pubAbs, pdfBuffer("member"));
    const pubAtt = await broadcastAttachmentsRepo.createAnnouncementAttachment(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      announcement_id: published.id,
      original_filename: "member-notes.pdf",
      stored_filename: pubStored,
      mime_type: "application/pdf",
      file_size: 20,
      created_by_admin_id: null,
    });

    const memberAgent = request.agent(appA);
    await memberAgent.post("/login").type("form").send({
      identifier: `baatt_m_${suffix}@example.com`,
      password: "testpass123",
    });
    const memberDl = await memberAgent.get(
      `/member/announcements/branch/${published.id}/attachments/${pubAtt.id}/download`
    );
    assert.equal(memberDl.status, 200);

    // Member cannot upload/delete via branch-admin routes.
    const memberUpload = await memberAgent
      .post(`/branch/announcements/${plainId}`)
      .field("title", `Plain ${suffix}`)
      .field("body", "No files")
      .field("category", "General")
      .field("audience", "members")
      .field("_intent", "draft")
      .attach("attachments", pdfBuffer("m"), {
        filename: "member.pdf",
        contentType: "application/pdf",
      });
    assert.equal(memberUpload.status, 302);
    assert.equal(memberUpload.headers.location, "/branch/login");
    const memberDelete = await memberAgent.post(
      `/branch/announcements/${plainId}/attachments/${listed[0].id}/delete`
    );
    assert.equal(memberDelete.status, 302);
    assert.equal(memberDelete.headers.location, "/branch/login");

    // Attachment limit enforced.
    for (let i = 0; i < MAX_ATTACHMENTS_PER_ITEM - 1; i += 1) {
      const fill = await adminA
        .post(`/branch/announcements/${plainId}`)
        .field("title", `Plain ${suffix}`)
        .field("body", "No files")
        .field("category", "General")
        .field("audience", "members")
        .field("priority", "normal")
        .field("_intent", "draft")
        .attach("attachments", pdfBuffer(`fill${i}`), {
          filename: `fill-${i}.pdf`,
          contentType: "application/pdf",
        });
      assert.equal(fill.status, 303);
    }
    assert.equal(
      (await broadcastAttachmentsRepo.listAttachmentsForAnnouncement(pool, plainId, branchA.id)).length,
      MAX_ATTACHMENTS_PER_ITEM
    );
    const overLimit = await adminA
      .post(`/branch/announcements/${plainId}`)
      .field("title", `Plain ${suffix}`)
      .field("body", "No files")
      .field("category", "General")
      .field("audience", "members")
      .field("priority", "normal")
      .field("_intent", "draft")
      .attach("attachments", pdfBuffer("overflow"), {
        filename: "overflow.pdf",
        contentType: "application/pdf",
      });
    assert.equal(overLimit.status, 400);
    assert.match(overLimit.text, /Maximum|Only 5|attachments/i);
    assert.equal(
      (await broadcastAttachmentsRepo.listAttachmentsForAnnouncement(pool, plainId, branchA.id)).length,
      MAX_ATTACHMENTS_PER_ITEM
    );

    // Delete removes DB row and stored file.
    const toDelete = (
      await broadcastAttachmentsRepo.listAttachmentsForAnnouncement(pool, plainId, branchA.id)
    )[0];
    const deleteAbs = absolutePathForAnnouncementStoredFilename(toDelete.stored_filename);
    assert.equal(fs.existsSync(deleteAbs), true);
    const deletedRes = await adminA
      .post(`/branch/announcements/${plainId}/attachments/${toDelete.id}/delete`)
      .type("form")
      .send({ _return: "edit" });
    assert.equal(deletedRes.status, 303);
    assert.equal(
      await broadcastAttachmentsRepo.findAnnouncementAttachmentById(pool, toDelete.id, branchA.id),
      null
    );
    assert.equal(fs.existsSync(deleteAbs), false);

    // Missing stored file does not crash deletion.
    const ghostStored = `${branchA.id}/${plainId}/ghost_${suffix}.pdf`;
    const ghost = await broadcastAttachmentsRepo.createAnnouncementAttachment(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      announcement_id: plainId,
      original_filename: "ghost.pdf",
      stored_filename: ghostStored,
      mime_type: "application/pdf",
      file_size: 10,
      created_by_admin_id: null,
    });
    const ghostDelete = await adminA
      .post(`/branch/announcements/${plainId}/attachments/${ghost.id}/delete`)
      .type("form")
      .send({ _return: "detail" });
    assert.equal(ghostDelete.status, 303);
    assert.equal(
      await broadcastAttachmentsRepo.findAnnouncementAttachmentById(pool, ghost.id, branchA.id),
      null
    );

    // Publish confirmation still works.
    const reviewCreate = await adminA.post("/branch/announcements").type("form").send({
      title: `Review ${suffix}`,
      body: "Ready to publish",
      category: "General",
      audience: "members",
      _intent: "review",
    });
    assert.equal(reviewCreate.status, 303);
    assert.match(reviewCreate.headers.location || "", /confirm-publish/);
    const confirmPage = await adminA.get(reviewCreate.headers.location);
    assert.equal(confirmPage.status, 200);
    assert.match(confirmPage.text, /Estimated audience|Confirm/i);

    const audits = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE organization_id = $1
         AND action IN ('announcement_attachment_uploaded', 'announcement_attachment_deleted')`,
      [orgA.id]
    );
    assert.ok(audits.rows.some((r) => r.action === "announcement_attachment_uploaded"));
    assert.ok(audits.rows.some((r) => r.action === "announcement_attachment_deleted"));

    await cleanup(pool, [orgA.id, orgB.id], [branchA.id, branchB.id]);
  }
);
