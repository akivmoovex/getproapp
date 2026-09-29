"use strict";

/**
 * V7 Phase 3 — classic CMS media and ordering edits must be draft-routed.
 *
 * Proves the full lifecycle for both: save draft -> public unchanged ->
 * preview shows draft -> publish updates the public projection -> version
 * captures the state -> restore recreates it as a new draft.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { resetFoundationDatabase, createFoundationPool } = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  provisionBlessBoardChurch,
} = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  updatePublicPage,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const {
  acknowledgeWebsitePreview,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  saveStructuredDraft,
  applyStructuredDraftsToModel,
} = require("../src/blessboard/services/websiteStructuredDraftService");
const {
  publishWebsiteDrafts,
} = require("../src/blessboard/services/websiteDraftPublishService");
const versionSvc = require("../src/blessboard/services/websitePublicationVersionService");
const versionRepo = require("../src/blessboard/repositories/websitePublicationVersionRepository");
const structuredDraftRepo = require("../src/blessboard/repositories/websiteStructuredDraftRepository");
const {
  orderedStructuredDrafts,
} = require("../src/blessboard/services/websiteDraftApplyService");
const {
  validateStructuredPayload,
  DRAFT_KINDS,
} = require("../src/blessboard/services/websiteStructuredDraftValidation");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST = "p3-media-order.blessboard.org";
const ORG_KEY = "p3-media-order";

const ORIGINAL_MEDIA = "https://cdn.example.test/live-hero.jpg";
const ORIGINAL_ALT = "Live hero image";
const DRAFT_MEDIA = "https://cdn.example.test/draft-hero.jpg";
const DRAFT_ALT = "Draft hero image";

const baseEnv = () => ({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
});

describe("v7 classic CMS media and order draft routing", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let org;
  let church;
  let hqUser;
  let homePageId;
  let leaderIds = [];

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

      const prov = await provisionPlatformTenant(pool, {
        organizationKey: ORG_KEY,
        displayName: "Phase 3 Media Order",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: ORG_KEY,
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(prov.ok, true, prov.message);
      org = prov.records.organization;

      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: ORG_KEY,
        churchKey: ORG_KEY,
        displayName: "Phase 3 Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(ch.ok, true, ch.message);
      church = ch.records.church;

      await ensureChurchSettingsInitialized(pool, church.id);
      await updateChurchSettings(pool, church.id, {
        publicName: "Phase 3 Church",
        websiteStatus: "published",
        primaryEmail: `${ORG_KEY}@example.test`,
      });
      await repairWebsiteFoundation(pool, { churchId: church.id });
      await acknowledgeWebsitePreview(pool, { organizationId: org.id, actorUserId: null });
      await provisionEmptyPublicPages(pool, { churchId: church.id, branchId: null });

      const home = await pool.query(
        `SELECT id FROM blessboard.public_pages
          WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL LIMIT 1`,
        [church.id]
      );
      homePageId = home.rows[0].id;
      await updatePublicPage(pool, homePageId, { status: "published", allowPublishedWrite: true });

      // Live hero carrying media plus alt text, and two more ordered sections.
      // Seeded directly because provisioning already created the section rows.
      for (const [key, sort, media, alt] of [
        ["hero", 10, ORIGINAL_MEDIA, ORIGINAL_ALT],
        ["story", 20, null, null],
        ["service_times", 30, null, null],
      ]) {
        await pool.query(
          `INSERT INTO blessboard.page_sections
             (page_id, section_key, section_type, heading, body_text, media_url,
              sort_order, status, layout_metadata)
           VALUES ($1, $2, $2, $3, 'Live copy.', $4, $5, 'published',
                   CASE WHEN $6::text IS NULL THEN '{}'::jsonb
                        ELSE jsonb_build_object('altText', $6::text) END)
           ON CONFLICT (page_id, section_key) DO UPDATE
             SET section_type = EXCLUDED.section_type,
                 heading = EXCLUDED.heading,
                 body_text = EXCLUDED.body_text,
                 media_url = EXCLUDED.media_url,
                 sort_order = EXCLUDED.sort_order,
                 status = 'published',
                 layout_metadata = EXCLUDED.layout_metadata`,
          [homePageId, key, `Live ${key}`, media, sort, alt]
        );
      }
      // Any other provisioned section would perturb the ordering assertions.
      await pool.query(
        `DELETE FROM blessboard.page_sections
          WHERE page_id = $1 AND section_key <> ALL($2::text[])`,
        [homePageId, ["hero", "story", "service_times"]]
      );

      for (const [name, sort] of [
        ["Leader One", 10],
        ["Leader Two", 20],
        ["Leader Three", 30],
      ]) {
        const inserted = await pool.query(
          `INSERT INTO blessboard.leaders
             (church_id, branch_id, display_name, role_title, sort_order, status)
           VALUES ($1, NULL, $2, 'Pastor', $3, 'published')
           RETURNING id`,
          [church.id, name, sort]
        );
        leaderIds.push(String(inserted.rows[0].id));
      }

      await pool.query(
        `UPDATE blessboard.public_pages
            SET status = 'published', published_at = COALESCE(published_at, now())
          WHERE church_id = $1 AND branch_id IS NULL`,
        [church.id]
      );

      const created = await createBlessBoardUser(pool, {
        email: `${ORG_KEY}-hq@example.test`,
        displayName: "HQ Admin",
        password: PASSWORD,
      });
      assert.equal(created.ok, true, created.message);
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: `${ORG_KEY}-hq@example.test`,
            organizationKey: ORG_KEY,
            roleKey: "church_hq_admin",
            churchKey: ORG_KEY,
          })
        ).ok,
        true
      );
      hqUser = created.user;
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function skipIfNeeded(t) {
    if (skipSuite) t.skip(skipReason || "foundation unavailable");
  }

  const draftBase = () => ({
    organizationId: org.id,
    churchId: church.id,
    branchId: null,
    editorUserId: hqUser.id,
    actorRole: "church_hq_admin",
  });

  async function liveSections() {
    const r = await pool.query(
      `SELECT section_key, media_url, sort_order, layout_metadata
         FROM blessboard.page_sections
        WHERE page_id = $1
        ORDER BY sort_order ASC`,
      [homePageId]
    );
    return r.rows;
  }

  async function liveHero() {
    return (await liveSections()).find((s) => s.section_key === "hero");
  }

  async function liveLeaderOrder() {
    const r = await pool.query(
      `SELECT id FROM blessboard.leaders
        WHERE church_id = $1 AND status = 'published'
        ORDER BY sort_order ASC, created_at ASC`,
      [church.id]
    );
    return r.rows.map((row) => String(row.id));
  }

  async function activeDrafts(kind) {
    const list = await structuredDraftRepo.listStructuredDrafts(pool, {
      churchId: church.id,
      branchId: null,
      status: "draft",
    });
    return kind ? list.filter((d) => d.draftKind === kind) : list;
  }

  function publish() {
    return publishWebsiteDrafts(pool, {
      organizationId: org.id,
      churchId: church.id,
      branchId: null,
      actorUserId: hqUser.id,
      actorRole: "church_hq_admin",
      confirmPublish: true,
      deferServiceTimes: true,
      env: baseEnv(),
    });
  }

  it("registers page_section as a reorder-only structured draft kind", (t) => {
    skipIfNeeded(t);
    assert.ok(DRAFT_KINDS.includes("page_section"));
    // Reorder is the only supported operation for section ordering.
    assert.equal(validateStructuredPayload("page_section", { heading: "x" }, "upsert").ok, false);
    const ok = validateStructuredPayload("page_section", { order: ["a", "b"] }, "reorder");
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.payload.order, ["a", "b"]);
    // A duplicated entry cannot describe a deterministic order.
    assert.equal(
      validateStructuredPayload("page_section", { order: ["a", "a"] }, "reorder").ok,
      false
    );
  });

  it("applies reorder operations after upserts so ordering always settles last", (t) => {
    skipIfNeeded(t);
    const sorted = orderedStructuredDrafts([
      { op: "reorder", id: "r1" },
      { op: "upsert", id: "u1" },
      { op: "remove", id: "x1" },
      { op: "reorder", id: "r2" },
    ]);
    assert.deepEqual(
      sorted.map((d) => d.id),
      ["u1", "x1", "r1", "r2"]
    );
  });

  it("keeps live media unchanged until a media draft is published", async (t) => {
    skipIfNeeded(t);

    const saved = await saveStructuredDraft(pool, {
      ...draftBase(),
      draftKind: "image",
      pageKey: "home",
      sectionKey: "hero",
      entityKey: "section:hero:media",
      op: "upsert",
      payload: { imageUrl: DRAFT_MEDIA, altText: DRAFT_ALT },
      previousPayload: { imageUrl: ORIGINAL_MEDIA, altText: ORIGINAL_ALT },
    });
    assert.equal(saved.saved, true, JSON.stringify(saved));

    // 1. Public projection untouched by the draft save.
    const before = await liveHero();
    assert.equal(before.media_url, ORIGINAL_MEDIA);
    assert.equal(before.layout_metadata.altText, ORIGINAL_ALT);

    // 2. Preview overlay resolves to the draft media and alt text.
    const previewed = applyStructuredDraftsToModel(
      {
        pageKey: "home",
        sections: [
          {
            sectionKey: "hero",
            mediaUrl: ORIGINAL_MEDIA,
            layoutMetadata: { altText: ORIGINAL_ALT },
          },
        ],
      },
      await activeDrafts("image")
    );
    assert.equal(previewed.sections[0].mediaUrl, DRAFT_MEDIA);
    assert.equal(previewed.sections[0].layoutMetadata.altText, DRAFT_ALT);

    // 3. Publish moves the change into the public projection.
    const published = await publish();
    assert.equal(published.ok, true, published.reason || JSON.stringify(published));
    const after = await liveHero();
    assert.equal(after.media_url, DRAFT_MEDIA);
    assert.equal(after.layout_metadata.altText, DRAFT_ALT);

    // 4. The publish captured a version of the new media state.
    const version = await versionRepo.getCurrentPublishedVersion(pool, org.id);
    assert.ok(version && version.id);
  });

  it("refuses a media draft that would leave an image without alt text", async (t) => {
    skipIfNeeded(t);
    await assert.rejects(
      () =>
        saveStructuredDraft(pool, {
          ...draftBase(),
          draftKind: "image",
          pageKey: "home",
          sectionKey: "hero",
          entityKey: "section:hero:media",
          op: "upsert",
          payload: { imageUrl: "https://cdn.example.test/no-alt.jpg", altText: "" },
        }),
      /alternative text/i
    );
    // The rejected draft must not have been recorded.
    assert.equal((await activeDrafts("image")).length, 0);
  });

  it("keeps live section order unchanged until a reorder draft is published", async (t) => {
    skipIfNeeded(t);
    const original = (await liveSections()).map((s) => s.section_key);
    const target = [original[2], original[0], original[1]];

    const saved = await saveStructuredDraft(pool, {
      ...draftBase(),
      draftKind: "page_section",
      pageKey: "home",
      sectionKey: null,
      entityKey: "page:home:section-order",
      op: "reorder",
      payload: { order: target },
      previousPayload: { order: original },
    });
    assert.equal(saved.saved, true, JSON.stringify(saved));

    // Public order untouched.
    assert.deepEqual(
      (await liveSections()).map((s) => s.section_key),
      original
    );

    // Preview reflects the draft order.
    const previewed = applyStructuredDraftsToModel(
      { pageKey: "home", sections: original.map((k) => ({ sectionKey: k })) },
      await activeDrafts("page_section")
    );
    assert.deepEqual(
      previewed.sections.map((s) => s.sectionKey),
      target
    );

    const published = await publish();
    assert.equal(published.ok, true, published.reason || JSON.stringify(published));
    assert.deepEqual(
      (await liveSections()).map((s) => s.section_key),
      target
    );
  });

  it("keeps live entity order unchanged until a reorder draft is published", async (t) => {
    skipIfNeeded(t);
    const original = await liveLeaderOrder();
    const target = [original[1], original[2], original[0]];

    await saveStructuredDraft(pool, {
      ...draftBase(),
      draftKind: "leader",
      pageKey: "leadership",
      entityKey: "collection:leadership:order",
      op: "reorder",
      payload: { order: target },
      previousPayload: { order: original },
    });

    assert.deepEqual(await liveLeaderOrder(), original, "public order must not move on save");

    const previewed = applyStructuredDraftsToModel(
      {
        pageKey: "leadership",
        entities: original.map((id, idx) => ({ id, sortOrder: (idx + 1) * 10 })),
      },
      await activeDrafts("leader")
    );
    assert.deepEqual(
      previewed.entities.map((e) => String(e.id)),
      target
    );

    const published = await publish();
    assert.equal(published.ok, true, published.reason || JSON.stringify(published));
    assert.deepEqual(await liveLeaderOrder(), target);
  });

  it("collapses repeated reorder saves into one draft and can be reverted", async (t) => {
    skipIfNeeded(t);
    const original = await liveLeaderOrder();
    const first = [original[2], original[0], original[1]];
    const second = [original[1], original[0], original[2]];

    const write = (order) =>
      saveStructuredDraft(pool, {
        ...draftBase(),
        draftKind: "leader",
        pageKey: "leadership",
        entityKey: "collection:leadership:order",
        op: "reorder",
        payload: { order },
        previousPayload: { order: original },
      });

    await write(first);
    await write(second);
    let drafts = await activeDrafts("leader");
    assert.equal(drafts.length, 1, "repeated reorder saves must upsert a single draft");
    assert.deepEqual(drafts[0].payload.order, second);

    // Reverting before publish leaves the original order as the pending intent.
    await write(original);
    drafts = await activeDrafts("leader");
    assert.equal(drafts.length, 1);
    assert.deepEqual(drafts[0].payload.order, original);

    const published = await publish();
    assert.equal(published.ok, true, published.reason || JSON.stringify(published));
    assert.deepEqual(await liveLeaderOrder(), original, "revert-then-publish is a no-op move");
    assert.equal((await activeDrafts()).length, 0, "publish leaves no orphan draft rows");
  });

  it("restores a historical media state as a new draft without touching the public site", async (t) => {
    skipIfNeeded(t);
    const versions = await versionRepo.listVersions(pool, { organizationId: org.id, limit: 50 });
    const published = (versions.items || versions || []).filter(
      (v) => String(v.status || "") === "published"
    );
    assert.ok(published.length >= 1, "publishing above must have captured a version");
    const older = published[published.length - 1];

    const liveBefore = await liveHero();
    const restored = await versionSvc.createRestoredDraft(pool, {
      organizationId: org.id,
      churchId: church.id,
      versionId: older.id,
      actorUserId: hqUser.id,
      restorationReason: "Phase 3 media restore",
      selectedPageKeys: ["home"],
      confirmed: true,
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));

    // Restore is draft-only: the public projection is untouched.
    const liveAfter = await liveHero();
    assert.equal(liveAfter.media_url, liveBefore.media_url);
    assert.equal(liveAfter.layout_metadata.altText, liveBefore.layout_metadata.altText);
    assert.ok(restored.draftVersion && restored.draftVersion.id);
  });
});
