"use strict";

/**
 * Load read-only V5 tenant public page view models from content tables.
 * Branch-scoped published content overrides church-wide when present.
 * Set input.preview=true for authenticated admin preview (drafts included; same templates).
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
const contentAdmin = require("../services/publicContentAdminService");
const { PAGE_KEY_TITLES } = require("../services/publicContentConstants");
const { NAV_ITEMS, PAGE_KEY_TO_PATH } = require("./tenantPublicPaths");
const { buildTenantPublicSeo } = require("./tenantPublicSeo");
const { safeExternalUrl, plainMetaText } = require("./tenantPublicSafe");
const testingDemoSpec = require("../services/testingWebsiteDemoContentSpec");

const KIND = Object.freeze({
  OK: "ok",
  SETUP: "setup",
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

/**
 * Preserve service_times layout_metadata entries for public templates (no HTML).
 * @param {unknown} meta
 */
function sanitizeLayoutMetadata(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const out = {};
  if (meta.schema != null) out.schema = String(meta.schema).slice(0, 64);
  if (Array.isArray(meta.entries)) {
    out.entries = meta.entries
      .filter((e) => e && typeof e === "object")
      .slice(0, 20)
      .map((e) => ({
        id: e.id != null ? String(e.id).slice(0, 64) : null,
        name: e.name != null ? String(e.name).slice(0, 120) : "",
        day: e.day != null ? String(e.day).slice(0, 16) : "",
        startTime: e.startTime != null ? String(e.startTime).slice(0, 8) : "",
        endTime: e.endTime != null ? String(e.endTime).slice(0, 8) : "",
        location: e.location != null ? String(e.location).slice(0, 200) : "",
        note: e.note != null ? String(e.note).slice(0, 200) : "",
        enabled: e.enabled !== false,
        sortOrder: Number.isFinite(Number(e.sortOrder)) ? Number(e.sortOrder) : 0,
      }));
  }
  return Object.keys(out).length ? out : null;
}

function mapSection(section) {
  return {
    sectionKey: section.sectionKey,
    sectionType: section.sectionType,
    heading: section.heading,
    bodyText: section.bodyText,
    mediaUrl: safeExternalUrl(section.mediaUrl),
    sortOrder: section.sortOrder,
    status: section.status || null,
    layoutMetadata: sanitizeLayoutMetadata(section.layoutMetadata),
  };
}

/**
 * @param {string|null|undefined} summary
 * @returns {{ category: string|null, summary: string|null }}
 */
function parseSermonSummary(summary) {
  const raw = summary == null ? "" : String(summary).trim();
  if (!raw) return { category: null, summary: null };
  const m = /^Category:\s*([^.\n]+)[.\s—-]*(.*)$/i.exec(raw);
  if (!m) return { category: null, summary: raw };
  const category = String(m[1] || "").trim().slice(0, 64) || null;
  const rest = String(m[2] || "").trim();
  return { category, summary: rest || raw };
}

function mapLeader(row) {
  return {
    displayName: row.displayName,
    roleTitle: row.roleTitle,
    biography: row.biography,
    imageUrl: safeExternalUrl(row.imageUrl),
    sortOrder: row.sortOrder != null ? Number(row.sortOrder) : 0,
    status: row.status || null,
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
    sortOrder: row.sortOrder != null ? Number(row.sortOrder) : 0,
    status: row.status || null,
  };
}

function mapEvent(row, fallbackTimezone) {
  return {
    title: row.title,
    summary: row.summary,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.timezone || fallbackTimezone || null,
    location: row.location,
    registrationUrl: safeExternalUrl(row.registrationUrl),
    imageUrl: safeExternalUrl(row.imageUrl),
    status: row.status || null,
  };
}

function mapSermon(row) {
  const parsed = parseSermonSummary(row.summary);
  return {
    title: row.title,
    speakerName: row.speakerName,
    preachedAt: row.preachedAt,
    summary: parsed.summary,
    category: parsed.category,
    mediaUrl: safeExternalUrl(row.mediaUrl),
    resourceUrl: safeExternalUrl(row.resourceUrl),
    // Optional thumb for cards (soft-fill / future schema); never treat as playable mediaUrl.
    imageUrl: safeExternalUrl(row.imageUrl),
    status: row.status || null,
  };
}

/**
 * Testing/demo soft-fill for local event/sermon thumbs when CMS image is empty.
 * Uses same-site /church/images paths only — no Stitch hotlinks.
 * Only fills demo-owned titles (exact catalog match or [Demo] marker).
 */
function softFillDemoEventImages(items) {
  const catalog = testingDemoSpec.EVENTS || [];
  return (items || []).map((ev) => {
    if (!ev || ev.imageUrl) return ev;
    const byTitle = catalog.find((c) => c.title === ev.title);
    const demoMarked =
      typeof testingDemoSpec.isDemoMarkedText === "function" &&
      testingDemoSpec.isDemoMarkedText(ev.title);
    if (!byTitle && !demoMarked) return ev;
    let resolved = byTitle && byTitle.imageUrl ? byTitle.imageUrl : null;
    if (!resolved && demoMarked) {
      const demoItems = (items || []).filter(
        (x) => x && testingDemoSpec.isDemoMarkedText(x.title)
      );
      const demoIndex = demoItems.findIndex((x) => x === ev || x.title === ev.title);
      const pick = catalog[Math.max(0, demoIndex)] || catalog[0];
      resolved = pick && pick.imageUrl ? pick.imageUrl : null;
    }
    const safe = resolved ? safeExternalUrl(resolved) : null;
    if (!safe) return ev;
    return { ...ev, imageUrl: safe };
  });
}

function softFillDemoSermonImages(items) {
  const catalog = testingDemoSpec.SERMONS || [];
  return (items || []).map((sermon) => {
    if (!sermon || sermon.imageUrl) return sermon;
    const byTitle = catalog.find((c) => c.title === sermon.title);
    const demoMarked =
      typeof testingDemoSpec.isDemoMarkedText === "function" &&
      testingDemoSpec.isDemoMarkedText(sermon.title);
    if (!byTitle && !demoMarked) return sermon;
    let resolved = byTitle && byTitle.imageUrl ? byTitle.imageUrl : null;
    if (!resolved && demoMarked) {
      const demoItems = (items || []).filter(
        (x) => x && testingDemoSpec.isDemoMarkedText(x.title)
      );
      const demoIndex = demoItems.findIndex(
        (x) => x === sermon || x.title === sermon.title
      );
      const pick = catalog[Math.max(0, demoIndex)] || catalog[0];
      resolved = pick && pick.imageUrl ? pick.imageUrl : null;
    }
    const safe = resolved ? safeExternalUrl(resolved) : null;
    if (!safe) return sermon;
    return { ...sermon, imageUrl: safe };
  });
}

const SOCIAL_CHANNEL_TYPES = new Set([
  "facebook",
  "instagram",
  "youtube",
  "twitter",
  "x",
  "linkedin",
  "social",
]);

function isSocialChannel(channelType) {
  const t = String(channelType || "").toLowerCase();
  if (SOCIAL_CHANNEL_TYPES.has(t)) return true;
  return t.includes("facebook") || t.includes("instagram") || t.includes("youtube");
}

function extractServiceTimesEntries(sections) {
  for (const s of sections || []) {
    const key = String(s.sectionKey || "");
    const type = String(s.sectionType || "");
    const isServiceTimes =
      key === "service_times" ||
      key === "services" ||
      key === "worship_times" ||
      type === "service_times" ||
      type === "services" ||
      type === "worship_times";
    if (!isServiceTimes) continue;
    const meta = s.layoutMetadata;
    if (meta && Array.isArray(meta.entries)) {
      return meta.entries
        .filter((e) => e && e.enabled !== false && (e.name || e.startTime))
        .slice()
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
    }
    return [];
  }
  return [];
}

function pickAnnouncementHighlight(sections) {
  for (const s of sections || []) {
    const blob = `${s.sectionKey || ""} ${s.sectionType || ""} ${s.heading || ""}`.toLowerCase();
    if (
      blob.includes("announcement") ||
      blob.includes("highlight") ||
      blob.includes("this week") ||
      blob.includes("this_week")
    ) {
      if (s.heading || s.bodyText) return s;
    }
  }
  return null;
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
  if (t.includes("facebook")) return "public";
  if (t.includes("instagram")) return "photo_camera";
  if (t.includes("youtube")) return "smart_display";
  if (t.includes("twitter") || t === "x") return "alternate_email";
  if (t.includes("web") || t.includes("url") || t.includes("link") || t.includes("social")) {
    return "language";
  }
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
  let instructions = row.instructions != null ? String(row.instructions) : "";
  const markedDemo =
    /\[Demo\]/i.test(instructions) ||
    /\bDEMO\b/.test(instructions) ||
    /TEST ONLY/i.test(instructions) ||
    /fictional/i.test(instructions);
  // Never surface credential-like strings that are not clearly demo/test copy.
  if (
    instructions &&
    !markedDemo &&
    (/\bIBAN\b/i.test(instructions) ||
      /\bSWIFT\b/i.test(instructions) ||
      /\brouting\s*#?\s*\d{9}\b/i.test(instructions) ||
      /\b\d{8,17}\b/.test(instructions.replace(/DEMO[-0-9]*/gi, "")))
  ) {
    instructions =
      "Contact the church office for published giving instructions. Account details are not shown on this page.";
  }
  return {
    methodType: row.methodType,
    label: row.label,
    instructions: instructions || null,
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
 * Prefer draft|published admin page for preview (same templates as published).
 */
async function resolvePreviewPage(db, scope) {
  const churchId = scope.churchId;
  const pageKey = scope.pageKey;
  const preferredBranchId =
    scope.branchId != null && String(scope.branchId).trim()
      ? String(scope.branchId).trim()
      : null;

  async function loadBundle(branchId) {
    const bundle = await contentAdmin.getAdminPageBundle(db, {
      churchId,
      branchId,
      pageKey,
    });
    if (!bundle.ok || !bundle.page) return null;
    if (bundle.page.status === "archived") return null;
    const sections = (bundle.sections || [])
      .filter((s) => s.status === "draft" || s.status === "published")
      .map(mapSection);
    return {
      ok: true,
      page: bundle.page,
      sections,
      contentScope: branchId ? "branch" : "church",
    };
  }

  if (preferredBranchId) {
    const branch = await loadBundle(preferredBranchId);
    if (branch) return branch;
  }
  const church = await loadBundle(null);
  if (church) return church;
  return {
    ok: false,
    status: "not_found",
    page: null,
    sections: [],
    contentScope: null,
  };
}

async function resolvePreviewList(db, listFn, churchId, primaryBranchId) {
  const branchList = await listFn(db, { churchId, branchId: primaryBranchId });
  const branchItems = ((branchList && branchList.items) || []).filter(
    (item) => item.status === "draft" || item.status === "published"
  );
  if (branchItems.length > 0) {
    return { ok: true, items: branchItems, contentScope: "branch" };
  }
  const churchList = await listFn(db, { churchId, branchId: null });
  const churchItems = ((churchList && churchList.items) || []).filter(
    (item) => item.status === "draft" || item.status === "published"
  );
  return {
    ok: true,
    items: churchItems,
    contentScope: churchItems.length ? "church" : null,
  };
}

/**
 * @param {{ query?: Function, connect?: Function }} db
 * @param {{
 *   tenant: object,
 *   pageKey: string,
 *   hostname?: string,
 *   pathPrefix?: string,
 *   preview?: boolean,
 *   previewBranchId?: string|null,
 *   previewMeta?: { backHref?: string, editHref?: string }|null,
 * }} input
 */
async function loadTenantPublicPageModel(db, input) {
  const tenant = input.tenant;
  if (!tenant || !tenant.resolved || !tenant.church || !tenant.primaryBranch) {
    return { kind: KIND.UNAVAILABLE, reason: "tenant_unresolved" };
  }

  const isPreview = Boolean(input.preview);
  const churchId = tenant.church.id;
  const primaryBranchId = tenant.primaryBranch.id;
  const pageKey = String(input.pageKey || "home");
  const hostname = String(input.hostname || "");
  const previewBranchId =
    input.previewBranchId != null && String(input.previewBranchId).trim()
      ? String(input.previewBranchId).trim()
      : null;

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

  if (websiteStatus === "suspended" && !isPreview) {
    return { kind: KIND.UNAVAILABLE, reason: "website_suspended" };
  }

  if (!isPreview && websiteStatus !== "published") {
    return {
      kind: KIND.SETUP,
      reason: "website_unpublished",
      pageKey,
      publicName,
      websiteStatus,
      organizationKey: tenant.organization ? tenant.organization.key : null,
      seo: buildTenantPublicSeo({
        hostname,
        pageKey,
        publicName,
        pageTitle: "Website coming soon",
        description: `${publicName} website is being prepared.`,
        dataEnvironment: tenant.church.dataEnvironment || null,
        websiteStatus: "draft",
        pathPrefix: input.pathPrefix || "",
      }),
    };
  }

  const publicContact = buildPublicContact(settings, branchSettings);
  const canonicalTimezone =
    (settings && settings.defaultTimezone) ||
    (branchSettings && branchSettings.timezone) ||
    null;

  const pageResult = isPreview
    ? await resolvePreviewPage(db, {
        churchId,
        branchId: previewBranchId,
        pageKey,
      })
    : await resolvePublishedPage(db, {
        churchId,
        primaryBranchId,
        pageKey,
      });

  const pageSections = isPreview
    ? pageResult.sections || []
    : (pageResult.sections || []).map(mapSection);

  const pageTitle =
    (pageResult.page && pageResult.page.title) || PAGE_KEY_TITLES[pageKey] || pageKey;

  let entities = [];
  let entitiesScope = null;
  let entitiesEmptyMessage = "";

  async function loadEntityList(publishedFn, adminFn, mapper, prepare) {
    if (isPreview) {
      const list = await resolvePreviewList(db, adminFn, churchId, primaryBranchId);
      let items = (list.items || []).map(mapper);
      if (prepare) items = prepare(items);
      return { items, contentScope: list.contentScope };
    }
    const list = await resolvePublishedList(db, publishedFn, churchId, primaryBranchId);
    let items = (list.items || []).map(mapper);
    if (prepare) items = prepare(items);
    return { items, contentScope: list.contentScope };
  }

  if (pageKey === "leadership") {
    const list = await loadEntityList(
      listPublishedLeaders,
      contentAdmin.listAdminLeaders,
      mapLeader
    );
    entities = list.items;
    entitiesScope = list.contentScope;
    entitiesEmptyMessage = "Leadership profiles will appear here when published.";
  } else if (pageKey === "ministries") {
    const list = await loadEntityList(
      listPublishedMinistries,
      contentAdmin.listAdminMinistries,
      mapMinistry
    );
    entities = list.items;
    entitiesScope = list.contentScope;
    entitiesEmptyMessage = "Ministries will appear here when published.";
  } else if (pageKey === "events") {
    const list = await loadEntityList(
      listPublishedEvents,
      contentAdmin.listAdminEvents,
      (row) => mapEvent(row, canonicalTimezone),
      (items) => preparePublicEvents(items)
    );
    entities = list.items;
    entitiesScope = list.contentScope;
    entitiesEmptyMessage = "Upcoming events will appear here when published.";
  } else if (pageKey === "sermons") {
    const list = await loadEntityList(
      listPublishedSermons,
      contentAdmin.listAdminSermons,
      mapSermon
    );
    entities = list.items;
    entitiesScope = list.contentScope;
    entitiesEmptyMessage = "Sermons will appear here when published.";
  } else if (pageKey === "contact") {
    const list = await loadEntityList(
      listPublishedContactChannels,
      contentAdmin.listAdminContactChannels,
      mapContact
    );
    entities = list.items;
    entitiesScope = list.contentScope;
    entitiesEmptyMessage = "Contact details will appear here when published.";
  } else if (pageKey === "giving") {
    const list = await loadEntityList(
      listPublishedGivingMethods,
      contentAdmin.listAdminGivingMethods,
      mapGiving
    );
    entities = list.items;
    entitiesScope = list.contentScope;
    entitiesEmptyMessage = "Giving options will appear here when published.";
  }

  let homeTeasers = {
    ministries: [],
    leaders: [],
    events: [],
    sermons: [],
    announcement: null,
  };
  let socialLinks = [];
  let serviceTimesEntries = extractServiceTimesEntries(pageSections);

  if (pageKey === "home" || pageKey === "about" || pageKey === "contact") {
    const contactList = isPreview
      ? await resolvePreviewList(
          db,
          contentAdmin.listAdminContactChannels,
          churchId,
          primaryBranchId
        )
      : await resolvePublishedList(db, listPublishedContactChannels, churchId, primaryBranchId);
    const allChannels = (contactList.items || []).map(mapContact);
    socialLinks = allChannels.filter((ch) => isSocialChannel(ch.channelType));
  }

  if (pageKey === "home") {
    homeTeasers.announcement = pickAnnouncementHighlight(pageSections);

    const ministries = await loadEntityList(
      listPublishedMinistries,
      contentAdmin.listAdminMinistries,
      mapMinistry
    );
    homeTeasers.ministries = (ministries.items || []).slice(0, 4);

    const leaders = await loadEntityList(
      listPublishedLeaders,
      contentAdmin.listAdminLeaders,
      mapLeader
    );
    homeTeasers.leaders = (leaders.items || []).slice(0, 3);

    const events = await loadEntityList(
      listPublishedEvents,
      contentAdmin.listAdminEvents,
      (row) => mapEvent(row, canonicalTimezone),
      (items) => preparePublicEvents(items)
    );
    homeTeasers.events = (events.items || []).slice(0, 3);

    const sermons = await loadEntityList(
      listPublishedSermons,
      contentAdmin.listAdminSermons,
      mapSermon
    );
    homeTeasers.sermons = (sermons.items || []).slice(0, 3);
  }

  if ((pageKey === "about" || pageKey === "contact") && !serviceTimesEntries.length) {
    const homePage = isPreview
      ? await resolvePreviewPage(db, {
          churchId,
          branchId: previewBranchId,
          pageKey: "home",
        })
      : await resolvePublishedPage(db, { churchId, primaryBranchId, pageKey: "home" });
    const homeSections = isPreview
      ? homePage.sections || []
      : (homePage.sections || []).map(mapSection);
    serviceTimesEntries = extractServiceTimesEntries(homeSections);
  }

  const dataEnvironment = tenant.church.dataEnvironment || null;
  const env = String(dataEnvironment || "").toLowerCase();
  const showEnvBadge = env === "testing" || env === "demo";
  const primaryEmail = settings && settings.primaryEmail ? String(settings.primaryEmail) : "";
  const primaryPhone = settings && settings.primaryPhone ? String(settings.primaryPhone) : "";
  const footerTagline = firstSectionDescription(pageSections) || "";
  const pathPrefix = String(input.pathPrefix || "").replace(/\/$/, "");

  const seo = buildTenantPublicSeo({
    hostname,
    pageKey,
    publicName,
    pageTitle,
    description: firstSectionDescription(pageSections),
    dataEnvironment: isPreview ? "testing" : dataEnvironment,
    websiteStatus: isPreview ? "draft" : websiteStatus,
    pathPrefix,
  });

  const hasPage = Boolean(pageResult.page);
  const hasSections = pageSections.length > 0;
  const hasEntities = entities.length > 0;
  const hasHomeTeasers =
    pageKey === "home" &&
    Boolean(
      homeTeasers.ministries.length ||
        homeTeasers.leaders.length ||
        homeTeasers.events.length ||
        homeTeasers.sermons.length ||
        homeTeasers.announcement ||
        serviceTimesEntries.length
    );

  let showEmptyState = false;
  if (pageKey === "contact") {
    showEmptyState = !hasEntities && !hasSections && !publicContact.hasAny;
  } else if (["leadership", "ministries", "events", "sermons", "giving"].includes(pageKey)) {
    showEmptyState = !hasEntities && !hasSections;
  } else if (pageKey === "home") {
    showEmptyState = !hasSections && !hasHomeTeasers;
  } else {
    showEmptyState = !hasSections;
  }

  // Soft demo pack for testing/demo orgs only — templates use when CMS fields are empty.
  // Do not soft-fill a fully empty home (preserve intentional empty state).
  let homeDemoFallback = null;
  if (pageKey === "home" && showEnvBadge && !showEmptyState) {
    homeDemoFallback = Object.freeze({
      heroHeading: testingDemoSpec.HERO.heading,
      heroBody: testingDemoSpec.HERO.bodyText,
      heroMediaUrl: testingDemoSpec.HERO.mediaUrl,
      announcement: Object.freeze({
        heading: testingDemoSpec.HOME_ANNOUNCEMENT.heading,
        bodyText: testingDemoSpec.HOME_ANNOUNCEMENT.bodyText,
      }),
    });
  }

  let aboutDemoFallback = null;
  if (pageKey === "about" && showEnvBadge && !showEmptyState) {
    const aboutHero = testingDemoSpec.ABOUT_SECTIONS.find((s) => s.sectionType === "hero") ||
      testingDemoSpec.ABOUT_SECTIONS[0];
    const aboutStory = testingDemoSpec.ABOUT_SECTIONS.find((s) => s.sectionType === "story");
    const aboutMission = testingDemoSpec.ABOUT_SECTIONS.find((s) => s.sectionType === "mission");
    const aboutVision = testingDemoSpec.ABOUT_SECTIONS.find((s) => s.sectionType === "vision");
    const aboutValues = testingDemoSpec.ABOUT_SECTIONS.find((s) => s.sectionType === "values");
    aboutDemoFallback = Object.freeze({
      heroHeading: aboutHero && aboutHero.heading,
      heroBody: aboutHero && aboutHero.bodyText,
      heroMediaUrl: aboutHero && aboutHero.mediaUrl,
      story: aboutStory
        ? Object.freeze({
            sectionKey: aboutStory.sectionKey,
            heading: aboutStory.heading,
            bodyText: aboutStory.bodyText,
            mediaUrl: aboutStory.mediaUrl,
          })
        : null,
      storyMediaUrl: testingDemoSpec.MEDIA.aboutStory,
      mission: aboutMission
        ? Object.freeze({
            sectionKey: aboutMission.sectionKey,
            heading: aboutMission.heading,
            bodyText: aboutMission.bodyText,
          })
        : null,
      vision: aboutVision
        ? Object.freeze({
            sectionKey: aboutVision.sectionKey,
            heading: aboutVision.heading,
            bodyText: aboutVision.bodyText,
          })
        : null,
      values: aboutValues
        ? Object.freeze({
            sectionKey: aboutValues.sectionKey,
            heading: aboutValues.heading,
            bodyText: aboutValues.bodyText,
          })
        : null,
    });
  }

  let leadershipDemoFallback = null;
  if (pageKey === "leadership" && showEnvBadge && !showEmptyState) {
    leadershipDemoFallback = Object.freeze({
      introHeading: "Meet Our Church Leadership",
      introBody:
        "Dedicated servants committed to shepherd, teach, and empower our congregation through spiritual guidance and practical grace. Demo intro for Stitch parity only.",
      introMediaUrl: testingDemoSpec.MEDIA.leadershipIntro,
    });
  }

  let ministriesDemoFallback = null;
  if (pageKey === "ministries" && showEnvBadge && !showEmptyState) {
    ministriesDemoFallback = Object.freeze({
      introHeading: "Growing Together in Faith and Community",
      introBody:
        "Explore ministries designed to serve every member of our spiritual family. Demo intro for Stitch parity only.",
      introMediaUrl: testingDemoSpec.MEDIA.ministriesIntro,
    });
  }

  let eventsDemoFallback = null;
  if (pageKey === "events" && showEnvBadge && !showEmptyState) {
    eventsDemoFallback = Object.freeze({
      introHeading: "Gather with Us",
      introBody:
        "Upcoming gatherings published by this church. Demo intro for Stitch parity only.",
      introMediaUrl: testingDemoSpec.MEDIA.eventsIntro,
    });
  }

  let sermonsDemoFallback = null;
  if (pageKey === "sermons" && showEnvBadge && !showEmptyState) {
    sermonsDemoFallback = Object.freeze({
      introHeading: "Sermons & Resources",
      introBody:
        "Published messages and resources from this church. Demo intro for Stitch parity only.",
      introMediaUrl: testingDemoSpec.MEDIA.sermonsIntro,
    });
  }

  let contactDemoFallback = null;
  if (pageKey === "contact" && showEnvBadge && !showEmptyState) {
    contactDemoFallback = Object.freeze({
      introHeading: testingDemoSpec.CONTACT.introHeading,
      introBody: testingDemoSpec.CONTACT.introBody,
      officeHoursHeading: testingDemoSpec.CONTACT.officeHoursHeading,
      officeHoursBody: testingDemoSpec.CONTACT.officeHoursBody,
    });
  }

  let givingDemoFallback = null;
  if (pageKey === "giving" && showEnvBadge && !showEmptyState) {
    givingDemoFallback = Object.freeze({
      introHeading: testingDemoSpec.GIVING.introHeading,
      introBody: testingDemoSpec.GIVING.introBody,
    });
  }

  // Testing/demo: soft-fill local event/sermon thumbs when CMS media is empty (no hotlinks).
  if (showEnvBadge) {
    if (pageKey === "events") {
      entities = softFillDemoEventImages(entities);
    } else if (pageKey === "sermons") {
      entities = softFillDemoSermonImages(entities);
    } else if (pageKey === "home") {
      homeTeasers = {
        ...homeTeasers,
        events: softFillDemoEventImages(homeTeasers.events),
        sermons: softFillDemoSermonImages(homeTeasers.sermons),
      };
    }
  }

  const navItems = pathPrefix
    ? NAV_ITEMS.map((item) =>
        Object.freeze({
          key: item.key,
          href: item.href === "/" ? pathPrefix || "/" : `${pathPrefix}${item.href}`,
          label: item.label,
        })
      )
    : NAV_ITEMS;

  const previewMeta = isPreview
    ? {
        backHref: (input.previewMeta && input.previewMeta.backHref) || "/hq/content",
        editHref:
          (input.previewMeta && input.previewMeta.editHref) ||
          `/hq/content/pages/${pageKey}`,
      }
    : null;

  return {
    kind: KIND.OK,
    pageKey,
    path: pathPrefix
      ? pageKey === "home"
        ? pathPrefix || "/"
        : `${pathPrefix}${PAGE_KEY_TO_PATH[pageKey] || ""}`
      : PAGE_KEY_TO_PATH[pageKey] || "/",
    publicName,
    pageTitle,
    websiteStatus,
    dataEnvironment,
    showEnvBadge,
    primaryEmail,
    primaryPhone,
    footerTagline,
    publicContact,
    socialLinks,
    serviceTimesEntries,
    homeTeasers,
    homeDemoFallback,
    aboutDemoFallback,
    leadershipDemoFallback,
    ministriesDemoFallback,
    eventsDemoFallback,
    sermonsDemoFallback,
    contactDemoFallback,
    givingDemoFallback,
    canonicalTimezone,
    primaryBranchDisplayName: tenant.primaryBranch.displayName,
    hqBranchDisplayName: tenant.hqBranch ? tenant.hqBranch.displayName : "",
    loginHref: "/login",
    apexHref: "https://blessboard.org/",
    cssHref: "/blessboard/v5/tenant-public.css?v=36",
    pathPrefix,
    homeHref: pathPrefix || "/",
    hrefFor(pagePath) {
      const raw = String(pagePath || "/");
      if (!pathPrefix) return raw;
      if (raw === "/") return pathPrefix;
      return `${pathPrefix}${raw.startsWith("/") ? raw : `/${raw}`}`;
    },
    navItems,
    activeNav: pageKey,
    page: pageResult.page
      ? {
          title: pageResult.page.title,
          status: pageResult.page.status || null,
          contentScope: pageResult.contentScope,
        }
      : null,
    sections: pageSections,
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
    isPreview,
    previewMeta,
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
  parseSermonSummary,
  mapSection,
  mapSermon,
  mapGiving,
};
