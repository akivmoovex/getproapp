"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findOrphanRelativeFiles,
  resolveUnderRoot,
  isIgnoredName,
} = require("../src/church/churchAttachmentOrphanAudit");
const {
  deleteAnnouncementWithAttachmentFiles,
  deleteBroadcastWithAttachmentFiles,
} = require("../src/church/churchAttachmentParentCleanup");
const {
  unlinkAnnouncementStoredFilename,
  unlinkStoredFilename,
  absolutePathForAnnouncementStoredFilename,
  absolutePathForStoredFilename,
  ANNOUNCEMENT_UPLOAD_ROOT,
  UPLOAD_ROOT,
} = require("../src/church/hqBroadcastUploads");
const { churchPgSkipIfUnconfigured, requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const announcementsRepo = require("../src/db/pg/church/announcementsRepo");
const hqBroadcastsRepo = require("../src/db/pg/church/hqBroadcastsRepo");
const broadcastAttachmentsRepo = require("../src/db/pg/church/broadcastAttachmentsRepo");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

function makeTempRoot(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("orphan audit: referenced files are not reported; unreferenced are; .gitkeep ignored", () => {
  const root = makeTempRoot("church-orphan-");
  try {
    fs.mkdirSync(path.join(root, "1", "2"), { recursive: true });
    fs.writeFileSync(path.join(root, "1", "2", "kept.pdf"), "pdf");
    fs.writeFileSync(path.join(root, "1", "2", "orphan.pdf"), "pdf");
    fs.writeFileSync(path.join(root, ".gitkeep"), "");
    fs.writeFileSync(path.join(root, "1", "2", "note.tmp"), "tmp");

    const { orphans, filesOnDisk } = findOrphanRelativeFiles(root, new Set(["1/2/kept.pdf"]));
    assert.ok(filesOnDisk.includes("1/2/kept.pdf"));
    assert.ok(filesOnDisk.includes("1/2/orphan.pdf"));
    assert.ok(!filesOnDisk.includes(".gitkeep"));
    assert.ok(!filesOnDisk.includes("1/2/note.tmp"));
    assert.deepEqual(orphans, ["1/2/orphan.pdf"]);
    assert.equal(isIgnoredName(".gitkeep"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("orphan audit: path traversal rejected; files outside root never resolved", () => {
  const root = makeTempRoot("church-orphan-root-");
  const outside = makeTempRoot("church-orphan-outside-");
  try {
    fs.writeFileSync(path.join(outside, "secret.pdf"), "x");
    assert.equal(resolveUnderRoot(root, "../" + path.basename(outside) + "/secret.pdf"), null);
    assert.equal(resolveUnderRoot(root, "..\\..\\etc\\passwd"), null);
    const { orphans } = findOrphanRelativeFiles(root, new Set());
    assert.equal(orphans.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("default orphan audit mode performs no deletion (module has no delete API)", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/church/churchAttachmentOrphanAudit.js"),
    "utf8"
  );
  assert.doesNotMatch(src, /unlinkSync|rmSync|fs\.unlink/);
  const script = fs.readFileSync(
    path.join(__dirname, "../scripts/check-church-attachment-orphans.js"),
    "utf8"
  );
  assert.match(script, /read-only|no files deleted/i);
  assert.doesNotMatch(script, /ALLOW_DELETE|delete orphans/i);
});

test("missing-file unlink helpers do not throw", () => {
  assert.doesNotThrow(() => unlinkAnnouncementStoredFilename("999/999/missing-file.pdf"));
  assert.doesNotThrow(() => unlinkStoredFilename("999/999/missing-file.pdf"));
});

test(
  "parent deletion cleans attachment files for announcements and broadcasts",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;

    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = `life_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `life_${suffix}`.replace(/[^a-z0-9_]/g, "").slice(0, 40),
      name: `Lifecycle Org ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Lifecycle Branch ${suffix}`,
    });

    const announcement = await announcementsRepo.createAnnouncementForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      title: `Ann ${suffix}`,
      body: "body",
      category: "General",
      audience: "members",
      status: "draft",
      created_by_admin_id: null,
    });

    const annRel = `${branch.id}/${announcement.id}/life_${suffix}.pdf`;
    const annDir = path.join(ANNOUNCEMENT_UPLOAD_ROOT, String(branch.id), String(announcement.id));
    fs.mkdirSync(annDir, { recursive: true });
    const annAbs = path.join(annDir, `life_${suffix}.pdf`);
    fs.writeFileSync(annAbs, Buffer.from("%PDF-1.4 life"));
    await broadcastAttachmentsRepo.createAnnouncementAttachment(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      announcement_id: announcement.id,
      original_filename: "life.pdf",
      stored_filename: annRel,
      mime_type: "application/pdf",
      file_size: 12,
      created_by_admin_id: null,
    });

    const loadedBefore = await broadcastAttachmentsRepo.listAttachmentsForAnnouncement(
      pool,
      announcement.id,
      branch.id
    );
    assert.equal(loadedBefore.length, 1);
    assert.equal(fs.existsSync(annAbs), true);

    const crossBranch = await deleteAnnouncementWithAttachmentFiles(pool, announcement.id, branch.id + 99999);
    assert.equal(crossBranch.deleted, false);
    assert.equal(fs.existsSync(annAbs), true);

    const deletedAnn = await deleteAnnouncementWithAttachmentFiles(pool, announcement.id, branch.id);
    assert.equal(deletedAnn.deleted, true);
    assert.equal(deletedAnn.attachmentCount, 1);
    assert.equal(fs.existsSync(annAbs), false);
    assert.equal(
      await announcementsRepo.findAnnouncementByIdForBranch(pool, announcement.id, branch.id),
      null
    );
    assert.equal(
      (await broadcastAttachmentsRepo.listAttachmentsForAnnouncement(pool, announcement.id, branch.id)).length,
      0
    );

    // Missing stored file does not crash deletion.
    const announcement2 = await announcementsRepo.createAnnouncementForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      title: `Ann2 ${suffix}`,
      body: "body",
      category: "General",
      audience: "members",
      status: "draft",
      created_by_admin_id: null,
    });
    await broadcastAttachmentsRepo.createAnnouncementAttachment(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      announcement_id: announcement2.id,
      original_filename: "ghost.pdf",
      stored_filename: `${branch.id}/${announcement2.id}/ghost_${suffix}.pdf`,
      mime_type: "application/pdf",
      file_size: 10,
      created_by_admin_id: null,
    });
    const ghostDelete = await deleteAnnouncementWithAttachmentFiles(pool, announcement2.id, branch.id);
    assert.equal(ghostDelete.deleted, true);

    const broadcast = await hqBroadcastsRepo.createBroadcastForOrganization(pool, org.id, {
      title: `BC ${suffix}`,
      body: "body",
      category: "General",
      audience: "members",
      target_scope: "all_branches",
      status: "draft",
      created_by_hq_admin_id: null,
    });
    const bcRel = `${org.id}/${broadcast.id}/life_bc_${suffix}.pdf`;
    const bcDir = path.join(UPLOAD_ROOT, String(org.id), String(broadcast.id));
    fs.mkdirSync(bcDir, { recursive: true });
    const bcAbs = path.join(bcDir, `life_bc_${suffix}.pdf`);
    fs.writeFileSync(bcAbs, Buffer.from("%PDF-1.4 bc"));
    await broadcastAttachmentsRepo.createBroadcastAttachment(pool, {
      organization_id: org.id,
      broadcast_id: broadcast.id,
      original_filename: "bc.pdf",
      stored_filename: bcRel,
      mime_type: "application/pdf",
      file_size: 12,
      created_by_hq_admin_id: null,
    });

    const crossOrg = await deleteBroadcastWithAttachmentFiles(pool, broadcast.id, org.id + 99999);
    assert.equal(crossOrg.deleted, false);
    assert.equal(fs.existsSync(bcAbs), true);

    const deletedBc = await deleteBroadcastWithAttachmentFiles(pool, broadcast.id, org.id);
    assert.equal(deletedBc.deleted, true);
    assert.equal(fs.existsSync(bcAbs), false);

    // Cleanup failure path must not expose absolute paths in helper source.
    const cleanupSrc = fs.readFileSync(
      path.join(__dirname, "../src/church/churchAttachmentParentCleanup.js"),
      "utf8"
    );
    assert.match(cleanupSrc, /console\.warn/);
    assert.doesNotMatch(cleanupSrc, /absPath|absolutePath.*=/);

    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
    fs.rmSync(path.join(ANNOUNCEMENT_UPLOAD_ROOT, String(branch.id)), { recursive: true, force: true });
    fs.rmSync(path.join(UPLOAD_ROOT, String(org.id)), { recursive: true, force: true });

    void absolutePathForAnnouncementStoredFilename;
    void absolutePathForStoredFilename;
  }
);
