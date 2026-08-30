"use strict";

/**
 * Validation helpers for Phase 7 Stage 5 structured website drafts.
 */

const { PUBLIC_MEDIA_PATH_PREFIX } = require("../media/mediaConstants");
const {
  validateServiceTimeEntries,
} = require("./homeServiceTimesService");
const contentAdmin = require("./publicContentAdminService");
const { MEDIA: DEMO_MEDIA } = require("./tenantPublicDemoContent");

const DRAFT_KINDS = Object.freeze([
  "image",
  "video",
  "service_times",
  "leader",
  "ministry",
  "event",
  "sermon",
  "giving_method",
  "social_link",
  "page_section",
]);

// Kinds that only carry ordering intent; they have no upsert payload.
const REORDER_ONLY_KINDS = Object.freeze(["page_section"]);

const SOCIAL_LINK_TYPES = Object.freeze([
  "facebook",
  "instagram",
  "youtube",
  "twitter",
  "x",
  "linkedin",
  "social",
]);

const DEMO_IMAGE_PATHS = Object.freeze(
  new Set(Object.values(DEMO_MEDIA || {}).filter((p) => typeof p === "string" && p.startsWith("/")))
);

const MEDIA_ASSET_PATH_RE = new RegExp(
  `^${PUBLIC_MEDIA_PATH_PREFIX.replace(/\//g, "\\/")}[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
  "i"
);

const VIDEO_HOST_ALLOWLIST = Object.freeze(
  new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "www.youtu.be",
    "vimeo.com",
    "www.vimeo.com",
    "player.vimeo.com",
  ])
);

function mapError(code, message, status = 400) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function sanitizePlain(raw, max) {
  const value = String(raw == null ? "" : raw)
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (value.length > max) return { ok: false, error: `Keep this under ${max} characters.` };
  return { ok: true, value };
}

/**
 * Safe image URL: https, /_bb/media/:uuid, or known demo /church/images path.
 * @param {string} raw
 */
function validateImageUrl(raw) {
  if (raw == null || raw === "") return { ok: true, value: "" };
  const plain = sanitizePlain(raw, 2000);
  if (!plain.ok) return plain;
  const value = plain.value;
  if (value.startsWith("/") && !value.startsWith("//")) {
    if (value.includes("\\") || value.includes("\0") || value.includes("..")) {
      return { ok: false, error: "That image path is not allowed." };
    }
    if (MEDIA_ASSET_PATH_RE.test(value)) return { ok: true, value };
    if (value.startsWith("/church/images/") && !/\s/.test(value)) {
      return { ok: true, value };
    }
    return { ok: false, error: "Choose an uploaded or demo image." };
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") {
      return { ok: false, error: "Image links must use https." };
    }
    return { ok: true, value: parsed.toString() };
  } catch {
    return { ok: false, error: "Enter a valid image link." };
  }
}

/**
 * External video URL allowlist (YouTube / Vimeo) or empty.
 * @param {string} raw
 */
function validateVideoUrl(raw) {
  if (raw == null || raw === "") return { ok: true, value: "" };
  const plain = sanitizePlain(raw, 2000);
  if (!plain.ok) return plain;
  const value = plain.value;
  if (value.startsWith("/") && MEDIA_ASSET_PATH_RE.test(value)) {
    // Uploaded video files are not supported; media assets are images/PDF only.
    return {
      ok: false,
      error: "Video file upload is not supported. Paste a YouTube or Vimeo link.",
    };
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "Enter a valid YouTube or Vimeo link." };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Video links must use https." };
  }
  const host = String(parsed.hostname || "").toLowerCase();
  if (!VIDEO_HOST_ALLOWLIST.has(host)) {
    return { ok: false, error: "Only YouTube and Vimeo links are supported." };
  }
  // Block javascript: already handled by URL parser; reject query-embedded HTML.
  if (/[<>"]/.test(value)) {
    return { ok: false, error: "Video link contains invalid characters." };
  }
  return { ok: true, value: parsed.toString() };
}

/**
 * Focal position for fit (no true crop pipeline).
 * @param {unknown} raw
 */
function validateFocal(raw) {
  if (raw == null || raw === "") return { ok: true, value: "center" };
  const value = String(raw).trim().toLowerCase();
  const allowed = new Set([
    "center",
    "top",
    "bottom",
    "left",
    "right",
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ]);
  if (!allowed.has(value)) {
    return { ok: false, error: "Choose a valid focal position." };
  }
  return { ok: true, value };
}

/**
 * @param {string} kind
 * @param {object} payload
 * @param {string} op
 */
function validateStructuredPayload(kind, payload, op) {
  const body = payload && typeof payload === "object" ? payload : {};
  if (op === "remove") {
    return { ok: true, payload: { removed: true } };
  }
  if (op === "reorder") {
    if (!Array.isArray(body.order)) {
      return { ok: false, error: "Reorder requires an ordered list of items." };
    }
    const order = body.order.map((x) => String(x || "").trim()).filter(Boolean);
    if (!order.length) return { ok: false, error: "Reorder list cannot be empty." };
    // A reorder draft must reproduce the intended order deterministically, so
    // duplicates are a corrupt payload rather than something to silently dedupe.
    if (new Set(order).size !== order.length) {
      return { ok: false, error: "Reorder list cannot repeat the same item." };
    }
    return { ok: true, payload: { order } };
  }
  if (op === "visibility") {
    const sectionKey = String(body.sectionKey || "").trim();
    if (!sectionKey) return { ok: false, error: "Section is required." };
    return { ok: true, payload: { sectionKey, hidden: body.hidden === true } };
  }
  if (op === "restore_default") {
    const sectionKey = String(body.sectionKey || "").trim();
    if (!sectionKey) return { ok: false, error: "Section is required." };
    return { ok: true, payload: { sectionKey } };
  }
  if (op === "add_section") {
    const sectionKey = String(body.sectionKey || "").trim();
    if (!sectionKey) return { ok: false, error: "Section key is required." };
    const sectionType = String(body.sectionType || "plain_text").trim();
    const heading = sanitizePlain(body.heading, 200);
    if (!heading.ok) return heading;
    const bodyText = sanitizePlain(body.bodyText, 4000);
    if (!bodyText.ok) return bodyText;
    return {
      ok: true,
      payload: {
        sectionKey,
        sectionType,
        heading: heading.value,
        bodyText: bodyText.value,
        sortOrder: Number(body.sortOrder) || 0,
        layout: body.layout ? String(body.layout) : null,
      },
    };
  }

  if (REORDER_ONLY_KINDS.includes(kind)) {
    return { ok: false, error: "This item only supports ordering changes." };
  }

  if (kind === "image") {
    const url = validateImageUrl(body.imageUrl != null ? body.imageUrl : body.url);
    if (!url.ok) return url;
    const alt = sanitizePlain(body.altText != null ? body.altText : body.alt, 200);
    if (!alt.ok) return alt;
    if (url.value && !alt.value) {
      return { ok: false, error: "Add alternative text for this image." };
    }
    const focal = validateFocal(body.focal);
    if (!focal.ok) return focal;
    return {
      ok: true,
      payload: {
        imageUrl: url.value,
        altText: alt.value,
        focal: focal.value,
        fit: body.fit === "contain" ? "contain" : "cover",
      },
    };
  }

  if (kind === "video") {
    const url = validateVideoUrl(body.videoUrl != null ? body.videoUrl : body.url);
    if (!url.ok) return url;
    const title = sanitizePlain(body.title, 200);
    if (!title.ok) return title;
    const thumb = validateImageUrl(body.thumbnailUrl != null ? body.thumbnailUrl : body.thumbnail);
    if (!thumb.ok) return thumb;
    return {
      ok: true,
      payload: {
        videoUrl: url.value,
        title: title.value,
        thumbnailUrl: thumb.value,
      },
    };
  }

  if (kind === "service_times") {
    const validated = validateServiceTimeEntries(body.entries);
    if (!validated.ok) {
      return { ok: false, error: validated.message || "Service times are invalid." };
    }
    const entries = (validated.entries || []).map((e, idx) => ({
      ...e,
      id: e.id || `svc-${idx + 1}`,
      primary: Boolean(e.primary),
      temporaryNotice:
        e.temporaryNotice != null
          ? String(e.temporaryNotice).slice(0, 300)
          : e.note || null,
      campus: e.campus != null ? String(e.campus).slice(0, 120) : null,
      branchId: e.branchId || null,
    }));
    const primaryCount = entries.filter((e) => e.primary && e.enabled !== false).length;
    if (primaryCount > 1) {
      return { ok: false, error: "Only one service can be marked primary." };
    }
    return { ok: true, payload: { entries } };
  }

  if (kind === "leader") {
    const image = validateImageUrl(body.imageUrl);
    if (!image.ok) return image;
    const built = contentAdmin.buildLeaderFields(
      {
        displayName: body.displayName || body.fullName || body.name,
        roleTitle: body.roleTitle || body.role,
        biography: body.biography != null ? body.biography : body.bio,
        sortOrder: body.sortOrder != null ? body.sortOrder : body.displayOrder,
        status:
          body.visible === false || body.hidden === true
            ? "archived"
            : body.status || "draft",
      },
      { partial: false }
    );
    if (!built.ok) {
      return { ok: false, error: "Check the leadership fields and try again." };
    }
    const email = sanitizePlain(body.email, 254);
    if (!email.ok) return email;
    const phone = sanitizePlain(body.phone, 40);
    if (!phone.ok) return phone;
    let socialUrl = "";
    if (body.socialUrl) {
      const s = sanitizePlain(body.socialUrl, 500);
      if (!s.ok) return s;
      if (s.value) {
        try {
          const u = new URL(s.value);
          if (u.protocol !== "https:") {
            return { ok: false, error: "Social links must use https." };
          }
          socialUrl = u.toString();
        } catch {
          return { ok: false, error: "Enter a valid social link." };
        }
      }
    }
    return {
      ok: true,
      payload: {
        ...built.fields,
        imageUrl: image.value || null,
        email: email.value || null,
        phone: phone.value || null,
        socialUrl: socialUrl || null,
        seniorLeader: Boolean(body.seniorLeader),
        visible: !(body.visible === false || body.hidden === true),
        contactPublic: Boolean(body.contactPublic),
      },
    };
  }

  if (kind === "ministry") {
    const image = validateImageUrl(body.imageUrl);
    if (!image.ok) return image;
    const built = contentAdmin.buildMinistryFields(
      {
        name: body.name || body.ministryName,
        summary: body.summary,
        description: body.description,
        meetingDay: body.meetingDay || body.meetingSchedule,
        contactEmail: body.contactEmail || body.contact,
        sortOrder: body.sortOrder != null ? body.sortOrder : body.displayOrder,
        joinPolicy: body.joinPolicy || "request",
        status:
          body.visible === false || body.hidden === true
            ? "archived"
            : body.status || "draft",
      },
      { partial: false }
    );
    if (!built.ok) {
      return { ok: false, error: "Check the ministry fields and try again." };
    }
    let joinUrl = "";
    if (body.joinUrl || body.learnMoreUrl) {
      const raw = String(body.joinUrl || body.learnMoreUrl || "").trim();
      if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("..") && !/[\s<>"]/.test(raw)) {
        joinUrl = raw.slice(0, 500);
      } else {
        const checked = contentAdmin.httpsMediaUrl(raw, "join_url");
        if (!checked.ok) {
          return { ok: false, error: "Enter a valid join or learn-more link." };
        }
        joinUrl = checked.value || "";
      }
    }
    return {
      ok: true,
      payload: {
        ...built.fields,
        imageUrl: image.value || null,
        audience: sanitizePlain(body.audience || body.intendedAudience, 120).value || null,
        leaderName: sanitizePlain(body.leaderName || body.ministryLeader, 120).value || null,
        joinUrl: joinUrl || null,
        featured: Boolean(body.featured),
        visible: !(body.visible === false || body.hidden === true),
      },
    };
  }

  if (kind === "event") {
    const image = validateImageUrl(body.imageUrl || body.coverImage);
    if (!image.ok) return image;
    const built = contentAdmin.buildEventFields(
      {
        title: body.title || body.eventTitle,
        summary: body.description || body.summary,
        startsAt: body.startsAt || combineDateTime(body.date, body.startTime),
        endsAt:
          body.endsAt != null
            ? body.endsAt
            : body.endTime
              ? combineDateTime(body.date, body.endTime)
              : null,
        timezone: body.timezone || "UTC",
        location: body.location,
        registrationUrl: body.registrationUrl,
        status:
          body.visible === false || body.hidden === true
            ? "archived"
            : body.status || "draft",
      },
      { partial: false }
    );
    if (!built.ok) {
      return { ok: false, error: "Check the event fields and try again." };
    }
    if (built.fields.startsAt && built.fields.endsAt) {
      const start = new Date(built.fields.startsAt).getTime();
      const end = new Date(built.fields.endsAt).getTime();
      if (!Number.isNaN(start) && !Number.isNaN(end) && end < start) {
        return { ok: false, error: "End time cannot be earlier than start time." };
      }
    }
    return {
      ok: true,
      payload: {
        ...built.fields,
        imageUrl: image.value || null,
        organizer: sanitizePlain(body.organizer, 120).value || null,
        featured: Boolean(body.featured),
        visible: !(body.visible === false || body.hidden === true),
      },
    };
  }

  if (kind === "sermon") {
    const summaryParts = [];
    if (body.series) summaryParts.push(`Category: ${String(body.series).slice(0, 64)}`);
    if (body.scripture) summaryParts.push(`Scripture: ${String(body.scripture).slice(0, 120)}`);
    if (body.description || body.summary) {
      summaryParts.push(String(body.description || body.summary).slice(0, 4000));
    }
    const mediaUrl = body.videoUrl || body.audioUrl || body.mediaUrl || null;
    let safeMedia = null;
    if (mediaUrl) {
      const asVideo = validateVideoUrl(mediaUrl);
      if (asVideo.ok) {
        safeMedia = asVideo.value;
      } else {
        const asHttps = validateImageUrl(mediaUrl);
        if (!asHttps.ok) return asVideo;
        safeMedia = asHttps.value;
      }
    }
    const built = contentAdmin.buildSermonFields(
      {
        title: body.title || body.sermonTitle,
        speakerName: body.speakerName || body.speaker,
        preachedAt: body.preachedAt || body.date,
        summary: summaryParts.join(". "),
        status:
          body.visible === false || body.hidden === true
            ? "archived"
            : body.status || "draft",
      },
      { partial: false }
    );
    if (!built.ok) {
      return { ok: false, error: "Check the sermon fields and try again." };
    }
    const thumb = validateImageUrl(body.thumbnailUrl || body.imageUrl || body.thumbnail);
    if (!thumb.ok) return thumb;
    return {
      ok: true,
      payload: {
        ...built.fields,
        mediaUrl: safeMedia,
        scripture: sanitizePlain(body.scripture, 120).value || null,
        series: sanitizePlain(body.series, 64).value || null,
        imageUrl: thumb.value || null,
        featured: Boolean(body.featured),
        visible: !(body.visible === false || body.hidden === true),
      },
    };
  }

  if (kind === "giving_method") {
    const qr = validateImageUrl(body.qrImageUrl || body.qrImage || "");
    if (!qr.ok) return qr;
    const built = contentAdmin.buildGivingFields(
      {
        methodType: body.methodType || body.type || "other",
        label: body.label || body.name || body.methodName,
        description: body.description,
        accountDetails: body.accountDetails || body.accountOrPaymentDetails,
        instructions: body.instructions,
        externalUrl: body.externalUrl || body.paymentUrl,
        buttonLabel: body.buttonLabel || body.ctaLabel,
        qrImageUrl: qr.value || null,
        sortOrder: body.sortOrder != null ? body.sortOrder : body.displayOrder,
        status:
          body.visible === false || body.hidden === true
            ? "archived"
            : body.status || "draft",
      },
      { partial: false }
    );
    if (!built.ok) {
      return { ok: false, error: "Check the giving method fields and try again." };
    }
    return {
      ok: true,
      payload: {
        ...built.fields,
        qrImageUrl: qr.value || null,
        visible: !(body.visible === false || body.hidden === true),
      },
    };
  }

  if (kind === "social_link") {
    const channelType = String(body.channelType || body.platformType || body.platform || "social")
      .trim()
      .toLowerCase();
    if (!SOCIAL_LINK_TYPES.includes(channelType) && !/^[a-z][a-z0-9_-]{0,31}$/.test(channelType)) {
      return { ok: false, error: "Choose a supported social platform." };
    }
    const label =
      sanitizePlain(body.label || body.platformLabel || channelType, 120).value || channelType;
    const rawUrl = String(body.value || body.url || body.href || "").trim();
    if (!rawUrl) {
      return { ok: false, error: "Enter a social profile URL." };
    }
    let href = "";
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { ok: false, error: "Social links must use http or https." };
      }
      if (parsed.protocol === "http:") {
        return { ok: false, error: "Social links must use https." };
      }
      href = parsed.toString();
    } catch {
      return { ok: false, error: "Enter a valid https social URL." };
    }
    if (href.length > 500) {
      return { ok: false, error: "That link is too long." };
    }
    return {
      ok: true,
      payload: {
        channelType,
        label,
        value: href,
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 10,
        status:
          body.visible === false || body.hidden === true
            ? "archived"
            : body.status || "draft",
        visible: !(body.visible === false || body.hidden === true),
      },
    };
  }

  return { ok: false, error: "Unknown editor type." };
}

function combineDateTime(date, time) {
  const d = String(date || "").trim();
  const t = String(time || "00:00").trim();
  if (!d) return null;
  const iso = `${d}T${/^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseStructuredMediaAssetId(raw) {
  const value = String(raw == null ? "" : raw).trim();
  if (!MEDIA_ASSET_PATH_RE.test(value)) return null;
  return value.slice(PUBLIC_MEDIA_PATH_PREFIX.length);
}

function collectStructuredImageUrls(payload) {
  if (!payload || typeof payload !== "object") return [];
  const keys = ["imageUrl", "thumbnailUrl", "qrImageUrl", "mediaUrl", "coverImage"];
  const out = [];
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) out.push(value.trim());
  }
  return out;
}

function isDemoImagePath(path) {
  return DEMO_IMAGE_PATHS.has(String(path || ""));
}

function listDemoImages() {
  return Object.entries(DEMO_MEDIA || {}).map(([key, url]) => ({
    key,
    url,
    label: key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()),
  }));
}

module.exports = {
  DRAFT_KINDS,
  REORDER_ONLY_KINDS,
  DEMO_IMAGE_PATHS,
  VIDEO_HOST_ALLOWLIST,
  SOCIAL_LINK_TYPES,
  validateImageUrl,
  validateVideoUrl,
  validateFocal,
  validateStructuredPayload,
  isDemoImagePath,
  listDemoImages,
  mapError,
  parseStructuredMediaAssetId,
  collectStructuredImageUrls,
};
