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

/**
 * Public events: published only (caller), cancelled excluded by status.
 * Upcoming first (ASC); past published events omitted from the public list.
 * An event remains upcoming until endsAt (if set) or startsAt.
 * @param {ReturnType<typeof mapEvent>[]} events
 * @param {number} [nowMs]
 */
function preparePublicEvents(events, nowMs) {
  const now = typeof nowMs === "number" ? nowMs : Date.now();
  const upcoming = [];
  for (const event of events || []) {
    const endRef = event.endsAt || event.startsAt;
    if (!endRef) {
      upcoming.push(event);
      continue;
    }
    const t = new Date(endRef).getTime();
    if (Number.isNaN(t) || t >= now) upcoming.push(event);
  }
  upcoming.sort((a, b) => {
    const ta = a.startsAt ? new Date(a.startsAt).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.startsAt ? new Date(b.startsAt).getTime() : Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return 0;
  });
  return upcoming;
}

function channelIcon(channelType) {
  const t = String(channelType || "").toLowerCase();
  if (t === "email" || t.includes("mail")) return "mail";
  if (t === "phone" || t.includes("tel") || t.includes("call")) return "call";
  if (t.includes("address") || t.includes("location") || t.includes("map")) {
    return "location_on";
  }
  if (t.includes("web") || t.includes("url") || t.includes("link")) return "language";
  if (t.includes("whatsapp") || t.includes("chat") || t.includes("message")) return "chat";
  return "contact_mail";
}

function methodIcon(methodType) {
  const t = String(methodType || "").toLowerCase();
  if (t.includes("bank") || t.includes("transfer") || t.includes("wire")) {
    return "account_balance";
  }
  if (t.includes("mobile") || t.includes("momo") || t.includes("airtel") || t.includes("mtn")) {
    return "smartphone";
  }
  if (t.includes("person") || t.includes("cash") || t.includes("offering")) {
    return "volunteer_activism";
  }
  if (t.includes("card") || t.includes("online") || t.includes("pay")) return "payments";
  return "payments";
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
    icon: channelIcon(row.channelType),
  };
}

function mapGiving(row) {
  return {
    methodType: row.methodType,
    label: row.label,
    instructions: row.instructions,
    externalUrl: safeExternalUrl(row.externalUrl),
    icon: methodIcon(row.methodType),
  };
}

/**
 * @param {unknown} lat
 * @param {unknown} lng
 */
function validCoordinates(lat, lng) {
  if (lat == null || lng == null || lat === "" || lng === "") return null;
  const latitude = typeof lat === "number" ? lat : Number(lat);
  const longitude = typeof lng === "number" ? lng : Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

/**
 * Compose a public address from branch settings parts only (no fabrication).
 * @param {object|null} branchSettings
 */
function formatPublicAddress(branchSettings) {
  if (!branchSettings) return { lines: [], text: "" };
  const lines = [
    branchSettings.addressLine1,
    branchSettings.addressLine2,
    [branchSettings.city, branchSettings.provinceState].filter(Boolean).join(", "),
    branchSettings.postalCode,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  return { lines, text: lines.join("\n") };
}

/**
 * Public contact chrome from church + primary-branch settings.
 * @param {object|null} churchSettings
 * @param {object|null} branchSettings
 */
function buildPublicContact(churchSettings, branchSettings) {
  const branchEmail = branchSettings && branchSettings.email ? String(branchSettings.email).trim() : "";
  const churchEmail =
    churchSettings && churchSettings.primaryEmail ? String(churchSettings.primaryEmail).trim() : "";
  const email = branchEmail || churchEmail;

  const branchPhone = branchSettings && branchSettings.phone ? String(branchSettings.phone).trim() : "";
  const churchPhone =
    churchSettings && churchSettings.primaryPhone ? String(churchSettings.primaryPhone).trim() : "";
  const phone = branchPhone || churchPhone;

  const address = formatPublicAddress(branchSettings);
  const coords = validCoordinates(
    branchSettings && branchSettings.latitude,
    branchSettings && branchSettings.longitude
  );

  let mapEmbedUrl = null;
  let directionsUrl = null;
  if (coords) {
    const { latitude, longitude } = coords;
    const pad = 0.02;
    mapEmbedUrl = safeExternalUrl(
      `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - pad}%2C${latitude - pad}%2C${longitude + pad}%2C${latitude + pad}&layer=mapnik&marker=${latitude}%2C${longitude}`
    );
    directionsUrl = safeExternalUrl(
      `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`
    );
  }

  const emailHref = email ? safeExternalUrl(`mailto:${email}`) : null;
  const phoneDigits = phone ? phone.replace(/[^\d+]/g, "") : "";
  const phoneHref = phoneDigits ? safeExternalUrl(`tel:${phoneDigits}`) : null;

  const hasAny = Boolean(email || phone || address.text || coords);

  return {
    email: email || "",
    emailHref,
    phone: phone || "",
    phoneHref,
    addressLines: address.lines,
    addressText: address.text,
    latitude: coords ? coords.latitude : null,
    longitude: coords ? coords.longitude : null,
    hasMap: Boolean(coords && mapEmbedUrl),
    mapEmbedUrl,
    directionsUrl,
    hasAny,
  };
}

/**
 * Load church + primary-branch settings with one connection when possible.
 */
async function loadPublicSettings(db, churchId, primaryBranchId) {
  try {
    if (db && typeof db.connect === "function") {
      const client = await db.connect();
      try {
        const [churchSettings, branchSettings] = await Promise.all([
          repo.findChurchSettings(client, churchId),
          repo.findBranchSettings(client, primaryBranchId),
        ]);
        return { churchSettings, branchSettings };
      } finally {
        if (typeof client.release === "function") client.release();
      }
    }
    const [churchSettings, branchSettings] = await Promise.all([
      repo.findChurchSettings(db, churchId),
      repo.findBranchSettings(db, primaryBranchId),
    ]);
    return { churchSettings, branchSettings };
  } catch {
    return { churchSettings: null, branchSettings: null };
  }
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

  const { churchSettings: settings, branchSettings } = await loadPublicSettings(
    db,
    churchId,
    primaryBranchId
  );
  const websiteStatus = settings ? settings.websiteStatus : "draft";
  const publicName =
    (settings && settings.publicName) ||
    (branchSettings && branchSettings.publicName) ||
    tenant.church.displayName ||
    "Church";

  if (websiteStatus === "suspended") {
    return { kind: KIND.UNAVAILABLE, reason: "website_suspended" };
  }

  const publicContact = buildPublicContact(settings, branchSettings);

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
    entities = preparePublicEvents((list.items || []).map(mapEvent));
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
  const primaryEmail = settings && settings.primaryEmail ? String(settings.primaryEmail) : "";
  const primaryPhone = settings && settings.primaryPhone ? String(settings.primaryPhone) : "";
  const footerTagline = firstSectionDescription(sections);

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
  // Contact also considers public branch/church settings (address/phone/email/map).
  let showEmptyState = false;
  if (pageKey === "contact") {
    showEmptyState = !hasEntities && !hasSections && !publicContact.hasAny;
  } else if (["leadership", "ministries", "events", "sermons", "giving"].includes(pageKey)) {
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
    primaryEmail,
    primaryPhone,
    footerTagline,
    publicContact,
    primaryBranchDisplayName: tenant.primaryBranch.displayName,
    hqBranchDisplayName: tenant.hqBranch ? tenant.hqBranch.displayName : "",
    loginHref: "/login",
    apexHref: "https://blessboard.org/",
    cssHref: "/blessboard/v5/tenant-public.css?v=26",
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
    emptyMessage:
      showEmptyState && entitiesEmptyMessage
        ? entitiesEmptyMessage
        : hasPage
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
  preparePublicEvents,
  safeExternalUrl,
  buildPublicContact,
  validCoordinates,
};
