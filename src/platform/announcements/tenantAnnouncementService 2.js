"use strict";

/**
 * Shared Moovex tenant announcements (AN01–AN05).
 *
 * Scheduler dependency: there is NO background job that promotes
 * `scheduled` → `published`. Visibility is evaluated lazily at read time
 * via resolveEffectiveStatus(). Manual publish/unpublish/archive remain
 * available. Overnight rule: do not enable workers or live notifications.
 */

const repo = require("./tenantAnnouncementRepository");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  CONFLICT: "conflict",
  POLICY: "policy",
  LOOKUP_ERROR: "lookup_error",
});

/** Explicit overnight dependency note for callers/docs/tests. */
const SCHEDULER_DEPENDENCY = Object.freeze({
  available: false,
  mode: "lazy_read_time_evaluation",
  reason:
    "No background announcement scheduler is configured on V8 overnight hosts. " +
    "Scheduled announcements become publicly visible when starts_at <= now " +
    "(and ends_at is null or ends_at > now), without a worker rewriting status.",
});

const PRODUCT_CODES = Object.freeze({
  BLESSBOARD: "blessboard",
  ACTIVECLINIC: "activeclinic",
});

const ANN_STATUSES = Object.freeze([
  "draft",
  "scheduled",
  "published",
  "expired",
  "archived",
]);

const HTML_HINT = /<\/?[a-z][\s\S]*>/i;
const MEDIA_PATH_RE =
  /^\/(_bb\/media\/|media\/|_ac\/media\/)[A-Za-z0-9/_.:\-]+$/;
const TZ_RE = /^[A-Za-z0-9_+\/\-]{1,64}$/;

async function withClient(db, fn) {
  if (db && typeof db.connect === "function") {
    const client = await db.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
  return fn(db);
}

function authorizeOrDeny(authz) {
  if (!authz || typeof authz !== "function") {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "authz_required" };
  }
  return null;
}

async function runAuthz(authz, action) {
  const denied = authorizeOrDeny(authz);
  if (denied) return denied;
  const result = await authz(action);
  if (!result || result.ok !== true) {
    return {
      ok: false,
      status: STATUS.FORBIDDEN,
      reason: (result && result.reason) || "forbidden",
    };
  }
  return { ok: true };
}

function assertProduct(productCode) {
  const code = String(productCode || "").trim().toLowerCase();
  if (code !== PRODUCT_CODES.BLESSBOARD && code !== PRODUCT_CODES.ACTIVECLINIC) {
    return { ok: false, reason: "product_code" };
  }
  return { ok: true, productCode: code };
}

function assertOrg(organizationId) {
  const id = String(organizationId || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, reason: "organization_id" };
  return { ok: true, organizationId: id };
}

function plainText(value, field, { required, max }) {
  if (value == null || value === "") {
    return required ? { ok: false, reason: field } : { ok: true, value: null };
  }
  const s = String(value).trim();
  if (HTML_HINT.test(s)) return { ok: false, reason: `${field}_html_not_allowed` };
  if (!s) return required ? { ok: false, reason: field } : { ok: true, value: null };
  if (s.length > max) return { ok: false, reason: `${field}_too_long` };
  return { ok: true, value: s };
}

function parseInstant(raw, field) {
  if (raw == null || raw === "") return { ok: true, value: null };
  const d = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(d.getTime())) return { ok: false, reason: `${field}_invalid` };
  return { ok: true, value: d.toISOString() };
}

function parseTimezone(raw) {
  const tz = String(raw == null || raw === "" ? "UTC" : raw).trim();
  if (!TZ_RE.test(tz)) return { ok: false, reason: "timezone" };
  return { ok: true, value: tz };
}

function parseMedia(input) {
  const ref = plainText(input.mediaAssetRef, "media_asset_ref", {
    required: false,
    max: 200,
  });
  if (!ref.ok) return ref;
  const url = plainText(input.mediaUrl, "media_url", { required: false, max: 2000 });
  if (!url.ok) return url;
  if (url.value) {
    if (url.value.startsWith("/")) {
      if (!MEDIA_PATH_RE.test(url.value) || url.value.includes("..")) {
        return { ok: false, reason: "media_url_unsafe" };
      }
    } else {
      try {
        const u = new URL(url.value);
        if (u.protocol !== "https:") return { ok: false, reason: "media_url_https_required" };
      } catch {
        return { ok: false, reason: "media_url_invalid" };
      }
    }
  }
  return { ok: true, mediaAssetRef: ref.value, mediaUrl: url.value };
}

/**
 * Lazy effective status for public rendering (no worker).
 * @param {object} ann
 * @param {Date} [now]
 */
function resolveEffectiveStatus(ann, now) {
  const clock = now instanceof Date ? now : new Date();
  const stored = String((ann && ann.status) || "draft");
  if (stored === "archived") return "archived";
  if (stored === "draft") return "draft";
  if (stored === "expired") return "expired";

  const starts = ann.startsAt ? new Date(ann.startsAt) : null;
  const ends = ann.endsAt ? new Date(ann.endsAt) : null;

  if (stored === "scheduled") {
    if (starts && starts.getTime() > clock.getTime()) return "scheduled";
    if (ends && ends.getTime() <= clock.getTime()) return "expired";
    return "published";
  }

  if (stored === "published") {
    if (ends && ends.getTime() <= clock.getTime()) return "expired";
    if (starts && starts.getTime() > clock.getTime()) return "scheduled";
    return "published";
  }

  return stored;
}

function isPubliclyVisible(ann, now) {
  return resolveEffectiveStatus(ann, now) === "published";
}

function presentSafe(ann, now) {
  if (!ann) return null;
  const effectiveStatus = resolveEffectiveStatus(ann, now);
  return {
    ...ann,
    effectiveStatus,
    publiclyVisible: effectiveStatus === "published",
    // Never emit raw HTML; body is plain text
    body: String(ann.body || ""),
    title: String(ann.title || ""),
    mediaUrl:
      ann.mediaUrl &&
      (ann.mediaUrl.startsWith("https://") || MEDIA_PATH_RE.test(ann.mediaUrl))
        ? ann.mediaUrl
        : null,
  };
}

async function createAnnouncement(db, input) {
  const org = assertOrg(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: org.reason };
  const product = assertProduct(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };
  const gate = await runAuthz(input.authz, "manage");
  if (!gate.ok) return gate;

  const title = plainText(input.title, "title", { required: true, max: 200 });
  if (!title.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: title.reason };
  const body = plainText(input.body, "body", { required: true, max: 20000 });
  if (!body.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: body.reason };
  const tz = parseTimezone(input.timezone);
  if (!tz.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: tz.reason };
  const starts = parseInstant(input.startsAt, "starts_at");
  if (!starts.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: starts.reason };
  const ends = parseInstant(input.endsAt, "ends_at");
  if (!ends.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: ends.reason };
  if (starts.value && ends.value && new Date(ends.value) < new Date(starts.value)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ends_before_starts" };
  }
  const media = parseMedia(input || {});
  if (!media.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: media.reason };

  let status = String(input.status || "draft").trim().toLowerCase();
  if (!ANN_STATUSES.includes(status) || status === "expired" || status === "archived") {
    status = "draft";
  }
  if (status === "scheduled" && !starts.value) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "starts_at_required" };
  }
  if (status === "published" && !input.confirmPublish) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "confirm_publish" };
  }

  try {
    return await withClient(db, async (client) => {
      const item = await repo.insertAnnouncement(client, {
        organizationId: org.organizationId,
        productCode: product.productCode,
        title: title.value,
        body: body.value,
        status,
        timezone: tz.value,
        startsAt: starts.value,
        endsAt: ends.value,
        publishedAt: status === "published" ? new Date().toISOString() : null,
        mediaAssetRef: media.mediaAssetRef,
        mediaUrl: media.mediaUrl,
        branchId: input.branchId || null,
        facilityId: input.facilityId || null,
        createdByIdentityId: input.actorIdentityId || null,
      });
      await repo.insertEvent(client, {
        announcementId: item.id,
        organizationId: org.organizationId,
        productCode: product.productCode,
        fromStatus: null,
        toStatus: status,
        eventCode: status === "scheduled" ? "scheduled" : status === "published" ? "published" : "created",
        summary: "Announcement created",
        actorIdentityId: input.actorIdentityId || null,
      });
      return {
        ok: true,
        status: STATUS.OK,
        item: presentSafe(item),
        scheduler: SCHEDULER_DEPENDENCY,
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "error",
    };
  }
}

async function updateAnnouncement(db, input) {
  const org = assertOrg(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: org.reason };
  const product = assertProduct(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: product.reason };
  const gate = await runAuthz(input.authz, "manage");
  if (!gate.ok) return gate;
  const id = String(input.id || "").trim();
  if (!id) return { ok: false, status: STATUS.INVALID_INPUT, reason: "id" };

  try {
    return await withClient(db, async (client) => {
      const existing = await repo.getAnnouncementById(client, {
        id,
        organizationId: org.organizationId,
        productCode: product.productCode,
      });
      if (!existing) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      if (existing.status === "archived") {
        return { ok: false, status: STATUS.CONFLICT, reason: "archived_immutable" };
      }

      const patch = {
        id,
        organizationId: org.organizationId,
        productCode: product.productCode,
        updatedByIdentityId: input.actorIdentityId || null,
      };
      if (input.title !== undefined) {
        const title = plainText(input.title, "title", { required: true, max: 200 });
        if (!title.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: title.reason };
        patch.title = title.value;
      }
      if (input.body !== undefined) {
        const body = plainText(input.body, "body", { required: true, max: 20000 });
        if (!body.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: body.reason };
        patch.body = body.value;
      }
      if (input.timezone !== undefined) {
        const tz = parseTimezone(input.timezone);
        if (!tz.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: tz.reason };
        patch.timezone = tz.value;
      }
      if (input.startsAt !== undefined) {
        const starts = parseInstant(input.startsAt, "starts_at");
        if (!starts.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: starts.reason };
        patch.setStartsAt = true;
        patch.startsAt = starts.value;
      }
      if (input.endsAt !== undefined) {
        const ends = parseInstant(input.endsAt, "ends_at");
        if (!ends.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: ends.reason };
        patch.setEndsAt = true;
        patch.endsAt = ends.value;
      }
      if (input.mediaAssetRef !== undefined || input.mediaUrl !== undefined) {
        const media = parseMedia({
          mediaAssetRef:
            input.mediaAssetRef !== undefined ? input.mediaAssetRef : existing.mediaAssetRef,
          mediaUrl: input.mediaUrl !== undefined ? input.mediaUrl : existing.mediaUrl,
        });
        if (!media.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: media.reason };
        patch.setMediaAssetRef = true;
        patch.mediaAssetRef = media.mediaAssetRef;
        patch.setMediaUrl = true;
        patch.mediaUrl = media.mediaUrl;
      }
      if (input.status !== undefined) {
        const next = String(input.status).trim().toLowerCase();
        if (!ANN_STATUSES.includes(next)) {
          return { ok: false, status: STATUS.INVALID_INPUT, reason: "status" };
        }
        if (next === "published" && existing.status !== "published") {
          if (!input.confirmPublish) {
            return { ok: false, status: STATUS.INVALID_INPUT, reason: "confirm_publish" };
          }
          patch.setPublishedAt = true;
          patch.publishedAt = new Date().toISOString();
        }
        if (next === "scheduled") {
          const startVal =
            patch.startsAt !== undefined ? patch.startsAt : existing.startsAt;
          if (!startVal) {
            return { ok: false, status: STATUS.INVALID_INPUT, reason: "starts_at_required" };
          }
        }
        if (
          (next === "draft" || next === "archived") &&
          existing.status === "published"
        ) {
          patch.setUnpublishedAt = true;
          patch.unpublishedAt = new Date().toISOString();
        }
        patch.status = next;
      }

      const startBound =
        patch.startsAt !== undefined ? patch.startsAt : existing.startsAt;
      const endBound = patch.endsAt !== undefined ? patch.endsAt : existing.endsAt;
      if (startBound && endBound && new Date(endBound) < new Date(startBound)) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "ends_before_starts" };
      }

      const updated = await repo.updateAnnouncement(client, patch);
      await repo.insertEvent(client, {
        announcementId: id,
        organizationId: org.organizationId,
        productCode: product.productCode,
        fromStatus: existing.status,
        toStatus: updated.status,
        eventCode:
          patch.status === "published"
            ? "published"
            : patch.status === "scheduled"
              ? "scheduled"
              : patch.status === "archived"
                ? "archived"
                : "updated",
        summary: "Announcement updated",
        actorIdentityId: input.actorIdentityId || null,
      });
      return {
        ok: true,
        status: STATUS.OK,
        item: presentSafe(updated),
        scheduler: SCHEDULER_DEPENDENCY,
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "error",
    };
  }
}

async function listAnnouncements(db, input) {
  const org = assertOrg(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, items: [], reason: org.reason };
  const product = assertProduct(input && input.productCode);
  if (!product.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, items: [], reason: product.reason };
  }
  const gate = await runAuthz(input.authz, "view");
  if (!gate.ok) return { ...gate, items: [] };
  try {
    const items = await withClient(db, (client) =>
      repo.listAnnouncements(client, {
        organizationId: org.organizationId,
        productCode: product.productCode,
        status: input.status || null,
        limit: input.limit,
      })
    );
    return {
      ok: true,
      status: STATUS.OK,
      items: items.map((i) => presentSafe(i)),
      scheduler: SCHEDULER_DEPENDENCY,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, items: [], reason: "lookup" };
  }
}

async function getAnnouncement(db, input) {
  const org = assertOrg(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, item: null };
  const product = assertProduct(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, item: null };
  const gate = await runAuthz(input.authz, "view");
  if (!gate.ok) return { ...gate, item: null };
  try {
    return await withClient(db, async (client) => {
      const item = await repo.getAnnouncementById(client, {
        id: input.id,
        organizationId: org.organizationId,
        productCode: product.productCode,
      });
      if (!item) return { ok: false, status: STATUS.NOT_FOUND, item: null };
      const history = await repo.listEvents(client, {
        announcementId: item.id,
        organizationId: org.organizationId,
      });
      return {
        ok: true,
        status: STATUS.OK,
        item: presentSafe(item),
        history,
        scheduler: SCHEDULER_DEPENDENCY,
      };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, item: null };
  }
}

async function listPublicAnnouncements(db, input) {
  const org = assertOrg(input && input.organizationId);
  if (!org.ok) return { ok: false, status: STATUS.INVALID_INPUT, items: [] };
  const product = assertProduct(input && input.productCode);
  if (!product.ok) return { ok: false, status: STATUS.INVALID_INPUT, items: [] };
  try {
    const items = await withClient(db, (client) =>
      repo.listAnnouncements(client, {
        organizationId: org.organizationId,
        productCode: product.productCode,
        status: null,
        limit: input.limit || 50,
      })
    );
    const now = new Date();
    const visible = items
      .map((i) => presentSafe(i, now))
      .filter((i) => i.publiclyVisible);
    return { ok: true, status: STATUS.OK, items: visible, scheduler: SCHEDULER_DEPENDENCY };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, items: [] };
  }
}

module.exports = {
  STATUS,
  PRODUCT_CODES,
  ANN_STATUSES,
  SCHEDULER_DEPENDENCY,
  resolveEffectiveStatus,
  isPubliclyVisible,
  presentSafe,
  createAnnouncement,
  updateAnnouncement,
  listAnnouncements,
  getAnnouncement,
  listPublicAnnouncements,
};
