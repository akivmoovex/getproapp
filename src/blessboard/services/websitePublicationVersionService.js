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
  if (!versionRepo.isUuid(organizationId) || !versionRepo.isUuid(churchId)) {
    throw Object.assign(new Error("invalid_version_scope"), { code: "INVALID_VERSION_SCOPE" });
  }

  const pendingRestore = await versionRepo.getLatestDraftRestoration(client, organizationId);
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

  await versionRepo.supersedePublishedVersions(client, organizationId);
  const versionNumber = await versionRepo.getNextVersionNumber(client, organizationId);
  const snapshot = await buildPublicationSnapshot(client, churchId);
  const changeSummary = {
    ...buildChangeSummary(snapshot, sourceType),
    publicationNote: input.publicationNote || null,
    notifyBranchAdmins: Boolean(input.notifyBranchAdmins),
    notifyHqTeam: Boolean(input.notifyHqTeam),
    publishedSubmissionIds: Array.isArray(input.publishedSubmissionIds)
      ? input.publishedSubmissionIds
      : [],
  };

  const version = await versionRepo.insertPublishedVersion(client, {
    organizationId,
    churchId,
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
 */
async function applySnapshotPageToDraft(client, churchId, snapshotPage) {
  const pageKey = snapshotPage.pageKey;
  if (!pageKey) return;
  const title = snapshotPage.title || PAGE_KEY_TITLES[pageKey] || pageKey;
  const ensured = await publicContentRepo.ensureDraftPage(client, {
    churchId,
    branchId: null,
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
        await applySnapshotPageToDraft(client, churchId, page);
      }

      const restoredSnapshot = {
        themeKey:
          opts.restoreTheme !== false
            ? historical.themeKey || snap.themeKey || "default"
            : "default",
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
        actorUserId,
        actorRole: "church_hq_admin",
        actionType: "version_restored",
        entityType: "website_publication_version",
        entityId: draftVersion.id,
        result: "success",
        metadata: {
          sourceVersionId: historical.id,
          restoredPageKeys: restoredSnapshot.pageKeys,
        },
      });

      return {
        ok: true,
        status: STATUS.OK,
        draftVersion,
        historical,
        restoredPageKeys: restoredSnapshot.pageKeys,
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
};
