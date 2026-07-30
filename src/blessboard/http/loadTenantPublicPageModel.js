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
const publicDemo = require("../services/tenantPublicDemoContent");
const {
  resolvePublicServiceTimesEntries,
} = require("../services/homeServiceTimesService");
const {
  listPublicWebsiteBranches,
} = require("../services/resolvePublicWebsiteBranch");
const {
  buildPublicWebsitePaths,
  publicChurchHomePath,
  publicBranchHomePath,
  tenantBranchHomePath,
} = require("../urls/churchUrlHelper");

const KIND = Object.freeze({
  OK: "ok",
  SETUP: "setup",
  UNAVAILABLE: "unavailable",
  LOOKUP_ERROR: "lookup_error",
});

/**
 * Prefer content-branch published page when an explicit branch is in scope;
 * otherwise church-wide only (never silently mirror the primary branch).
 * @param {{ query?: Function, connect?: Function }} db
 * @param {{ churchId: string, contentBranchId?: string|null, pageKey: string }} scope
 */
async function resolvePublishedPage(db, scope) {
  const contentBranchId =
    scope.contentBranchId != null && String(scope.contentBranchId).trim()
      ? String(scope.contentBranchId).trim()
      : scope.primaryBranchId != null && String(scope.primaryBranchId).trim()
        ? String(scope.primaryBranchId).trim()
        : null;

  if (contentBranchId) {
    const branchPage = await getPublishedPage(db, {
      churchId: scope.churchId,
      branchId: contentBranchId,
      pageKey: scope.pageKey,
    });
    if (branchPage.ok && branchPage.page) {
      return { ...branchPage, contentScope: "branch" };
    }
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
 * Prefer branch-scoped published entities when a branch is in scope; if none, church-wide.
 * When contentBranchId is null (church-wide site), list church-wide only.
 * @param {(db: *, input: object) => Promise<{ ok: boolean, items: object[] }>} listFn
 */
async function resolvePublishedList(db, listFn, churchId, contentBranchId) {
  if (contentBranchId) {
    const branchList = await listFn(db, { churchId, branchId: contentBranchId });
    if (branchList.ok && branchList.items && branchList.items.length > 0) {
      return { ok: true, items: branchList.items, contentScope: "branch" };
    }
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
  if (!raw) return { category: null, summary: null, scripture: null };
  let working = raw;
  let scripture = null;
  const scriptureMatch =
    /\bScripture:\s*([^\n.]+)/i.exec(working) ||
    /\bPassage:\s*([^\n.]+)/i.exec(working);
  if (scriptureMatch) {
    scripture = String(scriptureMatch[1] || "").trim().slice(0, 120) || null;
    working = working.replace(scriptureMatch[0], " ").replace(/\s+/g, " ").trim();
  }
  const m = /^Category:\s*([^.\n]+)[.\s—-]*(.*)$/i.exec(working);
  if (!m) return { category: null, summary: working || raw, scripture };
  const category = String(m[1] || "").trim().slice(0, 64) || null;
  const rest = String(m[2] || "").trim();
  return { category, summary: rest || working || raw, scripture };
}

function mapLeader(row) {
  return {
    id: row.id || null,
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
    id: row.id || null,
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
    id: row.id || null,
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
  const rowScripture =
    row.scripture != null && String(row.scripture).trim()
      ? String(row.scripture).trim().slice(0, 120)
      : null;
  return {
    id: row.id || null,
    title: row.title,
    speakerName: row.speakerName,
    preachedAt: row.preachedAt,
    summary: parsed.summary,
    category: parsed.category,
    scripture: rowScripture || parsed.scripture || null,
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
    id: row.id || null,
    channelType: row.channelType,
    label: row.label,
    value: row.value,
    href,
    icon: channelIcon(row.channelType),
    sortOrder: row.sortOrder != null ? row.sortOrder : 0,
  };
}

/**
 * Scrub private auth/credential material from published giving copy.
 * Legitimate payment instructions (IBAN, account numbers, mobile-money wallets,
 * SWIFT/BIC, routing numbers) must remain visible — that is the point of this page.
 * Only strip PINs, passwords, card PANs / CVV, and login credentials.
 * @param {string} text
 * @returns {string}
 */
function scrubGivingSecrets(text) {
  if (!text) return "";
  let out = String(text);
  out = out.replace(
    /\b((?:pin|password|passwd|passcode|cvv|cvc|cid|security\s*code)\b\s*[:=]?\s*)\S+/gi,
    "$1[redacted]"
  );
  out = out.replace(/\b((?:login|username|user\s*name)\b\s*[:=]\s*)\S+/gi, "$1[redacted]");
  out = out.replace(
    /\b((?:card\s*(?:number|#|no\.?)\b|visa|mastercard|amex)\b[^\d\n]{0,24})(?:\d[ -]*){13,19}/gi,
    "$1[redacted]"
  );
  return out;
}

function mapGiving(row) {
  const instructionsRaw = row.instructions != null ? String(row.instructions) : "";
  const accountDetailsRaw =
    row.accountDetails != null
      ? String(row.accountDetails)
      : row.account_details != null
        ? String(row.account_details)
        : "";
  const instructions = scrubGivingSecrets(instructionsRaw);
  const accountDetails = scrubGivingSecrets(accountDetailsRaw);
  const qrRaw = row.qrImageUrl || row.qr_image_url || null;
  let qrImageUrl = null;
  if (qrRaw) {
    const asPath = String(qrRaw);
    if (asPath.startsWith("/church/images/") || asPath.startsWith("/_bb/media/")) {
      qrImageUrl = asPath;
    } else {
      qrImageUrl = safeExternalUrl(asPath);
    }
  }
  const branchId =
    row.branchId != null
      ? row.branchId
      : row.branch_id != null
        ? row.branch_id
        : null;
  return {
    id: row.id || null,
    methodType: row.methodType,
    label: row.label,
    description: row.description || null,
    accountDetails: accountDetails || null,
    instructions: instructions || null,
    externalUrl: safeExternalUrl(row.externalUrl),
    buttonLabel: row.buttonLabel || row.button_label || null,
    qrImageUrl,
    sortOrder: row.sortOrder != null ? row.sortOrder : 0,
    icon: methodIcon(row.methodType),
    branchId: branchId || null,
    /** Per-method scope when the row carries a branch; else church-wide. */
    scope: branchId ? "branch" : "church",
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
 * Public contact chrome from church + branch settings.
 * @param {object|null} churchSettings
 * @param {object|null} branchSettings
 * @param {{ preferChurch?: boolean }} [options]
 *   preferChurch=true for church-wide URLs: church values first, branch only as fallback.
 *   preferChurch=false (default) for branch mini-sites: branch first, then church.
 */
function buildPublicContact(churchSettings, branchSettings, options) {
  const preferChurch = Boolean(options && options.preferChurch);
  const branchEmail = branchSettings && branchSettings.email ? String(branchSettings.email).trim() : "";
  const churchEmail =
    churchSettings && churchSettings.primaryEmail ? String(churchSettings.primaryEmail).trim() : "";
  const email = preferChurch ? churchEmail || branchEmail : branchEmail || churchEmail;

  const branchPhone = branchSettings && branchSettings.phone ? String(branchSettings.phone).trim() : "";
  const churchPhone =
    churchSettings && churchSettings.primaryPhone ? String(churchSettings.primaryPhone).trim() : "";
  const phone = preferChurch ? churchPhone || branchPhone : branchPhone || churchPhone;

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
 * Load church + optional branch settings with one connection when possible.
 * @param {{ query?: Function, connect?: Function }} db
 * @param {string} churchId
 * @param {string|null} branchId
 */
async function loadPublicSettings(db, churchId, branchId) {
  const resolvedBranchId =
    branchId != null && String(branchId).trim() ? String(branchId).trim() : null;
  try {
    if (db && typeof db.connect === "function") {
      const client = await db.connect();
      try {
        const churchSettings = await repo.findChurchSettings(client, churchId);
        const branchSettings = resolvedBranchId
          ? await repo.findBranchSettings(client, resolvedBranchId)
          : null;
        return { churchSettings, branchSettings };
      } finally {
        if (typeof client.release === "function") client.release();
      }
    }
    const churchSettings = await repo.findChurchSettings(db, churchId);
    const branchSettings = resolvedBranchId
      ? await repo.findBranchSettings(db, resolvedBranchId)
      : null;
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

async function resolvePreviewList(db, listFn, churchId, contentBranchId) {
  if (contentBranchId) {
    const branchList = await listFn(db, { churchId, branchId: contentBranchId });
    const branchItems = ((branchList && branchList.items) || []).filter(
      (item) => item.status === "draft" || item.status === "published"
    );
    if (branchItems.length > 0) {
      return { ok: true, items: branchItems, contentScope: "branch" };
    }
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
 *   selectedBranch?: {
 *     id: string,
 *     key: string,
 *     displayName?: string,
 *     branchType?: string,
 *     isPrimary?: boolean,
 *   }|null,
 *   routingMode?: 'path'|'tenant',
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
  const selectedBranch =
    input.selectedBranch && input.selectedBranch.id
      ? {
          id: String(input.selectedBranch.id),
          key: String(input.selectedBranch.key || ""),
          displayName: String(input.selectedBranch.displayName || ""),
          branchType: String(input.selectedBranch.branchType || ""),
          isPrimary: Boolean(input.selectedBranch.isPrimary),
        }
      : null;
  const explicitBranchSelected = Boolean(selectedBranch);
  // Explicit branch mini sites / preview branch never silently use primary for content.
  // Church-wide public site uses church-scoped content only (not primary-branch mirror).
  const previewBranchActive = Boolean(isPreview && previewBranchId);
  const contentBranchId = explicitBranchSelected
    ? selectedBranch.id
    : previewBranchActive
      ? previewBranchId
      : null;
  const scopedBranchActive = explicitBranchSelected || previewBranchActive;
  const routingMode = input.routingMode === "tenant" ? "tenant" : "path";
  const organizationKey =
    tenant.organization && tenant.organization.key ? String(tenant.organization.key) : null;

  // Contact / address: branch mini-site uses that branch; church-wide may fall back to primary.
  const contactSettingsBranchId = scopedBranchActive ? contentBranchId : primaryBranchId;
  const { churchSettings: settings, branchSettings } = await loadPublicSettings(
    db,
    churchId,
    contactSettingsBranchId
  );
  const websiteStatus = settings ? settings.websiteStatus : "draft";
  const publicName = publicDemo.resolveCanonicalChurchName({
    publicName: settings && settings.publicName,
    churchDisplayName: tenant.church.displayName,
    organizationDisplayName:
      tenant.organization && tenant.organization.displayName
        ? tenant.organization.displayName
        : null,
    branchDisplayName: scopedBranchActive
      ? (selectedBranch && selectedBranch.displayName) ||
        (branchSettings && branchSettings.publicName) ||
        tenant.primaryBranch.displayName
      : tenant.primaryBranch.displayName,
    branchSpecific: scopedBranchActive,
  });

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
      organizationKey,
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

  const publicContact = buildPublicContact(settings, branchSettings, {
    preferChurch: !scopedBranchActive,
  });
  const canonicalTimezone =
    (settings && settings.defaultTimezone) ||
    (branchSettings && branchSettings.timezone) ||
    null;

  const pageResult = isPreview
    ? await resolvePreviewPage(db, {
        churchId,
        branchId: contentBranchId,
        pageKey,
      })
    : await resolvePublishedPage(db, {
        churchId,
        contentBranchId,
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
      const list = await resolvePreviewList(db, adminFn, churchId, contentBranchId);
      let items = (list.items || []).map(mapper);
      if (prepare) items = prepare(items);
      return { items, contentScope: list.contentScope };
    }
    const list = await resolvePublishedList(db, publishedFn, churchId, contentBranchId);
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

  // Branch mini website: published branch → church-wide → empty.
  // Church-wide site: church-wide → primary branch fallback for service times only → empty.
  let serviceTimesResolved = await resolvePublicServiceTimesEntries(db, {
    churchId,
    branchId: contentBranchId,
  });
  if (
    !scopedBranchActive &&
    serviceTimesResolved &&
    serviceTimesResolved.ok &&
    (!serviceTimesResolved.entries || serviceTimesResolved.entries.length === 0)
  ) {
    const primaryFallback = await resolvePublicServiceTimesEntries(db, {
      churchId,
      branchId: primaryBranchId,
    });
    if (
      primaryFallback &&
      primaryFallback.ok &&
      primaryFallback.entries &&
      primaryFallback.entries.length
    ) {
      serviceTimesResolved = {
        ...primaryFallback,
        source: "primary_fallback",
      };
    }
  }
  let serviceTimesEntries =
    serviceTimesResolved && Array.isArray(serviceTimesResolved.entries)
      ? serviceTimesResolved.entries
      : [];
  let serviceTimesSource =
    serviceTimesResolved && serviceTimesResolved.source
      ? serviceTimesResolved.source
      : null;

  {
    const contactList = isPreview
      ? await resolvePreviewList(
          db,
          contentAdmin.listAdminContactChannels,
          churchId,
          contentBranchId
        )
      : await resolvePublishedList(db, listPublishedContactChannels, churchId, contentBranchId);
    const allChannels = (contactList.items || []).map(mapContact);
    socialLinks = allChannels.filter((ch) => isSocialChannel(ch.channelType) && ch.href);
  }

  if (pageKey === "home") {
    homeTeasers.announcement = pickAnnouncementHighlight(pageSections);

    const ministries = await loadEntityList(
      listPublishedMinistries,
      contentAdmin.listAdminMinistries,
      mapMinistry
    );
    // Homepage teasers: featured subsets only (Stitch Phase 7 density).
    homeTeasers.ministries = (ministries.items || []).slice(0, 3);

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
    homeTeasers.events = (events.items || []).slice(0, 2);

    const sermons = await loadEntityList(
      listPublishedSermons,
      contentAdmin.listAdminSermons,
      mapSermon
    );
    homeTeasers.sermons = (sermons.items || []).slice(0, 1);
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

  const demoPack = publicDemo.buildPublicDemoPack({
    publicName,
    churchDisplayName: tenant.church.displayName,
    organizationDisplayName:
      tenant.organization && tenant.organization.displayName
        ? tenant.organization.displayName
        : null,
  });

  // Stage 2: published sites with sparse CMS get a complete sample presentation.
  // Draft CMS rows are never read here; soft-fill never invents live statistics.
  let homeDemoFallback = null;
  let aboutDemoFallback = null;
  let leadershipDemoFallback = null;
  let ministriesDemoFallback = null;
  let eventsDemoFallback = null;
  let sermonsDemoFallback = null;
  let contactDemoFallback = null;
  let givingDemoFallback = null;
  let usedPublicDemoFill = false;

  if (pageKey === "home") {
    homeDemoFallback = demoPack.home;
    if (!homeTeasers.ministries.length) {
      homeTeasers.ministries = demoPack.ministries.slice(0, 3);
      usedPublicDemoFill = true;
    }
    if (!homeTeasers.leaders.length) {
      homeTeasers.leaders = demoPack.leaders.slice(0, 3);
      usedPublicDemoFill = true;
    }
    if (!homeTeasers.events.length) {
      homeTeasers.events = demoPack.events.slice(0, 2);
      usedPublicDemoFill = true;
    }
    if (!homeTeasers.sermons.length) {
      homeTeasers.sermons = demoPack.sermons.slice(0, 1);
      usedPublicDemoFill = true;
    }
    homeTeasers = {
      ...homeTeasers,
      ministries: homeTeasers.ministries.map((m, i) => ({
        ...m,
        imageUrl: publicDemo.mediaOrFallback(
          m.imageUrl,
          demoPack.ministries[i % demoPack.ministries.length].imageUrl
        ),
      })),
      leaders: homeTeasers.leaders.map((l, i) => ({
        ...l,
        imageUrl: publicDemo.mediaOrFallback(
          l.imageUrl,
          demoPack.leaders[i % demoPack.leaders.length].imageUrl
        ),
      })),
      events: homeTeasers.events.map((e, i) => ({
        ...e,
        imageUrl: publicDemo.mediaOrFallback(
          e.imageUrl,
          demoPack.events[i % demoPack.events.length].imageUrl
        ),
      })),
      sermons: homeTeasers.sermons.map((s) => ({
        ...s,
        imageUrl: publicDemo.mediaOrFallback(s.imageUrl, demoPack.media.sermon),
      })),
    };
    if (usedPublicDemoFill || hasSections || hasHomeTeasers) {
      showEmptyState = false;
    }
  }

  if (pageKey === "about") {
    aboutDemoFallback = Object.freeze({
      heroHeading: demoPack.about.heroHeading,
      heroBody: demoPack.about.heroBody,
      heroMediaUrl: demoPack.about.heroMediaUrl,
      story: demoPack.about.story,
      storyMediaUrl: demoPack.about.story.mediaUrl,
      mission: demoPack.about.mission,
      vision: demoPack.about.vision,
      values: demoPack.about.values,
      beliefs: demoPack.about.beliefs,
      community: demoPack.about.community,
      gallery: demoPack.about.gallery,
    });
    showEmptyState = false;
  }

  if (pageKey === "leadership") {
    leadershipDemoFallback = Object.freeze({
      introHeading: demoPack.leadership.introHeading,
      introBody: demoPack.leadership.introBody,
      introMediaUrl: demoPack.leadership.introMediaUrl,
    });
    if (!entities.length) {
      entities = demoPack.leaders.slice();
      usedPublicDemoFill = true;
    } else {
      entities = entities.map((l, i) => ({
        ...l,
        imageUrl: publicDemo.mediaOrFallback(
          l.imageUrl,
          demoPack.leaders[i % demoPack.leaders.length].imageUrl
        ),
      }));
    }
    showEmptyState = false;
  }

  if (pageKey === "ministries") {
    ministriesDemoFallback = Object.freeze({
      introHeading: demoPack.ministriesPage.introHeading,
      introBody: demoPack.ministriesPage.introBody,
      introMediaUrl: demoPack.ministriesPage.introMediaUrl,
    });
    if (!entities.length) {
      entities = demoPack.ministries.slice();
      usedPublicDemoFill = true;
    } else {
      entities = entities.map((m, i) => ({
        ...m,
        imageUrl: publicDemo.mediaOrFallback(
          m.imageUrl,
          demoPack.ministries[i % demoPack.ministries.length].imageUrl
        ),
      }));
    }
    showEmptyState = false;
  }

  if (pageKey === "events") {
    eventsDemoFallback = Object.freeze({
      introHeading: demoPack.eventsPage.introHeading,
      introBody: demoPack.eventsPage.introBody,
      introMediaUrl: demoPack.eventsPage.introMediaUrl,
    });
    if (!entities.length) {
      entities = preparePublicEvents(demoPack.events.slice());
      usedPublicDemoFill = true;
    } else {
      entities = entities.map((e, i) => ({
        ...e,
        imageUrl: publicDemo.mediaOrFallback(
          e.imageUrl,
          demoPack.events[i % demoPack.events.length].imageUrl
        ),
      }));
    }
    if (showEnvBadge) {
      entities = softFillDemoEventImages(entities);
    }
    showEmptyState = false;
  }

  if (pageKey === "sermons") {
    sermonsDemoFallback = Object.freeze({
      introHeading: demoPack.sermonsPage.introHeading,
      introBody: demoPack.sermonsPage.introBody,
      introMediaUrl: demoPack.sermonsPage.introMediaUrl,
    });
    if (!entities.length) {
      entities = demoPack.sermons.slice();
      usedPublicDemoFill = true;
    } else {
      entities = entities.map((s, i) => ({
        ...s,
        imageUrl: publicDemo.mediaOrFallback(
          s.imageUrl,
          demoPack.sermons[i % demoPack.sermons.length].imageUrl
        ),
      }));
    }
    if (showEnvBadge) {
      entities = softFillDemoSermonImages(entities);
    }
    showEmptyState = false;
  }

  if (pageKey === "contact") {
    contactDemoFallback = Object.freeze({
      introHeading: demoPack.contactPage.introHeading,
      introBody: demoPack.contactPage.introBody,
      visitorGuidance: demoPack.contactPage.visitorGuidance,
      officeHoursHeading: demoPack.contactPage.officeHoursHeading,
      officeHoursBody: demoPack.contactPage.officeHoursBody,
      directionsHeading: demoPack.contactPage.directionsHeading,
      directionsBody: demoPack.contactPage.directionsBody,
      serviceReminderHeading: demoPack.contactPage.serviceReminderHeading,
      serviceReminderBody: demoPack.contactPage.serviceReminderBody,
    });
    showEmptyState = false;
  }

  if (pageKey === "giving") {
    givingDemoFallback = Object.freeze({
      introHeading: demoPack.givingPage.introHeading,
      introBody: demoPack.givingPage.introBody,
      whyHeading: demoPack.givingPage.whyHeading,
      whyItems: demoPack.givingPage.whyItems,
      stewardshipHeading: demoPack.givingPage.stewardshipHeading,
      stewardshipBody: demoPack.givingPage.stewardshipBody,
      accountability: demoPack.givingPage.accountability,
      assistanceContact: demoPack.givingPage.assistanceContact,
    });
    if (!entities.length) {
      entities = demoPack.givingMethods.map((m) => ({
        ...m,
        scope: "church",
        branchId: null,
      }));
      usedPublicDemoFill = true;
    }
    showEmptyState = false;
  }

  let resolvedPublicContact = publicContact;
  if (!publicContact.hasAny) {
    resolvedPublicContact = {
      ...demoPack.contact,
      latitude: publicContact.latitude,
      longitude: publicContact.longitude,
    };
    usedPublicDemoFill = true;
  }

  // Soft-fill social placeholders without href must not render (no empty icon chips).
  if (!socialLinks.length) {
    socialLinks = (demoPack.socialLinks || []).filter((link) => link && link.href);
  }

  // Service times: never replace intentional emptiness with demo pack content.

  const resolvedFooterTagline = footerTagline || demoPack.footer.description;

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
        backHref:
          input.previewMeta && input.previewMeta.backHref != null
            ? input.previewMeta.backHref
            : "/hq/content",
        editHref: (() => {
          if (input.previewMeta && Object.prototype.hasOwnProperty.call(input.previewMeta, "editHref")) {
            return input.previewMeta.editHref;
          }
          return `/hq/content/pages/${pageKey}`;
        })(),
        bannerLabel:
          input.previewMeta && input.previewMeta.bannerLabel != null
            ? String(input.previewMeta.bannerLabel)
            : "Preview",
        bannerDetail:
          input.previewMeta && input.previewMeta.bannerDetail != null
            ? String(input.previewMeta.bannerDetail)
            : "Admin preview (includes drafts). Not visible to the public unless published.",
      }
    : null;

  const visitHref = pathPrefix
    ? `${pathPrefix}/contact`
    : "/contact";

  const publicPaths = buildPublicWebsitePaths({
    organizationKey,
    branchKey: explicitBranchSelected ? selectedBranch.key : null,
    mode: routingMode,
  });

  let branchSwitcher = [];
  try {
    const listed = await listPublicWebsiteBranches(db, churchId);
    if (listed.ok) {
      branchSwitcher = (listed.branches || []).map((b) => {
        const href =
          routingMode === "tenant"
            ? tenantBranchHomePath(b.key)
            : publicBranchHomePath(organizationKey, b.key);
        return {
          key: b.key,
          displayName: b.displayName,
          isPrimary: Boolean(b.isPrimary),
          isCurrent: explicitBranchSelected
            ? b.key === selectedBranch.key
            : Boolean(b.isPrimary),
          href,
        };
      });
    }
  } catch {
    branchSwitcher = [];
  }

  const websiteScope = {
    scopeType: scopedBranchActive ? "branch" : "church",
    branchId: explicitBranchSelected
      ? selectedBranch.id
      : previewBranchActive
        ? previewBranchId
        : null,
    branchKey: explicitBranchSelected ? selectedBranch.key : null,
    contentBranchId,
  };

  const churchView = {
    id: churchId,
    key: tenant.church.key || null,
    displayName: tenant.church.displayName || "",
  };
  const branchView = explicitBranchSelected
    ? {
        id: selectedBranch.id,
        key: selectedBranch.key,
        displayName: selectedBranch.displayName,
        branchType: selectedBranch.branchType,
        isPrimary: selectedBranch.isPrimary,
      }
    : previewBranchActive
      ? {
          id: previewBranchId,
          key: null,
          displayName:
            (branchSettings && branchSettings.publicName) ||
            tenant.primaryBranch.displayName ||
            "",
          branchType: null,
          isPrimary: false,
        }
      : {
          id: primaryBranchId,
          key: tenant.primaryBranch.key || null,
          displayName: tenant.primaryBranch.displayName || "",
          branchType: null,
          isPrimary: true,
        };

  const churchHomeHref =
    routingMode === "tenant"
      ? "/"
      : publicChurchHomePath(organizationKey) || pathPrefix || "/";

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
    footerTagline: resolvedFooterTagline,
    publicContact: resolvedPublicContact,
    socialLinks,
    serviceTimesEntries,
    serviceTimesSource,
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
    portalHref: null,
    portalLabel: null,
    apexHref: "https://blessboard.org/",
    visitHref,
    cssHref: "/blessboard/v5/tenant-public.css?v=51",
    pathPrefix,
    homeHref: pathPrefix || "/",
    churchHomeHref,
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
    usedPublicDemoFill,
    websiteAdmin: null,
    church: churchView,
    branch: branchView,
    websiteScope,
    branchSwitcher,
    canonicalUrl: seo && seo.canonicalUrl ? seo.canonicalUrl : null,
    publicPaths,
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
