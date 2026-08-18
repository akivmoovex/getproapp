"use strict";

/**
 * Read the current published BlessBoard snapshot for public resolution.
 * Baseline / empty snapshots are ignored so legacy live CMS remains visible
 * until the next real publication.
 */

const versionRepo = require("../repositories/websitePublicationVersionRepository");

async function churchOrganizationId(client, churchId) {
  const row = await client.query(
    `SELECT organization_id FROM blessboard.churches WHERE id = $1 LIMIT 1`,
    [churchId]
  );
  return row.rows[0] && row.rows[0].organization_id ? String(row.rows[0].organization_id) : null;
}

function snapshotUsable(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (snapshot.baseline === true) return false;
  const pages = Array.isArray(snapshot.pages) ? snapshot.pages : [];
  const entities = snapshot.entities && typeof snapshot.entities === "object" ? snapshot.entities : {};
  const entityCount = Object.values(entities).reduce(
    (n, list) => n + (Array.isArray(list) ? list.length : 0),
    0
  );
  return pages.length > 0 || entityCount > 0;
}

async function loadCurrentPublishedSnapshot(client, churchId, branchId) {
  const organizationId = await churchOrganizationId(client, churchId);
  if (!organizationId) return null;
  const version = await versionRepo.getCurrentPublishedVersion(
    client,
    organizationId,
    branchId == null || branchId === "" ? null : String(branchId)
  );
  if (!version || !snapshotUsable(version.snapshot)) return null;
  return { version, snapshot: version.snapshot };
}

function overlayPublishedPage(livePage, liveSections, snapshot, pageKey) {
  const pages = Array.isArray(snapshot && snapshot.pages) ? snapshot.pages : [];
  const snapPage = pages.find((p) => String(p.pageKey || p.page_key) === String(pageKey));
  if (!snapPage) return { page: livePage, sections: liveSections, fromSnapshot: false };
  const page = livePage
    ? { ...livePage, title: snapPage.title || livePage.title, status: "published" }
    : {
        id: snapPage.id || null,
        pageKey,
        title: snapPage.title || pageKey,
        status: "published",
      };
  const snapSections = Array.isArray(snapPage.sections) ? snapPage.sections : [];
  const liveByKey = new Map(
    (liveSections || []).map((s) => [String(s.sectionKey || s.section_key || ""), s])
  );
  const sections = snapSections
    .filter((s) => String(s.status || "published") === "published")
    .map((s, idx) => {
      const key = String(s.sectionKey || s.section_key || "");
      const live = liveByKey.get(key) || {};
      return {
        ...live,
        id: live.id || s.id || null,
        sectionKey: key,
        sectionType: s.sectionType || s.section_type || live.sectionType,
        heading: s.heading != null ? s.heading : live.heading,
        bodyText: s.bodyText != null ? s.bodyText : s.body_text != null ? s.body_text : live.bodyText,
        mediaUrl: s.mediaUrl != null ? s.mediaUrl : s.media_url != null ? s.media_url : live.mediaUrl,
        sortOrder: s.sortOrder != null ? s.sortOrder : s.sort_order != null ? s.sort_order : idx,
        status: "published",
      };
    });
  return { page, sections, fromSnapshot: true };
}

function overlayPublishedEntities(kind, liveItems, snapshot) {
  const entities = snapshot && snapshot.entities && typeof snapshot.entities === "object"
    ? snapshot.entities
    : null;
  if (!entities) return { items: liveItems, fromSnapshot: false };
  const key = String(kind || "");
  if (!Object.prototype.hasOwnProperty.call(entities, key)) {
    return { items: liveItems, fromSnapshot: false };
  }
  const list = Array.isArray(entities[key]) ? entities[key] : [];
  return {
    items: list.filter((item) => String((item && item.status) || "published") === "published"),
    fromSnapshot: true,
  };
}

module.exports = {
  loadCurrentPublishedSnapshot,
  overlayPublishedPage,
  overlayPublishedEntities,
  snapshotUsable,
};
