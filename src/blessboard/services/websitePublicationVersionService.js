"use strict";

/**
 * Phase3 website publication version history, compare, restore, and publishing history.
 */

const versionRepo = require("../repositories/websitePublicationVersionRepository");
const publicContentRepo = require("../repositories/publicContentRepository");
const { PUBLIC_PAGE_KEYS, PAGE_KEY_TITLES } = require("./publicContentConstants");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
  CONFLICT: "conflict",
  FORBIDDEN: "forbidden",
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

/** Phase4 Growth recent-changes friendly source labels. */
const FRIENDLY_SOURCE_LABELS = Object.freeze({
  hq_edit: "HQ Update",
  branch_submission: "Branch Update",
  theme_change: "Theme Update",
  content_restoration: "Restored Website",
  initial_setup: "Initial Website Setup",
});

const FRIENDLY_SOURCE_FALLBACK = "Website Update";
const GROWTH_PREVIOUS_LIMIT = 5;

const DIFF_LABELS = Object.freeze({
  added: "Added",
  removed: "Removed",
  modified: "Modified",
  moved: "Moved",
  shown: "Shown",
  hidden: "Hidden",
  unchanged: "Unchanged",
  unavailable: "Unavailable",
});

const CHANGE_TYPE_FILTERS = Object.freeze([
  { key: "all", label: "All changes" },
  { key: "text", label: "Text" },
  { key: "images", label: "Images" },
  { key: "layout", label: "Layout" },
  { key: "visibility", label: "Visibility" },
  { key: "navigation", label: "Navigation" },
  { key: "data", label: "Data references" },
]);

const EVENT_TYPE_LABELS = Object.freeze({
  website_published: "Website published",
  branch_changes_published: "Branch changes published",
  theme_activated: "Theme activated",
  restored_version_published: "Restored version published",
  website_republished: "Website republished",
});

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.query === "function" && typeof db.release === "function") {
      return await fn(db);
    }
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

async function withTransaction(db, fn) {
  return withClient(db, async (client) => {
    const ownsTx = Boolean(db && typeof db.connect === "function" && client !== db);
    if (ownsTx) await client.query("BEGIN");
    try {
      const result = await fn(client);
      if (ownsTx) await client.query("COMMIT");
      return result;
    } catch (err) {
      if (ownsTx) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
      }
      throw err;
    }
  });
}

/**
 * Build a structured publication snapshot (no private management data).
 * @param {import('pg').PoolClient} client
 * @param {string} churchId
 * @param {string|null} [branchId]
 */
async function buildPublicationSnapshot(client, churchId, branchId) {
  const pages = [];
  const scopedBranchId = branchId != null && String(branchId).trim() ? String(branchId).trim() : null;
  for (const pageKey of PUBLIC_PAGE_KEYS) {
    const page = await publicContentRepo.findPageByScope(client, {
      churchId,
      branchId: scopedBranchId,
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
    branchId: scopedBranchId,
    pageKeys: pages.map((p) => p.pageKey),
    pages,
    navigation: [],
    serviceTimeRefs: [],
    contactDetailRefs: [],
    branchContentRefs: [],
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
  const branchId =
    input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;
  if (!versionRepo.isUuid(organizationId) || !versionRepo.isUuid(churchId)) {
    throw Object.assign(new Error("invalid_version_scope"), { code: "INVALID_VERSION_SCOPE" });
  }
  if (branchId && !versionRepo.isUuid(branchId)) {
    throw Object.assign(new Error("invalid_version_scope"), { code: "INVALID_VERSION_SCOPE" });
  }

  const pendingRestore = await versionRepo.getLatestDraftRestoration(
    client,
    organizationId,
    branchId
  );
  let sourceType = input.sourceType || "hq_edit";
  let sourceVersionId = null;
  let restorationReason = null;
  let restoredBy = null;
  if (pendingRestore && pendingRestore.sourceType === "content_restoration") {
    sourceType = "content_restoration";
    sourceVersionId = pendingRestore.sourceVersionId;
    restorationReason = pendingRestore.restorationReason;
    restoredBy = pendingRestore.restoredBy || input.actorUserId || null;
  }

  await versionRepo.supersedePublishedVersions(client, organizationId, branchId);
  const versionNumber = await versionRepo.getNextVersionNumber(client, organizationId);
  const snapshot = await buildPublicationSnapshot(client, churchId, branchId);
  const changeSummary = {
    ...buildChangeSummary(snapshot, sourceType),
    publicationNote: input.publicationNote || null,
    notifyBranchAdmins: Boolean(input.notifyBranchAdmins),
    notifyHqTeam: Boolean(input.notifyHqTeam),
    publishedSubmissionIds: Array.isArray(input.publishedSubmissionIds)
      ? input.publishedSubmissionIds
      : [],
    branchId,
  };

  const version = await versionRepo.insertPublishedVersion(client, {
    organizationId,
    churchId,
    branchId,
    versionNumber,
    themeKey: snapshot.themeKey || "default",
    sourceType,
    sourceSubmissionId: input.sourceSubmissionId || null,
    sourceVersionId,
    restorationReason,
    restoredBy,
    snapshot,
    changeSummary,
    createdBy: input.actorUserId || null,
    publishedBy: input.actorUserId || null,
    publishedAt: input.publishedAt || new Date().toISOString(),
  });

      if (pendingRestore && pendingRestore.id) {
    await versionRepo.archiveDraftVersion(client, organizationId, pendingRestore.id);
  }

  try {
    const auditSvc = require("./websiteAuditService");
    await auditSvc.recordWebsiteAuditEventInTransaction(client, {
      organizationId,
      branchId,
      actorUserId: input.actorUserId || null,
      actorRole: "church_hq_admin",
      actionType:
        sourceType === "content_restoration" ? "version_restored" : "website_published",
      entityType: "website_publication_version",
      entityId: version && version.id,
      result: "success",
      metadata: {
        versionNumber: version && version.versionNumber,
        sourceType,
        branchId,
      },
    });
  } catch (auditErr) {
    throw auditErr;
  }

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

function pageMapFromSnapshot(snapshot) {
  const map = new Map();
  const pages = (snapshot && snapshot.pages) || [];
  for (const page of pages) {
    if (!page || !page.pageKey) continue;
    const sections = new Map();
    for (const section of page.sections || []) {
      if (!section || !section.sectionKey) continue;
      sections.set(section.sectionKey, section);
    }
    map.set(page.pageKey, { ...page, sectionMap: sections });
  }
  return map;
}

function normalizeText(value) {
  return String(value == null ? "" : value).trim();
}

function isHiddenStatus(status) {
  const key = String(status || "").toLowerCase();
  return key === "archived" || key === "cancelled" || key === "hidden";
}

function pushChange(changes, entry) {
  changes.push({
    id: `${entry.pageKey || "site"}:${entry.sectionKey || entry.field || "x"}:${entry.diffType}`,
    pageKey: entry.pageKey || null,
    pageTitle: entry.pageTitle || (entry.pageKey ? PAGE_KEY_TITLES[entry.pageKey] || entry.pageKey : null),
    sectionKey: entry.sectionKey || null,
    field: entry.field || null,
    label: entry.label || entry.field || "Change",
    diffType: entry.diffType,
    diffLabel: DIFF_LABELS[entry.diffType] || entry.diffType,
    category: entry.category || "layout",
    valueA: entry.valueA == null ? null : String(entry.valueA),
    valueB: entry.valueB == null ? null : String(entry.valueB),
  });
}

/**
 * Structured field/section comparison from immutable snapshots.
 * @param {object} versionA
 * @param {object} versionB
 * @param {{ pageKey?: string|null, changeType?: string|null }} [opts]
 */
function buildStructuredVersionDiff(versionA, versionB, opts) {
  const optsSafe = opts || {};
  const pageFilter = optsSafe.pageKey ? String(optsSafe.pageKey) : null;
  const changeType = optsSafe.changeType && optsSafe.changeType !== "all"
    ? String(optsSafe.changeType)
    : "all";

  const snapA = (versionA && versionA.snapshot) || {};
  const snapB = (versionB && versionB.snapshot) || {};
  const mapA = pageMapFromSnapshot(snapA);
  const mapB = pageMapFromSnapshot(snapB);
  const pageKeys = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort((a, b) => {
    const ia = PUBLIC_PAGE_KEYS.indexOf(a);
    const ib = PUBLIC_PAGE_KEYS.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const changes = [];

  const themeA = normalizeText(versionA.themeKey || snapA.themeKey || "default");
  const themeB = normalizeText(versionB.themeKey || snapB.themeKey || "default");
  if (themeA !== themeB) {
    pushChange(changes, {
      pageKey: null,
      field: "theme",
      label: "Theme",
      diffType: "modified",
      category: "layout",
      valueA: themeA,
      valueB: themeB,
    });
  }

  const navA = Array.isArray(snapA.navigation) ? snapA.navigation : null;
  const navB = Array.isArray(snapB.navigation) ? snapB.navigation : null;
  if (navA == null && navB == null) {
    pushChange(changes, {
      field: "navigation",
      label: "Navigation items",
      diffType: "unavailable",
      category: "navigation",
      valueA: null,
      valueB: null,
    });
  } else if (JSON.stringify(navA || []) !== JSON.stringify(navB || [])) {
    pushChange(changes, {
      field: "navigation",
      label: "Navigation items",
      diffType: "modified",
      category: "navigation",
      valueA: JSON.stringify(navA || []),
      valueB: JSON.stringify(navB || []),
    });
  }

  for (const pageKey of pageKeys) {
    if (pageFilter && pageFilter !== pageKey) continue;
    const pageA = mapA.get(pageKey) || null;
    const pageB = mapB.get(pageKey) || null;
    const pageTitle =
      (pageB && pageB.title) ||
      (pageA && pageA.title) ||
      PAGE_KEY_TITLES[pageKey] ||
      pageKey;

    if (!pageA && pageB) {
      pushChange(changes, {
        pageKey,
        pageTitle,
        field: "page",
        label: "Page",
        diffType: "added",
        category: "layout",
        valueA: null,
        valueB: pageTitle,
      });
      continue;
    }
    if (pageA && !pageB) {
      pushChange(changes, {
        pageKey,
        pageTitle,
        field: "page",
        label: "Page",
        diffType: "removed",
        category: "layout",
        valueA: pageTitle,
        valueB: null,
      });
      continue;
    }

    if (normalizeText(pageA.title) !== normalizeText(pageB.title)) {
      pushChange(changes, {
        pageKey,
        pageTitle,
        field: "title",
        label: "Page title",
        diffType: "modified",
        category: "text",
        valueA: pageA.title,
        valueB: pageB.title,
      });
    }

    const sectionKeys = Array.from(
      new Set([...pageA.sectionMap.keys(), ...pageB.sectionMap.keys()])
    ).sort();

    for (const sectionKey of sectionKeys) {
      const secA = pageA.sectionMap.get(sectionKey) || null;
      const secB = pageB.sectionMap.get(sectionKey) || null;

      if (!secA && secB) {
        pushChange(changes, {
          pageKey,
          pageTitle,
          sectionKey,
          field: "section",
          label: secB.heading || sectionKey,
          diffType: "added",
          category: "layout",
          valueA: null,
          valueB: secB.heading || sectionKey,
        });
        continue;
      }
      if (secA && !secB) {
        pushChange(changes, {
          pageKey,
          pageTitle,
          sectionKey,
          field: "section",
          label: secA.heading || sectionKey,
          diffType: "removed",
          category: "layout",
          valueA: secA.heading || sectionKey,
          valueB: null,
        });
        continue;
      }

      const orderA = Number(secA.sortOrder);
      const orderB = Number(secB.sortOrder);
      if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderA !== orderB) {
        pushChange(changes, {
          pageKey,
          pageTitle,
          sectionKey,
          field: "sortOrder",
          label: "Section order",
          diffType: "moved",
          category: "layout",
          valueA: String(orderA),
          valueB: String(orderB),
        });
      }

      const hiddenA = isHiddenStatus(secA.status);
      const hiddenB = isHiddenStatus(secB.status);
      if (hiddenA !== hiddenB) {
        pushChange(changes, {
          pageKey,
          pageTitle,
          sectionKey,
          field: "visibility",
          label: "Section visibility",
          diffType: hiddenB ? "hidden" : "shown",
          category: "visibility",
          valueA: secA.status,
          valueB: secB.status,
        });
      }

      if (normalizeText(secA.heading) !== normalizeText(secB.heading)) {
        pushChange(changes, {
          pageKey,
          pageTitle,
          sectionKey,
          field: "heading",
          label: "Section heading",
          diffType: "modified",
          category: "text",
          valueA: secA.heading,
          valueB: secB.heading,
        });
      }

      if (normalizeText(secA.bodyText) !== normalizeText(secB.bodyText)) {
        pushChange(changes, {
          pageKey,
          pageTitle,
          sectionKey,
          field: "bodyText",
          label: "Section text",
          diffType: "modified",
          category: "text",
          valueA: secA.bodyText,
          valueB: secB.bodyText,
        });
      }

      if (normalizeText(secA.mediaUrl) !== normalizeText(secB.mediaUrl)) {
        pushChange(changes, {
          pageKey,
          pageTitle,
          sectionKey,
          field: "mediaUrl",
          label: "Image or media",
          diffType: "modified",
          category: "images",
          valueA: secA.mediaUrl,
          valueB: secB.mediaUrl,
        });
      }
    }
  }

  const dataFields = [
    ["serviceTimeRefs", "Service-time references"],
    ["contactDetailRefs", "Contact-detail references"],
    ["branchContentRefs", "Branch-scoped content references"],
  ];
  for (const [field, label] of dataFields) {
    const a = snapA[field];
    const b = snapB[field];
    if (a == null && b == null) {
      pushChange(changes, {
        field,
        label,
        diffType: "unavailable",
        category: "data",
        valueA: null,
        valueB: null,
      });
    } else if (JSON.stringify(a || []) !== JSON.stringify(b || [])) {
      pushChange(changes, {
        field,
        label,
        diffType: "modified",
        category: "data",
        valueA: JSON.stringify(a || []),
        valueB: JSON.stringify(b || []),
      });
    }
  }

  const filtered =
    changeType === "all"
      ? changes.filter((c) => c.diffType !== "unavailable" || c.category === "navigation" || c.category === "data")
      : changes.filter((c) => c.category === changeType);

  const meaningful = filtered.filter((c) => c.diffType !== "unchanged");
  const pagesPresent = pageKeys.map((key) => ({
    key,
    title: PAGE_KEY_TITLES[key] || key,
  }));

  return {
    changes: meaningful,
    totalChanges: meaningful.filter((c) => c.diffType !== "unavailable").length,
    pagesPresent,
    changeTypeFilters: CHANGE_TYPE_FILTERS,
    diffLabels: DIFF_LABELS,
    themeChanged: themeA !== themeB,
    navigationChanged:
      navA != null &&
      navB != null &&
      JSON.stringify(navA) !== JSON.stringify(navB),
  };
}

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   baseVersionId?: string|null,
 *   compareVersionId?: string|null,
 *   pageKey?: string|null,
 *   changeType?: string|null,
 * }} opts
 */
async function compareVersions(db, opts) {
  const organizationId = opts && opts.organizationId;
  if (!versionRepo.isUuid(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }

  let baseVersionId = opts.baseVersionId || null;
  let compareVersionId = opts.compareVersionId || null;

  try {
    const current = await versionRepo.getCurrentPublishedVersion(db, organizationId);

    if (!baseVersionId && !compareVersionId) {
      return {
        ok: false,
        status: STATUS.INVALID_INPUT,
        reason: "missing_versions",
        message: "Select two versions to compare.",
      };
    }

    if (baseVersionId && !compareVersionId && current) {
      compareVersionId = current.id;
    }
    if (!baseVersionId && compareVersionId && current && compareVersionId !== current.id) {
      baseVersionId = current.id;
    }

    if (!versionRepo.isUuid(baseVersionId) || !versionRepo.isUuid(compareVersionId)) {
      return {
        ok: false,
        status: STATUS.INVALID_INPUT,
        reason: "ambiguous_versions",
        message: "Version comparison requires two valid version IDs.",
      };
    }

    if (baseVersionId === compareVersionId) {
      return {
        ok: false,
        status: STATUS.INVALID_INPUT,
        reason: "same_version",
        message: "Choose two different versions to compare.",
      };
    }

    const pair = await versionRepo.loadVersionPair(
      db,
      organizationId,
      baseVersionId,
      compareVersionId
    );
    if (!pair.a || !pair.b) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "version_pair" };
    }

    let versionA = pair.a;
    let versionB = pair.b;
    // Prefer older as Version A when both have published timestamps.
    if (
      versionA.publishedAt &&
      versionB.publishedAt &&
      new Date(versionA.publishedAt).getTime() > new Date(versionB.publishedAt).getTime()
    ) {
      const tmp = versionA;
      versionA = versionB;
      versionB = tmp;
    } else if (
      !versionA.publishedAt &&
      versionB.publishedAt &&
      versionA.versionNumber > versionB.versionNumber
    ) {
      /* keep query order */
    }

    const diff = buildStructuredVersionDiff(versionA, versionB, {
      pageKey: opts.pageKey || null,
      changeType: opts.changeType || "all",
    });

    const previousForB = await versionRepo.loadPreviousPublishedVersion(
      db,
      organizationId,
      versionB.versionNumber
    );

    return {
      ok: true,
      status: STATUS.OK,
      versionA,
      versionB,
      current,
      previousForB,
      diff,
      filters: {
        baseVersionId: versionA.id,
        compareVersionId: versionB.id,
        page: opts.pageKey || "",
        changeType: opts.changeType || "all",
      },
      statusLabels: STATUS_LABELS,
      sourceLabels: SOURCE_LABELS,
      pageTitles: PAGE_KEY_TITLES,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "compare" };
  }
}

/**
 * Historical version preview model (immutable snapshot only).
 * @param {import('pg').Pool} db
 * @param {{ organizationId: string, versionId: string }} opts
 */
async function loadHistoricalVersionPreview(db, opts) {
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
    const snapshot = version.snapshot || {};
    const pages = Array.isArray(snapshot.pages) ? snapshot.pages : [];
    return {
      ok: true,
      status: STATUS.OK,
      version,
      pages,
      themeKey: version.themeKey || snapshot.themeKey || "default",
      statusLabels: STATUS_LABELS,
      sourceLabels: SOURCE_LABELS,
      pageTitles: PAGE_KEY_TITLES,
      readOnly: true,
      noIndex: true,
      banner: "Historical Version Preview",
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "preview" };
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {{ organizationId: string, versionId: string }} opts
 */
async function prepareVersionRestore(db, opts) {
  if (!versionRepo.isUuid(opts.organizationId) || !versionRepo.isUuid(opts.versionId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    const [historical, current] = await Promise.all([
      versionRepo.getVersionByOrgAndId(db, opts.organizationId, opts.versionId),
      versionRepo.getCurrentPublishedVersion(db, opts.organizationId),
    ]);
    if (!historical) return { ok: false, status: STATUS.NOT_FOUND, reason: "version" };
    if (historical.status === "draft") {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "draft_source" };
    }

    const snap = historical.snapshot || {};
    const pages = Array.isArray(snap.pages) ? snap.pages : [];
    const pageOptions = pages.map((p) => ({
      key: p.pageKey,
      title: p.title || PAGE_KEY_TITLES[p.pageKey] || p.pageKey,
      sectionCount: Array.isArray(p.sections) ? p.sections.length : 0,
      selected: true,
    }));

    return {
      ok: true,
      status: STATUS.OK,
      historical,
      current,
      pageOptions,
      themeHistorical: historical.themeKey || snap.themeKey || "default",
      themeCurrent: (current && (current.themeKey || (current.snapshot || {}).themeKey)) || "default",
      statusLabels: STATUS_LABELS,
      sourceLabels: SOURCE_LABELS,
      pageTitles: PAGE_KEY_TITLES,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "prepare_restore" };
  }
}

/**
 * Apply snapshot pages into draft public_pages / page_sections. Never mutates live publish flag.
 * @param {import('pg').PoolClient} client
 * @param {string} churchId
 * @param {object} snapshotPage
 * @param {string|null} [branchId]
 */
async function applySnapshotPageToDraft(client, churchId, snapshotPage, branchId) {
  const pageKey = snapshotPage.pageKey;
  if (!pageKey) return;
  const title = snapshotPage.title || PAGE_KEY_TITLES[pageKey] || pageKey;
  const scopedBranchId = branchId != null && String(branchId).trim() ? String(branchId).trim() : null;
  const ensured = await publicContentRepo.ensureDraftPage(client, {
    churchId,
    branchId: scopedBranchId,
    pageKey,
    title,
  });
  const page = ensured && ensured.page;
  if (!page) return;

  await publicContentRepo.updatePage(client, page.id, {
    title,
    status: "draft",
  });

  const sections = Array.isArray(snapshotPage.sections) ? snapshotPage.sections : [];
  for (const sec of sections) {
    if (!sec || !sec.sectionKey) continue;
    const existing = await publicContentRepo.findSectionByPageAndKey(
      client,
      page.id,
      sec.sectionKey
    );
    const patch = {
      sectionType: sec.sectionType || "text",
      sortOrder: sec.sortOrder != null ? sec.sortOrder : 0,
      status: "draft",
    };
    if (sec.heading != null && String(sec.heading).length > 0) {
      patch.heading = sec.heading;
    }
    if (sec.bodyText != null && String(sec.bodyText).length > 0) {
      patch.bodyText = sec.bodyText;
    }
    if (sec.mediaUrl != null && String(sec.mediaUrl).length > 0) {
      patch.mediaUrl = sec.mediaUrl;
    }
    if (existing) {
      await publicContentRepo.updateSection(client, existing.id, patch);
    } else {
      await publicContentRepo.insertSection(client, {
        pageId: page.id,
        sectionKey: sec.sectionKey,
        sectionType: patch.sectionType,
        heading: patch.heading || null,
        bodyText: patch.bodyText || null,
        mediaUrl: patch.mediaUrl || null,
        sortOrder: patch.sortOrder,
        status: "draft",
      });
    }
  }
}

/**
 * Restore historical version into a new draft (never publishes live).
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   versionId: string,
 *   actorUserId: string,
 *   restorationReason: string,
 *   selectedPageKeys: string[],
 *   restoreTheme?: boolean,
 *   restoreNavigation?: boolean,
 *   confirmed?: boolean,
 * }} opts
 */
async function createRestoredDraft(db, opts) {
  const organizationId = opts && opts.organizationId;
  const churchId = opts && opts.churchId;
  const versionId = opts && opts.versionId;
  const actorUserId = opts && opts.actorUserId;
  const reason = normalizeText(opts && opts.restorationReason);

  if (
    !versionRepo.isUuid(organizationId) ||
    !versionRepo.isUuid(churchId) ||
    !versionRepo.isUuid(versionId) ||
    !versionRepo.isUuid(actorUserId)
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  if (!reason || reason.length < 1 || reason.length > 2000) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "restoration_reason" };
  }
  if (!opts.confirmed) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "confirmation" };
  }

  try {
    const approvalSettingsSvc = require("./websiteApprovalSettingsService");
    const settingsLoad = await approvalSettingsSvc.loadEffectiveSettings(db, organizationId);
    if (
      settingsLoad.ok &&
      settingsLoad.settings &&
      settingsLoad.settings.requireRestoreApproval
    ) {
      if (!reason || reason.length < 3) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "restore_approval_note" };
      }
    }
  } catch {
    /* settings optional; continue with existing validation */
  }

  const selected = Array.isArray(opts.selectedPageKeys)
    ? opts.selectedPageKeys.map((k) => String(k)).filter(Boolean)
    : [];
  if (!selected.length) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "pages" };
  }

  try {
    return await withTransaction(db, async (client) => {
      const historical = await versionRepo.getVersionByOrgAndId(
        client,
        organizationId,
        versionId
      );
      if (!historical) {
        return { ok: false, status: STATUS.NOT_FOUND, reason: "version" };
      }
      if (historical.organizationId !== organizationId) {
        return { ok: false, status: STATUS.NOT_FOUND, reason: "version" };
      }
      if (String(historical.churchId) !== String(churchId)) {
        return { ok: false, status: STATUS.NOT_FOUND, reason: "version" };
      }

      const restoreBranchId = historical.branchId || null;

      // Re-load snapshot only; never mutate the historical row.
      const snapshotBefore = JSON.stringify(historical.snapshot || {});
      const snap = historical.snapshot || {};
      const allPages = Array.isArray(snap.pages) ? snap.pages : [];
      const selectedSet = new Set(selected);
      const pagesToRestore = allPages.filter((p) => selectedSet.has(p.pageKey));
      if (!pagesToRestore.length) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "pages" };
      }

      for (const page of pagesToRestore) {
        await applySnapshotPageToDraft(client, churchId, page, restoreBranchId);
      }

      const restoredSnapshot = {
        themeKey:
          opts.themeKeyOverride != null && String(opts.themeKeyOverride).trim()
            ? String(opts.themeKeyOverride).trim().slice(0, 80)
            : opts.restoreTheme !== false
              ? historical.themeKey || snap.themeKey || "default"
              : opts.currentThemeKey || "default",
        branchId: restoreBranchId,
        pageKeys: pagesToRestore.map((p) => p.pageKey),
        pages: pagesToRestore,
        navigation: opts.restoreNavigation ? snap.navigation || [] : [],
        sourceVersionId: historical.id,
        restoredPageKeys: pagesToRestore.map((p) => p.pageKey),
      };

      const versionNumber = await versionRepo.getNextVersionNumber(client, organizationId);
      const draftVersion = await versionRepo.insertDraftRestorationVersion(client, {
        organizationId,
        churchId,
        branchId: restoreBranchId,
        versionNumber,
        themeKey: restoredSnapshot.themeKey,
        sourceVersionId: historical.id,
        restorationReason: reason,
        restoredBy: actorUserId,
        snapshot: restoredSnapshot,
        changeSummary: {
          pagesChanged: restoredSnapshot.pageKeys,
          pageCount: restoredSnapshot.pageKeys.length,
          sectionCount: pagesToRestore.reduce(
            (n, p) => n + ((p.sections && p.sections.length) || 0),
            0
          ),
          sourceType: "content_restoration",
          sourceVersionNumber: historical.versionNumber,
          branchId: restoreBranchId,
        },
      });

      const historicalAfter = await versionRepo.getVersionByOrgAndId(
        client,
        organizationId,
        versionId
      );
      if (JSON.stringify((historicalAfter && historicalAfter.snapshot) || {}) !== snapshotBefore) {
        throw Object.assign(new Error("historical_snapshot_mutated"), {
          code: "HISTORICAL_MUTATION",
        });
      }

      const auditSvc = require("./websiteAuditService");
      await auditSvc.recordWebsiteAuditEventInTransaction(client, {
        organizationId,
        branchId: restoreBranchId,
        actorUserId,
        actorRole: "church_hq_admin",
        actionType: "version_restored",
        entityType: "website_publication_version",
        entityId: draftVersion.id,
        result: "success",
        metadata: {
          sourceVersionId: historical.id,
          restoredPageKeys: restoredSnapshot.pageKeys,
          branchId: restoreBranchId,
        },
      });

      return {
        ok: true,
        status: STATUS.OK,
        draftVersion,
        historical,
        restoredPageKeys: restoredSnapshot.pageKeys,
        branchId: restoreBranchId,
        message: "A restored draft has been created. Review it before publishing.",
      };
    });
  } catch (err) {
    if (err && err.code === "HISTORICAL_MUTATION") {
      return { ok: false, status: STATUS.CONFLICT, reason: "historical_immutable" };
    }
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: "restore",
      detail: err && (err.code || err.message) ? String(err.code || err.message) : "unknown",
    };
  }
}

function eventTypeForVersion(version, previous) {
  if (version.sourceType === "content_restoration") return "restored_version_published";
  if (version.sourceType === "branch_submission") return "branch_changes_published";
  if (version.sourceType === "theme_change") return "theme_activated";
  if (previous && previous.status) return "website_republished";
  return "website_published";
}

/**
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   sourceType?: string|null,
 *   publishedBy?: string|null,
 *   themeKey?: string|null,
 *   from?: string|null,
 *   to?: string|null,
 * }} opts
 */
async function listPublishingHistory(db, opts) {
  const organizationId = opts && opts.organizationId;
  if (!versionRepo.isUuid(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }
  try {
    const [list, current, publishers, themeKeys] = await Promise.all([
      versionRepo.listPublishingHistory(db, {
        organizationId,
        sourceType: opts.sourceType || null,
        publishedBy: opts.publishedBy || null,
        themeKey: opts.themeKey || null,
        from: opts.from || null,
        to: opts.to || null,
      }),
      versionRepo.getCurrentPublishedVersion(db, organizationId),
      versionRepo.listPublishers(db, organizationId),
      versionRepo.listThemeKeys(db, organizationId),
    ]);

    const items = [];
    for (const version of list.items) {
      const previous = await versionRepo.loadPreviousPublishedVersion(
        db,
        organizationId,
        version.versionNumber
      );
      const eventType = eventTypeForVersion(version, previous);
      items.push({
        version,
        eventType,
        eventLabel: EVENT_TYPE_LABELS[eventType] || eventType,
        previousVersion: previous,
        isCurrent: Boolean(current && current.id === version.id),
        pagesAffected:
          (version.changeSummary &&
            (version.changeSummary.pagesChanged || version.changeSummary.pageKeys)) ||
          (version.snapshot && version.snapshot.pageKeys) ||
          [],
        publicationNote:
          (version.changeSummary && version.changeSummary.publicationNote) || null,
        scopeLabel: "Church-wide",
      });
    }

    return {
      ok: true,
      status: STATUS.OK,
      items,
      total: list.total,
      current,
      publishers,
      themeKeys,
      filters: {
        sourceType: opts.sourceType || "",
        publishedBy: opts.publishedBy || "",
        themeKey: opts.themeKey || "",
        from: opts.from || "",
        to: opts.to || "",
      },
      statusLabels: STATUS_LABELS,
      sourceLabels: SOURCE_LABELS,
      eventTypeLabels: EVENT_TYPE_LABELS,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "publishing_history" };
  }
}

/**
 * @param {string|null|undefined} sourceType
 */
function friendlySourceLabel(sourceType) {
  const key = String(sourceType || "").trim();
  if (!key) return FRIENDLY_SOURCE_FALLBACK;
  return FRIENDLY_SOURCE_LABELS[key] || FRIENDLY_SOURCE_FALLBACK;
}

/**
 * @param {object|null} version
 */
function buildFriendlyChangeSummary(version) {
  const summary = (version && version.changeSummary) || {};
  if (summary.publicationNote && String(summary.publicationNote).trim()) {
    const note = String(summary.publicationNote).trim();
    if (note.length <= 220) return note;
  }
  const pages = Array.isArray(summary.pagesChanged)
    ? summary.pagesChanged
    : Array.isArray(summary.pageKeys)
      ? summary.pageKeys
      : [];
  const pageLabels = pages
    .map((k) => PAGE_KEY_TITLES[k] || k)
    .filter(Boolean)
    .slice(0, 4);
  const branches = Array.isArray(summary.branchesAffected)
    ? summary.branchesAffected.filter(Boolean)
    : [];
  if (pageLabels.length && branches.length) {
    return `${pageLabels.join(" and ")} updated · ${branches[0]} included`;
  }
  if (pageLabels.length === 1) return `${pageLabels[0]} updated`;
  if (pageLabels.length > 1) return `${pageLabels.join(" and ")} updated`;
  if (branches.length) return `${branches[0]} updates published`;
  if (summary.themeChanges) return "Website theme and navigation updated";
  return "Website changes were published.";
}

/**
 * @param {object|null} version
 * @param {{ isCurrent?: boolean, organizationKey?: string|null }} opts
 */
function presentGrowthPublicationCard(version, opts) {
  if (!version) return null;
  const summary = version.changeSummary || {};
  const pages = Array.isArray(summary.pagesChanged)
    ? summary.pagesChanged
    : Array.isArray(summary.pageKeys)
      ? summary.pageKeys
      : [];
  const branches = Array.isArray(summary.branchesAffected)
    ? summary.branchesAffected.filter(Boolean)
    : [];
  const isCurrent = Boolean(opts && opts.isCurrent);
  return {
    id: version.id,
    label: isCurrent ? "Current Website" : "Previous Website",
    isCurrent,
    publishedAt: version.publishedAt,
    publishedByName: version.publishedByName || null,
    themeKey: version.themeKey || "default",
    sourceLabel: friendlySourceLabel(version.sourceType),
    changeSummary: buildFriendlyChangeSummary(version),
    pagesChanged: pages.map((k) => PAGE_KEY_TITLES[k] || k).slice(0, 8),
    branchesAffected: branches.slice(0, 8),
    previewAvailable: !isCurrent,
    previewHref: isCurrent
      ? null
      : `/hq/website/recent-changes/${version.id}/preview`,
    canRestore: !isCurrent,
    restoreHref: isCurrent
      ? null
      : `/hq/website/recent-changes/${version.id}/restore`,
  };
}

/**
 * Growth-plan recent website changes (current + ≤5 previous).
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   organizationKey?: string|null,
 *   planKey?: string|null,
 *   env?: object,
 * }} opts
 */
async function loadGrowthRecentWebsiteChanges(db, opts) {
  const organizationId = opts && opts.organizationId;
  const churchId = opts && opts.churchId;
  if (!versionRepo.isUuid(organizationId) || !versionRepo.isUuid(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }

  const { evaluatePublishReadiness } = require("./churchWebsitePublishService");
  const readiness = await evaluatePublishReadiness(db, {
    churchId,
    deferServiceTimes: true,
    env: opts.env,
  });
  const planKey = String(
    (opts.planKey != null ? opts.planKey : readiness && readiness.planKey) || ""
  )
    .trim()
    .toLowerCase();
  const { normalizePlanKey } = require("./websiteOverviewService");
  const normalized = normalizePlanKey(planKey);

  // Growth recent-changes is Growth+ (Network inherits Growth website tools).
  if (normalized !== "growth" && normalized !== "network") {
    return {
      ok: false,
      status: STATUS.FORBIDDEN || "forbidden",
      reason: "plan_not_growth",
      planKey: normalized,
    };
  }

  try {
    const current = await versionRepo.loadCurrentWebsitePublication(db, organizationId);
    const previousList = await versionRepo.listRecentWebsitePublications(db, {
      organizationId,
      limit: GROWTH_PREVIOUS_LIMIT,
      excludeId: current ? current.id : null,
    });
    const { publicChurchHomePath } = require("../urls/churchUrlHelper");
    const orgKey =
      opts.organizationKey || (readiness && readiness.organizationKey) || null;

    return {
      ok: true,
      status: STATUS.OK,
      planKey: "growth",
      stitchScreen: "Phase4 - Recent Website Changes",
      title: "Recent Website Changes",
      subtitle: "Review the latest published website updates",
      retentionLimit: GROWTH_PREVIOUS_LIMIT,
      retentionNotice:
        "Your five most recent published websites are available for recovery.",
      canRestore: true,
      overviewPath: "/hq/website",
      publicPath: publicChurchHomePath(orgKey),
      restoredDraftPath: "/hq/website/restored-draft",
      currentWebsite: presentGrowthPublicationCard(current, {
        isCurrent: true,
        organizationKey: orgKey,
      }),
      previousWebsites: (previousList.items || []).map((v) =>
        presentGrowthPublicationCard(v, { isCurrent: false, organizationKey: orgKey })
      ),
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "recent_changes" };
  }
}

/**
 * Growth-plan previous website historical preview (immutable snapshot).
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   publicationId: string,
 *   organizationKey?: string|null,
 *   planKey?: string|null,
 *   env?: object,
 * }} opts
 */
async function loadGrowthPreviousWebsitePreview(db, opts) {
  const organizationId = opts && opts.organizationId;
  const churchId = opts && opts.churchId;
  const publicationId = opts && opts.publicationId;
  if (
    !versionRepo.isUuid(organizationId) ||
    !versionRepo.isUuid(churchId) ||
    !versionRepo.isUuid(publicationId)
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }

  const listGate = await loadGrowthRecentWebsiteChanges(db, {
    organizationId,
    churchId,
    organizationKey: opts.organizationKey,
    planKey: opts.planKey,
    env: opts.env,
  });
  if (!listGate.ok) {
    return listGate;
  }

  try {
    const version = await versionRepo.loadHistoricalPublicationPreview(
      db,
      organizationId,
      publicationId
    );
    if (!version || !version.publishedAt) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "publication" };
    }
    if (!["published", "superseded"].includes(String(version.status || ""))) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "status" };
    }

    const current = await versionRepo.getCurrentPublishedVersion(db, organizationId);
    if (current && current.id === version.id) {
      return {
        ok: false,
        status: STATUS.INVALID_INPUT,
        reason: "is_current",
        redirectTo: listGate.publicPath || "/hq/website/recent-changes",
      };
    }

    const snapshot = version.snapshot || {};
    const pages = Array.isArray(snapshot.pages) ? snapshot.pages : [];
    const publicPages = pages.map((page) => ({
      pageKey: page.pageKey,
      title: page.title || PAGE_KEY_TITLES[page.pageKey] || page.pageKey,
      sections: Array.isArray(page.sections)
        ? page.sections.map((sec) => ({
            sectionKey: sec.sectionKey,
            heading: sec.heading || null,
            bodyText: sec.bodyText || null,
            mediaUrl: sec.mediaUrl || null,
            status: sec.status || null,
          }))
        : [],
    }));

    return {
      ok: true,
      status: STATUS.OK,
      planKey: "growth",
      stitchScreen: "Phase4 - Previous Website Preview",
      bannerTitle: "Previous Website Preview",
      bannerSubtitle: "This is a saved website from an earlier publication.",
      recentChangesPath: "/hq/website/recent-changes",
      publication: presentGrowthPublicationCard(version, { isCurrent: false }),
      publishedAt: version.publishedAt,
      publishedByName: version.publishedByName || null,
      themeKey: version.themeKey || snapshot.themeKey || "default",
      changeSummary: buildFriendlyChangeSummary(version),
      pages: publicPages,
      pageTitles: PAGE_KEY_TITLES,
      readOnly: true,
      noIndex: true,
      canRestore: true,
      restoreHref: `/hq/website/recent-changes/${version.id}/restore`,
      draftMutated: false,
      liveMutated: false,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "growth_preview" };
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {string} churchId
 */
async function churchHasUnpublishedDraftPages(db, churchId) {
  const res = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM blessboard.public_pages
      WHERE church_id = $1
        AND branch_id IS NULL
        AND status = 'draft'
        AND page_key = ANY($2::text[])`,
    [churchId, PUBLIC_PAGE_KEYS.slice()]
  );
  return Boolean(res.rows[0] && Number(res.rows[0].n) > 0);
}

/**
 * Collect missing media warnings from a snapshot.
 * @param {object} snapshot
 */
function collectMissingMediaWarnings(snapshot) {
  const warnings = [];
  const pages = Array.isArray(snapshot && snapshot.pages) ? snapshot.pages : [];
  for (const page of pages) {
    for (const sec of page.sections || []) {
      if (sec && sec.mediaUrl != null && String(sec.mediaUrl).trim() === "") {
        warnings.push({
          pageKey: page.pageKey,
          sectionKey: sec.sectionKey,
          message:
            "One image from the previous website is no longer available. Replace it before publishing.",
        });
      }
    }
  }
  return warnings;
}

/**
 * Growth restore confirmation screen model.
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   publicationId: string,
 *   organizationKey?: string|null,
 *   planKey?: string|null,
 *   env?: object,
 * }} opts
 */
async function prepareGrowthRestorePreviousWebsite(db, opts) {
  const previewGate = await loadGrowthPreviousWebsitePreview(db, opts);
  if (!previewGate.ok) return previewGate;

  const organizationId = opts.organizationId;
  const churchId = opts.churchId;
  const publicationId = opts.publicationId;

  const eligible = await loadGrowthRecentWebsiteChanges(db, opts);
  if (!eligible.ok) return eligible;
  const allowedIds = new Set(
    (eligible.previousWebsites || []).map((p) => p.id).filter(Boolean)
  );
  if (!allowedIds.has(publicationId)) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "not_eligible_backup" };
  }

  const hasDraft = await churchHasUnpublishedDraftPages(db, churchId);
  const pendingRestore = await versionRepo.getLatestDraftRestoration(db, organizationId);
  const themeHistorical = previewGate.themeKey || "default";
  const themeCurrent =
    (eligible.currentWebsite && eligible.currentWebsite.themeKey) || "default";
  const themesDiffer = String(themeHistorical) !== String(themeCurrent);

  return {
    ok: true,
    status: STATUS.OK,
    planKey: "growth",
    stitchScreen: "Phase4 - Restore Previous Website",
    title: "Restore Previous Website",
    subtitle: "Create a draft using this earlier website",
    publication: previewGate.publication,
    publishedAt: previewGate.publishedAt,
    publishedByName: previewGate.publishedByName,
    changeSummary: previewGate.changeSummary,
    themeHistorical,
    themeCurrent,
    themesDiffer,
    previousThemeAllowed: true,
    previewHref: `/hq/website/recent-changes/${publicationId}/preview`,
    recentChangesPath: "/hq/website/recent-changes",
    overviewPath: "/hq/website",
    editPath: "/hq/content",
    draftPreviewPath: "/hq/content/preview/home",
    hasConflictingDraft: hasDraft && !(pendingRestore && pendingRestore.sourceVersionId === publicationId),
    existingRestoredDraft:
      pendingRestore && pendingRestore.sourceVersionId === publicationId
        ? pendingRestore
        : null,
    safetyNotice:
      "Your live website will stay unchanged. A new draft will be created for you to review and publish.",
  };
}

/**
 * Create Growth restored website draft (complete website).
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   publicationId: string,
 *   actorUserId: string,
 *   themeChoice?: 'keep_current'|'use_previous',
 *   restorationNote?: string|null,
 *   confirmed?: boolean,
 *   organizationKey?: string|null,
 *   planKey?: string|null,
 *   env?: object,
 * }} opts
 */
async function createGrowthRestoredWebsiteDraft(db, opts) {
  const prepared = await prepareGrowthRestorePreviousWebsite(db, opts);
  if (!prepared.ok) {
    try {
      const auditSvc = require("./websiteAuditService");
      await auditSvc.recordWebsiteAuditEvent(db, {
        organizationId: opts.organizationId,
        actorUserId: opts.actorUserId || null,
        actorRole: "church_hq_admin",
        actionType: "previous_website_restore_failed",
        entityType: "website_publication_version",
        entityId: opts.publicationId || null,
        result: "failed",
        metadata: { reason: prepared.reason || "prepare_failed" },
      });
    } catch (_err) {
      // ignore audit failure on failed prepare
    }
    return prepared;
  }

  if (prepared.hasConflictingDraft) {
    return {
      ok: false,
      status: STATUS.CONFLICT,
      reason: "draft_conflict",
      message:
        "You already have unpublished website changes. Finish or discard them before restoring a previous website.",
    };
  }

  if (!opts.confirmed) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "confirmation" };
  }

  if (prepared.existingRestoredDraft && prepared.existingRestoredDraft.id) {
    return {
      ok: true,
      status: STATUS.OK,
      idempotent: true,
      draftVersion: prepared.existingRestoredDraft,
      redirectTo: "/hq/website/restored-draft",
      message: "A restored draft is already available for review.",
    };
  }

  const themeChoice =
    opts.themeChoice === "use_previous" && prepared.previousThemeAllowed
      ? "use_previous"
      : "keep_current";

  const historical = await versionRepo.getVersionByOrgAndId(
    db,
    opts.organizationId,
    opts.publicationId
  );
  if (!historical) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "publication" };
  }
  const snap = historical.snapshot || {};
  const allPages = Array.isArray(snap.pages) ? snap.pages : [];
  const selectedPageKeys = allPages.map((p) => p.pageKey).filter(Boolean);
  if (!selectedPageKeys.length) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "snapshot_incomplete" };
  }

  const note = normalizeText(opts.restorationNote);
  const reason =
    note && note.length
      ? note
      : "Restored previous website as draft for review.";

  try {
    const auditSvc = require("./websiteAuditService");
    await auditSvc.recordWebsiteAuditEvent(db, {
      organizationId: opts.organizationId,
      actorUserId: opts.actorUserId || null,
      actorRole: "church_hq_admin",
      actionType: "previous_website_restore_started",
      entityType: "website_publication_version",
      entityId: opts.publicationId,
      result: "success",
      metadata: { themeChoice },
    });
  } catch (_err) {
    // continue; restore itself records success audit
  }

  const liveBefore = await versionRepo.getCurrentPublishedVersion(db, opts.organizationId);

  const result = await createRestoredDraft(db, {
    organizationId: opts.organizationId,
    churchId: opts.churchId,
    versionId: opts.publicationId,
    actorUserId: opts.actorUserId,
    restorationReason: reason,
    selectedPageKeys,
    restoreTheme: themeChoice === "use_previous",
    currentThemeKey: prepared.themeCurrent || "default",
    themeKeyOverride:
      themeChoice === "use_previous"
        ? prepared.themeHistorical
        : prepared.themeCurrent || "default",
    restoreNavigation: true,
    confirmed: true,
  });

  if (!result.ok) {
    try {
      const auditSvc = require("./websiteAuditService");
      await auditSvc.recordWebsiteAuditEvent(db, {
        organizationId: opts.organizationId,
        actorUserId: opts.actorUserId || null,
        actorRole: "church_hq_admin",
        actionType: "previous_website_restore_failed",
        entityType: "website_publication_version",
        entityId: opts.publicationId,
        result: "failed",
        metadata: { reason: result.reason || "restore_failed" },
      });
    } catch (_err) {
      // ignore
    }
    return result;
  }

  // Prefer Growth-friendly audit name in addition to version_restored from createRestoredDraft.
  try {
    const auditSvc = require("./websiteAuditService");
    await auditSvc.recordWebsiteAuditEvent(db, {
      organizationId: opts.organizationId,
      actorUserId: opts.actorUserId || null,
      actorRole: "church_hq_admin",
      actionType: "previous_website_restored_as_draft",
      entityType: "website_publication_version",
      entityId: result.draftVersion && result.draftVersion.id,
      result: "success",
      metadata: {
        sourcePublicationId: opts.publicationId,
        themeChoice,
      },
    });
  } catch (_err) {
    // non-fatal
  }

  const liveAfter = await versionRepo.getCurrentPublishedVersion(db, opts.organizationId);
  if (liveBefore && liveAfter && liveBefore.id !== liveAfter.id) {
    return { ok: false, status: STATUS.CONFLICT, reason: "live_mutated" };
  }

  return {
    ok: true,
    status: STATUS.OK,
    draftVersion: result.draftVersion,
    historical: result.historical,
    themeChoice,
    redirectTo: "/hq/website/restored-draft",
    message: result.message,
    liveUnchanged: true,
  };
}

/**
 * Restored draft review screen.
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   organizationKey?: string|null,
 *   actorUserId?: string|null,
 *   planKey?: string|null,
 *   env?: object,
 * }} opts
 */
async function loadGrowthRestoredWebsiteDraftReview(db, opts) {
  const listGate = await loadGrowthRecentWebsiteChanges(db, opts);
  if (!listGate.ok) return listGate;

  const draft = await versionRepo.getLatestDraftRestoration(db, opts.organizationId);
  if (!draft) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "no_restored_draft" };
  }

  const source = draft.sourceVersionId
    ? await versionRepo.getVersionByOrgAndId(db, opts.organizationId, draft.sourceVersionId)
    : null;
  const snap = draft.snapshot || {};
  const warnings = collectMissingMediaWarnings(snap);
  const pageKeys = Array.isArray(snap.pageKeys)
    ? snap.pageKeys
    : Array.isArray(snap.pages)
      ? snap.pages.map((p) => p.pageKey)
      : [];

  const { validateWebsitePublication } = require("./websitePublicationValidationService");
  const validation = await validateWebsitePublication(db, {
    organizationId: opts.organizationId,
    churchId: opts.churchId,
    actorUserId: opts.actorUserId || null,
    deferServiceTimes: true,
    env: opts.env,
  });

  const readinessChecks = (validation.checks || []).map((c) => ({
    key: c.key,
    label: c.label,
    ok: Boolean(c.ok),
    state: c.ok ? "Ready" : "Needs Attention",
  }));

  try {
    const auditSvc = require("./websiteAuditService");
    await auditSvc.recordWebsiteAuditEvent(db, {
      organizationId: opts.organizationId,
      actorUserId: opts.actorUserId || null,
      actorRole: "church_hq_admin",
      actionType: "restored_draft_opened",
      entityType: "website_publication_version",
      entityId: draft.id,
      result: "success",
      metadata: {},
    });
  } catch (_err) {
    // non-fatal
  }

  return {
    ok: true,
    status: STATUS.OK,
    planKey: "growth",
    stitchScreen: "Phase4 - Restored Website Draft Review",
    title: "Restored Website Draft",
    subtitle: "Review this draft before publishing",
    statusBadge: "Draft",
    safetyNotice: "Your live website has not changed.",
    draft,
    sourcePublication: source
      ? presentGrowthPublicationCard(source, { isCurrent: false })
      : null,
    previousPublishedAt: source && source.publishedAt,
    restoredByName: draft.createdByName || null,
    restoredAt: draft.createdAt,
    restorationNote: draft.restorationReason || null,
    themeKey: draft.themeKey || snap.themeKey || "default",
    themeChoiceLabel:
      source && String(draft.themeKey) === String(source.themeKey)
        ? "Previous website theme"
        : "Current theme kept",
    pagesIncluded: pageKeys.map((k) => PAGE_KEY_TITLES[k] || k),
    branchesIncluded:
      (draft.changeSummary && draft.changeSummary.branchesAffected) || [],
    changeSummary: buildFriendlyChangeSummary(source || draft),
    warnings,
    readinessChecks,
    publishable: Boolean(validation && validation.publishable),
    previewPath: "/hq/content/preview/home",
    editPath: "/hq/content",
    publishReviewPath: "/hq/website/publish/review",
    discardPath: "/hq/website/restored-draft/discard",
    overviewPath: "/hq/website",
    recentChangesPath: "/hq/website/recent-changes",
    canDiscard: true,
  };
}

/**
 * Discard restored draft: archive restoration record and re-apply current live snapshot as published pages.
 * @param {import('pg').Pool} db
 * @param {{
 *   organizationId: string,
 *   churchId: string,
 *   actorUserId: string,
 *   planKey?: string|null,
 *   env?: object,
 * }} opts
 */
async function discardGrowthRestoredWebsiteDraft(db, opts) {
  const listGate = await loadGrowthRecentWebsiteChanges(db, opts);
  if (!listGate.ok) return listGate;

  const draft = await versionRepo.getLatestDraftRestoration(db, opts.organizationId);
  if (!draft) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "no_restored_draft" };
  }

  const current = await versionRepo.getCurrentPublishedVersion(db, opts.organizationId);
  try {
    return await withTransaction(db, async (client) => {
      if (current && current.snapshot && Array.isArray(current.snapshot.pages)) {
        for (const page of current.snapshot.pages) {
          await applySnapshotPageToDraft(client, opts.churchId, page);
          const ensured = await publicContentRepo.findPageByScope(client, {
            churchId: opts.churchId,
            branchId: null,
            pageKey: page.pageKey,
          });
          if (ensured) {
            await publicContentRepo.updatePage(client, ensured.id, {
              status: "published",
            });
            const sections = await publicContentRepo.listSectionsForPage(client, ensured.id, {});
            for (const sec of sections || []) {
              if (sec.status !== "published") {
                await publicContentRepo.updateSection(client, sec.id, { status: "published" });
              }
            }
          }
        }
      }

      await versionRepo.archiveDraftVersion(client, opts.organizationId, draft.id);

      const auditSvc = require("./websiteAuditService");
      await auditSvc.recordWebsiteAuditEventInTransaction(client, {
        organizationId: opts.organizationId,
        actorUserId: opts.actorUserId || null,
        actorRole: "church_hq_admin",
        actionType: "restored_draft_discarded",
        entityType: "website_publication_version",
        entityId: draft.id,
        result: "success",
        metadata: { sourcePublicationId: draft.sourceVersionId || null },
      });

      return {
        ok: true,
        status: STATUS.OK,
        redirectTo: "/hq/website/recent-changes",
        message: "Restored draft discarded. Live website was not changed by discard.",
      };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "discard" };
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {{ organizationId: string, versionId: string }} opts
 */
async function loadPublishingHistoryEntry(db, opts) {
  if (!versionRepo.isUuid(opts.organizationId) || !versionRepo.isUuid(opts.versionId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    const version = await versionRepo.getVersionByOrgAndId(
      db,
      opts.organizationId,
      opts.versionId
    );
    if (!version || !version.publishedAt) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "entry" };
    }
    const previous = await versionRepo.loadPreviousPublishedVersion(
      db,
      opts.organizationId,
      version.versionNumber
    );
    const current = await versionRepo.getCurrentPublishedVersion(db, opts.organizationId);
    const eventType = eventTypeForVersion(version, previous);
    return {
      ok: true,
      status: STATUS.OK,
      entry: {
        version,
        eventType,
        eventLabel: EVENT_TYPE_LABELS[eventType] || eventType,
        previousVersion: previous,
        isCurrent: Boolean(current && current.id === version.id),
      },
      statusLabels: STATUS_LABELS,
      sourceLabels: SOURCE_LABELS,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "entry" };
  }
}

module.exports = {
  STATUS,
  STATUS_LABELS,
  SOURCE_LABELS,
  DIFF_LABELS,
  CHANGE_TYPE_FILTERS,
  EVENT_TYPE_LABELS,
  buildPublicationSnapshot,
  buildChangeSummary,
  buildStructuredVersionDiff,
  recordPublishVersionInTransaction,
  loadVersionHistory,
  loadVersionDetail,
  compareVersions,
  loadHistoricalVersionPreview,
  prepareVersionRestore,
  createRestoredDraft,
  listPublishingHistory,
  loadPublishingHistoryEntry,
  loadGrowthRecentWebsiteChanges,
  loadGrowthPreviousWebsitePreview,
  prepareGrowthRestorePreviousWebsite,
  createGrowthRestoredWebsiteDraft,
  loadGrowthRestoredWebsiteDraftReview,
  discardGrowthRestoredWebsiteDraft,
  friendlySourceLabel,
  FRIENDLY_SOURCE_LABELS,
  GROWTH_PREVIOUS_LIMIT,
};
