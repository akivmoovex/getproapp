"use strict";

/**
 * Load read-only V5 tenant public page view models from content tables.
 * Branch-scoped published content overrides church-wide when present.
 * No cache in this phase.
 */

const repo = require("../repositories/blessBoardSettingsRepository");
const {
  getPublishedPage,
  listPublishedLeaders,
  listPublishedMinistries,
  listPublishedEvents,
  listPublishedSermons,
  listPublishedContactChannels,
  listPublishedGivingMethods,
} = require("../services/publicContentReadService");
const { PAGE_KEY_TITLES } = require("../services/publicContentConstants");
const { NAV_ITEMS, PAGE_KEY_TO_PATH } = require("./tenantPublicPaths");
const { buildTenantPublicSeo } = require("./tenantPublicSeo");
const { safeExternalUrl, plainMetaText } = require("./tenantPublicSafe");

const KIND = Object.freeze({
  OK: "ok",
  UNAVAILABLE: "unavailable",
  LOOKUP_ERROR: "lookup_error",
});

/**
 * Prefer primary-branch published page; fall back to church-wide.
 * @param {{ query?: Function, connect?: Function }} db
 * @param {{ churchId: string, primaryBranchId: string, pageKey: string }} scope
 */
async function resolvePublishedPage(db, scope) {
  const branchPage = await getPublishedPage(db, {
    churchId: scope.churchId,
    branchId: scope.primaryBranchId,
    pageKey: scope.pageKey,
  });
  if (branchPage.ok && branchPage.page) {
    return { ...branchPage, contentScope: "branch" };
  }
  const churchPage = await getPublishedPage(db, {
    churchId: scope.churchId,
    branchId: null,
    pageKey: scope.pageKey,
  });
  if (churchPage.ok && churchPage.page) {
    return { ...churchPage, contentScope: "church" };
  }
  return {
    ok: false,
    status: "not_found",
    page: null,
    sections: [],
    contentScope: null,
  };
}

/**
 * Prefer branch-scoped published entities; if none, church-wide.
 * @param {(db: *, input: object) => Promise<{ ok: boolean, items: object[] }>} listFn
 */
async function resolvePublishedList(db, listFn, churchId, primaryBranchId) {
  const branchList = await listFn(db, { churchId, branchId: primaryBranchId });
  if (branchList.ok && branchList.items && branchList.items.length > 0) {
    return { ok: true, items: branchList.items, contentScope: "branch" };
  }
  const churchList = await listFn(db, { churchId, branchId: null });
  if (churchList.ok) {
    return {
      ok: true,
      items: churchList.items || [],
      contentScope: churchList.items && churchList.items.length ? "church" : null,
    };
  }
  return { ok: false, items: [], contentScope: null };
}

function mapSection(section) {
  return {
    sectionKey: section.sectionKey,
    sectionType: section.sectionType,
    heading: section.heading,
    bodyText: section.bodyText,
    mediaUrl: safeExternalUrl(section.mediaUrl),
    sortOrder: section.sortOrder,
  };
}

function mapLeader(row) {
  return {
    displayName: row.displayName,
    roleTitle: row.roleTitle,
    biography: row.biography,
    imageUrl: safeExternalUrl(row.imageUrl),
  };
}

function mapMinistry(row) {
  return {
    name: row.name,
    summary: row.summary,
    description: row.description,
    meetingDay: row.meetingDay,
    contactEmail: row.contactEmail || null,
    contactHref: row.contactEmail ? safeExternalUrl(`mailto:${row.contactEmail}`) : null,
    imageUrl: safeExternalUrl(row.imageUrl),
  };
}

function mapEvent(row) {
  return {
    title: row.title,
    summary: row.summary,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.timezone,
    location: row.location,
    registrationUrl: safeExternalUrl(row.registrationUrl),
    imageUrl: safeExternalUrl(row.imageUrl),
  };
}

function mapSermon(row) {
  return {
    title: row.title,
    speakerName: row.speakerName,
    preachedAt: row.preachedAt,
    summary: row.summary,
    mediaUrl: safeExternalUrl(row.mediaUrl),
    resourceUrl: safeExternalUrl(row.resourceUrl),
  };
}

function mapContact(row) {
  let href = null;
  if (row.channelType === "email") {
    href = safeExternalUrl(`mailto:${row.value}`);
  } else if (row.channelType === "phone") {
    const digits = String(row.value || "").replace(/[^\d+]/g, "");
    href = digits ? safeExternalUrl(`tel:${digits}`) : null;
  } else {
    href = safeExternalUrl(row.value);
  }
  return {
    channelType: row.channelType,
    label: row.label,
    value: row.value,
    href,
  };
}

function mapGiving(row) {
  return {
    methodType: row.methodType,
    label: row.label,
    instructions: row.instructions,
    externalUrl: safeExternalUrl(row.externalUrl),
  };
}

function firstSectionDescription(sections) {
  for (const s of sections || []) {
    if (s.bodyText) return plainMetaText(s.bodyText, 160);
    if (s.heading) return plainMetaText(s.heading, 160);
  }
  return "";
}

/**
 * @param {{ query?: Function, connect?: Function }} db
 * @param {{
 *   tenant: object,
 *   pageKey: string,
 *   hostname: string,
 * }} input
 */
async function loadTenantPublicPageModel(db, input) {
  const tenant = input.tenant;
  if (!tenant || !tenant.resolved || !tenant.church || !tenant.primaryBranch) {
    return { kind: KIND.UNAVAILABLE, reason: "tenant_unresolved" };
  }

  const churchId = tenant.church.id;
  const primaryBranchId = tenant.primaryBranch.id;
  const pageKey = String(input.pageKey || "home");
  const hostname = String(input.hostname || "");

  const settings = await (async () => {
    try {
      if (db && typeof db.connect === "function") {
        const client = await db.connect();
        try {
          return await repo.findChurchSettings(client, churchId);
        } finally {
          if (typeof client.release === "function") client.release();
        }
      }
      return await repo.findChurchSettings(db, churchId);
    } catch {
      return null;
    }
  })();
  const websiteStatus = settings ? settings.websiteStatus : "draft";
  const publicName =
    (settings && settings.publicName) || tenant.church.displayName || "Church";

  if (websiteStatus === "suspended") {
    return { kind: KIND.UNAVAILABLE, reason: "website_suspended" };
  }

  const pageResult = await resolvePublishedPage(db, {
    churchId,
    primaryBranchId,
    pageKey,
  });

  const sections = (pageResult.sections || []).map(mapSection);
  const pageTitle =
    (pageResult.page && pageResult.page.title) || PAGE_KEY_TITLES[pageKey] || pageKey;

  let entities = [];
  let entitiesScope = null;
  let entitiesEmptyMessage = "";

  if (pageKey === "leadership") {
    const list = await resolvePublishedList(db, listPublishedLeaders, churchId, primaryBranchId);
    entities = (list.items || []).map(mapLeader);
    entitiesScope = list.contentScope;
    entitiesEmptyMessage = "Leadership profiles will appear here when published.";
  } else if (pageKey === "ministries") {
    const list = await resolvePublishedList(db, listPublishedMinistries, churchId, primaryBranchId);
    entities = (list.items || []).map(mapMinistry);
    entitiesScope = list.contentScope;
    entitiesEmptyMessage = "Ministries will appear here when published.";
  } else if (pageKey === "events") {
    const list = await resolvePublishedList(db, listPublishedEvents, churchId, primaryBranchId);
    entities = (list.items || []).map(mapEvent);
    entitiesScope = list.contentScope;
    entitiesEmptyMessage = "Upcoming events will appear here when published.";
  } else if (pageKey === "sermons") {
    const list = await resolvePublishedList(db, listPublishedSermons, churchId, primaryBranchId);
    entities = (list.items || []).map(mapSermon);
    entitiesScope = list.contentScope;
    entitiesEmptyMessage = "Sermons will appear here when published.";
  } else if (pageKey === "contact") {
    const list = await resolvePublishedList(
      db,
      listPublishedContactChannels,
      churchId,
      primaryBranchId
    );
    entities = (list.items || []).map(mapContact);
    entitiesScope = list.contentScope;
    entitiesEmptyMessage = "Contact details will appear here when published.";
  } else if (pageKey === "giving") {
    const list = await resolvePublishedList(
      db,
      listPublishedGivingMethods,
      churchId,
      primaryBranchId
    );
    entities = (list.items || []).map(mapGiving);
    entitiesScope = list.contentScope;
    entitiesEmptyMessage = "Giving options will appear here when published.";
  }

  const dataEnvironment = tenant.church.dataEnvironment || null;
  const env = String(dataEnvironment || "").toLowerCase();
  const showEnvBadge = env === "testing" || env === "demo";

  const seo = buildTenantPublicSeo({
    hostname,
    pageKey,
    publicName,
    pageTitle,
    description: firstSectionDescription(sections),
    dataEnvironment,
    websiteStatus,
  });

  const hasPage = Boolean(pageResult.page);
  const hasSections = sections.length > 0;
  const hasEntities = entities.length > 0;

  // Entity pages: empty if no entities (sections optional). Content pages: empty if no sections.
  let showEmptyState = false;
  if (["leadership", "ministries", "events", "sermons", "contact", "giving"].includes(pageKey)) {
    showEmptyState = !hasEntities && !hasSections;
  } else {
    showEmptyState = !hasSections;
  }

  return {
    kind: KIND.OK,
    pageKey,
    path: PAGE_KEY_TO_PATH[pageKey] || "/",
    publicName,
    pageTitle,
    websiteStatus,
    dataEnvironment,
    showEnvBadge,
    primaryBranchDisplayName: tenant.primaryBranch.displayName,
    hqBranchDisplayName: tenant.hqBranch ? tenant.hqBranch.displayName : "",
    loginHref: "/login",
    apexHref: "https://blessboard.org/",
    navItems: NAV_ITEMS,
    activeNav: pageKey,
    page: pageResult.page
      ? {
          title: pageResult.page.title,
          contentScope: pageResult.contentScope,
        }
      : null,
    sections,
    entities,
    entitiesScope,
    entitiesEmptyMessage,
    showEmptyState,
    emptyHeadline: hasPage ? pageTitle : PAGE_KEY_TITLES[pageKey] || "Welcome",
    emptyMessage: hasPage
      ? "Content for this page is being prepared."
      : "This page is not published yet. Please check back soon.",
    seo,
  };
}

module.exports = {
  KIND,
  loadTenantPublicPageModel,
  resolvePublishedPage,
  resolvePublishedList,
  safeExternalUrl,
};
