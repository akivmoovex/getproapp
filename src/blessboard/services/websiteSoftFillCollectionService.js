"use strict";

/**
 * Soft-fill collection helpers for Phase 7 structured drafts.
 *
 * Soft-fill leaders/ministries/events/sermons exist only in the render layer until
 * published. Editing one member must not orphan the rest of the collection when
 * the first publish materializes a single row and disables soft-fill.
 */

const contentRepo = require("../repositories/publicContentRepository");
const draftRepo = require("../repositories/websiteStructuredDraftRepository");
const { buildPublicDemoPack } = require("./tenantPublicDemoContent");

const SOFT_FILL_COLLECTIONS = Object.freeze({
  leader: Object.freeze({
    pageKey: "leadership",
    list: (pack) => pack.leaders || [],
    idPrefix: "demo-leader-",
    async countPublished(client, churchId, branchId) {
      const rows = await contentRepo.listLeaders(client, {
        churchId,
        branchId: branchId || null,
        status: "published",
      });
      return rows.length;
    },
    payloadFromItem(item) {
      return {
        displayName: item.displayName,
        roleTitle: item.roleTitle || null,
        biography: item.biography || null,
        imageUrl: item.imageUrl || null,
        sortOrder: item.sortOrder != null ? item.sortOrder : 0,
        status: "draft",
        seniorLeader: Boolean(item.seniorLeader),
        visible: true,
        contactPublic: false,
        email: null,
        phone: null,
        socialUrl: null,
      };
    },
  }),
  ministry: Object.freeze({
    pageKey: "ministries",
    list: (pack) => pack.ministries || [],
    idPrefix: "demo-ministry-",
    async countPublished(client, churchId, branchId) {
      const rows = await contentRepo.listMinistries(client, {
        churchId,
        branchId: branchId || null,
        status: "published",
      });
      return rows.length;
    },
    payloadFromItem(item) {
      return {
        name: item.name,
        summary: item.summary || null,
        description: item.description || null,
        meetingDay: item.meetingDay || null,
        audience: item.audience || null,
        leaderName: item.leaderName || null,
        contactEmail: item.contactEmail || null,
        joinUrl: item.joinUrl || item.contactHref || null,
        imageUrl: item.imageUrl || null,
        featured: Boolean(item.featured),
        visible: true,
        sortOrder: item.sortOrder != null ? item.sortOrder : 0,
        status: "draft",
      };
    },
  }),
  event: Object.freeze({
    pageKey: "events",
    list: (pack) => pack.events || [],
    idPrefix: "demo-event-",
    async countPublished(client, churchId, branchId) {
      const rows = await contentRepo.listEvents(client, {
        churchId,
        branchId: branchId || null,
        status: "published",
      });
      return rows.length;
    },
    payloadFromItem(item) {
      return {
        title: item.title,
        description: item.summary || item.description || null,
        summary: item.summary || null,
        startsAt: item.startsAt || null,
        endsAt: item.endsAt || null,
        timezone: item.timezone || "UTC",
        location: item.location || null,
        registrationUrl: item.registrationUrl || null,
        organizer: item.organizer || null,
        imageUrl: item.imageUrl || null,
        featured: Boolean(item.featured),
        visible: true,
        status: "draft",
      };
    },
  }),
  sermon: Object.freeze({
    pageKey: "sermons",
    list: (pack) => pack.sermons || [],
    idPrefix: "demo-sermon-",
    async countPublished(client, churchId, branchId) {
      const rows = await contentRepo.listSermons(client, {
        churchId,
        branchId: branchId || null,
        status: "published",
      });
      return rows.length;
    },
    payloadFromItem(item) {
      return {
        title: item.title,
        speakerName: item.speakerName || null,
        date: item.preachedAt ? String(item.preachedAt).slice(0, 10) : null,
        preachedAt: item.preachedAt || null,
        scripture: item.scripture || null,
        series: item.series || item.category || null,
        description: item.summary || null,
        mediaUrl: item.mediaUrl || null,
        imageUrl: item.imageUrl || null,
        featured: Boolean(item.featured),
        visible: true,
        status: "draft",
      };
    },
  }),
});

function isSoftFillEntityKey(draftKind, entityKey) {
  const cfg = SOFT_FILL_COLLECTIONS[draftKind];
  if (!cfg) return false;
  const key = String(entityKey || "");
  return key.startsWith(cfg.idPrefix);
}

function softFillItemsForKind(draftKind, publicName) {
  const cfg = SOFT_FILL_COLLECTIONS[draftKind];
  if (!cfg) return [];
  const pack = buildPublicDemoPack({ publicName: publicName || "Church" });
  return cfg.list(pack).slice();
}

/**
 * When the first soft-fill member is edited and the scoped collection is still
 * empty in CMS, seed sibling soft-fill drafts so publish materializes the full
 * set the editor was showing — not only the edited member.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   branchId?: string|null,
 *   editorUserId: string,
 *   draftKind: string,
 *   entityKey: string,
 *   pageKey?: string|null,
 *   publicName?: string|null,
 * }} input
 */
async function ensureSoftFillSiblingDrafts(db, input) {
  const kind = String(input.draftKind || "");
  const cfg = SOFT_FILL_COLLECTIONS[kind];
  const entityKey = String(input.entityKey || "");
  if (!cfg || !isSoftFillEntityKey(kind, entityKey)) {
    return { seeded: 0, skipped: "not_soft_fill" };
  }

  const churchId = input.churchId;
  const branchId = input.branchId === undefined ? null : input.branchId;
  const publishedCount = await cfg.countPublished(db, churchId, branchId);
  if (publishedCount > 0) {
    return { seeded: 0, skipped: "published_content_exists", publishedCount };
  }

  const items = softFillItemsForKind(kind, input.publicName);
  if (!items.length) return { seeded: 0, skipped: "empty_pack" };

  const existing = await draftRepo.listStructuredDrafts(db, {
    churchId,
    branchId,
    draftKind: kind,
    status: "draft",
  });
  const existingKeys = new Set(
    (existing || []).map((d) => String(d.entityKey || "")).filter(Boolean)
  );
  existingKeys.add(entityKey);

  let seeded = 0;
  for (const item of items) {
    const key = String(item.id || "");
    if (!key || existingKeys.has(key)) continue;
    await draftRepo.upsertStructuredDraft(db, {
      organizationId: input.organizationId,
      churchId,
      branchId,
      draftKind: kind,
      pageKey: input.pageKey || cfg.pageKey,
      sectionKey: null,
      entityKey: key,
      op: "upsert",
      payload: cfg.payloadFromItem(item),
      previousPayload: null,
      editorUserId: input.editorUserId,
    });
    seeded += 1;
    existingKeys.add(key);
  }
  return { seeded, skipped: null };
}

/**
 * Guard used by applyCollection callers / tests: upsert of one member must not
 * shrink a collection unless the op is remove or visible=false for that key.
 */
function assertCollectionPreserved(beforeItems, afterItems, editedKey, op, visible) {
  const before = Array.isArray(beforeItems) ? beforeItems : [];
  const after = Array.isArray(afterItems) ? afterItems : [];
  if (op === "remove" || visible === false) {
    return {
      ok: after.length === before.filter((it) => String(it.id || it._draftKey) !== String(editedKey)).length,
      before: before.length,
      after: after.length,
    };
  }
  return {
    ok: after.length >= before.length,
    before: before.length,
    after: after.length,
  };
}

module.exports = {
  SOFT_FILL_COLLECTIONS,
  isSoftFillEntityKey,
  softFillItemsForKind,
  ensureSoftFillSiblingDrafts,
  assertCollectionPreserved,
};
