"use strict";

/**
 * Phase3 website publication version history service.
 */

const versionRepo = require("../repositories/websitePublicationVersionRepository");
const publicContentRepo = require("../repositories/publicContentRepository");
const { PUBLIC_PAGE_KEYS } = require("./publicContentConstants");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
});

const STATUS_LABELS = Object.freeze({
  draft: "Draft",
  published: "Published",
  superseded: "Superseded",
  restored: "Restored",
  archived: "Archived",
});

const SOURCE_LABELS = Object.freeze({
  hq_edit: "HQ edit",
  branch_submission: "Branch submission",
  theme_change: "Theme change",
  content_restoration: "Content restoration",
  initial_setup: "Initial setup",
});

/**
 * Build a structured publication snapshot (no private management data).
 * @param {import('pg').PoolClient} client
 * @param {string} churchId
 */
async function buildPublicationSnapshot(client, churchId) {
  const pages = [];
  for (const pageKey of PUBLIC_PAGE_KEYS) {
    const page = await publicContentRepo.findPageByScope(client, {
      churchId,
      branchId: null,
      pageKey,
    });
    if (!page) continue;
    const sections = await publicContentRepo.listSectionsForPage(client, page.id, {});
    pages.push({
      pageKey: page.pageKey,
      title: page.title,
      status: page.status,
      sections: (sections || []).map((s) => ({
        sectionKey: s.sectionKey,
        sectionType: s.sectionType,
        heading: s.heading,
        bodyText: s.bodyText,
        mediaUrl: s.mediaUrl,
        sortOrder: s.sortOrder,
        status: s.status,
      })),
    });
  }
  return {
    themeKey: "default",
    pageKeys: pages.map((p) => p.pageKey),
    pages,
  };
}

function buildChangeSummary(snapshot, sourceType) {
  const pages = (snapshot && snapshot.pages) || [];
  let sectionCount = 0;
  for (const p of pages) sectionCount += (p.sections || []).length;
  return {
    pagesChanged: pages.map((p) => p.pageKey),
    pageCount: pages.length,
    sectionCount,
    sourceType: sourceType || "hq_edit",
  };
}

/**
 * Record a published version inside an existing publish transaction.
 * Throws on failure so the outer publish TX rolls back.
 * @param {import('pg').PoolClient} client
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   actorUserId?: string|null,
 *   publishedAt?: string|Date,
 *   sourceType?: string,
 *   sourceSubmissionId?: string|null,
 *   alreadyPublished?: boolean,
 * }} input
 */
async function recordPublishVersionInTransaction(client, input) {
  const organizationId = input.organizationId;
  const churchId = input.churchId;
  if (!versionRepo.isUuid(organizationId) || !versionRepo.isUuid(churchId)) {
    throw Object.assign(new Error("invalid_version_scope"), { code: "INVALID_VERSION_SCOPE" });
  }

  await versionRepo.supersedePublishedVersions(client, organizationId);
  const versionNumber = await versionRepo.getNextVersionNumber(client, organizationId);
  const snapshot = await buildPublicationSnapshot(client, churchId);
  const sourceType = input.sourceType || "hq_edit";
  const changeSummary = buildChangeSummary(snapshot, sourceType);

  const version = await versionRepo.insertPublishedVersion(client, {
    organizationId,
    churchId,
    versionNumber,
    themeKey: snapshot.themeKey || "default",
    sourceType,
    sourceSubmissionId: input.sourceSubmissionId || null,
    snapshot,
    changeSummary,
    createdBy: input.actorUserId || null,
    publishedBy: input.actorUserId || null,
    publishedAt: input.publishedAt || new Date().toISOString(),
  });

  return version;
}

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   status?: string,
 *   publishedBy?: string,
 *   themeKey?: string,
 *   from?: string,
 *   to?: string,
 * }} opts
 */
async function loadVersionHistory(db, opts) {
  const organizationId = opts && opts.organizationId;
  if (!versionRepo.isUuid(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }
  try {
    const [list, current, publishers, themeKeys] = await Promise.all([
      versionRepo.listVersions(db, {
        organizationId,
        status: opts.status || null,
        publishedBy: opts.publishedBy || null,
        themeKey: opts.themeKey || null,
        from: opts.from || null,
        to: opts.to || null,
      }),
      versionRepo.getCurrentPublishedVersion(db, organizationId),
      versionRepo.listPublishers(db, organizationId),
      versionRepo.listThemeKeys(db, organizationId),
    ]);
    return {
      ok: true,
      status: STATUS.OK,
      items: list.items,
      total: list.total,
      current,
      publishers,
      themeKeys,
      filters: {
        status: opts.status || "",
        publishedBy: opts.publishedBy || "",
        themeKey: opts.themeKey || "",
        from: opts.from || "",
        to: opts.to || "",
      },
      statusLabels: STATUS_LABELS,
      sourceLabels: SOURCE_LABELS,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "list" };
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {{ organizationId: string, versionId: string }} opts
 */
async function loadVersionDetail(db, opts) {
  if (!versionRepo.isUuid(opts.organizationId) || !versionRepo.isUuid(opts.versionId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    const version = await versionRepo.getVersionByOrgAndId(
      db,
      opts.organizationId,
      opts.versionId
    );
    if (!version) return { ok: false, status: STATUS.NOT_FOUND, reason: "version" };
    return {
      ok: true,
      status: STATUS.OK,
      version,
      statusLabels: STATUS_LABELS,
      sourceLabels: SOURCE_LABELS,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "detail" };
  }
}

module.exports = {
  STATUS,
  STATUS_LABELS,
  SOURCE_LABELS,
  buildPublicationSnapshot,
  buildChangeSummary,
  recordPublishVersionInTransaction,
  loadVersionHistory,
  loadVersionDetail,
};
