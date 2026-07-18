"use strict";

/**
 * BlessBoard V5 announcements admin + member read tracking.
 * Delivery counts are derived (never stored denormalized counters).
 */

const repo = require("../repositories/announcementsRepository");
const {
  authorizeBlessBoardTenantAccess,
  STATUS: AUTHZ_STATUS,
} = require("./authorizeBlessBoardTenantAccess");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  CONFLICT: "conflict",
  CONSTRAINT: "constraint",
  LOOKUP_ERROR: "lookup_error",
});

const AUDIENCE_KEYS = Object.freeze(["members", "admins"]);
const STATUSES = Object.freeze(new Set(["draft", "published", "archived"]));
const HTML_HINT = /<\/?[a-z][\s\S]*>/i;
const MEDIA_ASSET_PATH_RE =
  /^\/_bb\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Product policy: platform admins may inspect; publish requires explicit opt-in. */
const DEFAULT_PRODUCT_POLICY = Object.freeze({
  allowPlatformAdminPublish: false,
});

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {(client: object) => Promise<*>} fn
 */
async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
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

function rejectHtml(value, field) {
  if (value == null) return { ok: true, value: null };
  const s = String(value);
  if (HTML_HINT.test(s)) return { ok: false, reason: `${field}_html_not_allowed` };
  return { ok: true, value: s };
}

function plainText(value, field, { required, max, min }) {
  if (value == null || value === "") {
    if (required) return { ok: false, reason: field };
    return { ok: true, value: null };
  }
  const html = rejectHtml(value, field);
  if (!html.ok) return html;
  const s = html.value.trim();
  if (!s) {
    if (required) return { ok: false, reason: field };
    return { ok: true, value: null };
  }
  const lo = min != null ? min : 1;
  if (s.length < lo || s.length > max) return { ok: false, reason: `${field}_length` };
  return { ok: true, value: s };
}

function httpsOrMediaUrl(value, field) {
  if (value == null || value === "") return { ok: true, value: null };
  const plain = plainText(value, field, { required: false, max: 2000 });
  if (!plain.ok) return plain;
  const raw = plain.value;
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    if (raw.includes("\\") || raw.includes("\0") || raw.includes("..")) {
      return { ok: false, reason: `${field}_url` };
    }
    if (!MEDIA_ASSET_PATH_RE.test(raw)) {
      return { ok: false, reason: `${field}_media_path` };
    }
    return { ok: true, value: raw };
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") {
      return { ok: false, reason: `${field}_https_required` };
    }
    if (!parsed.hostname) return { ok: false, reason: `${field}_url` };
    return { ok: true, value: parsed.toString() };
  } catch {
    return { ok: false, reason: `${field}_url` };
  }
}

function requirePublishConfirm(existingStatus, nextStatus, confirmPublish, enforce) {
  if (!enforce) return { ok: true };
  if (nextStatus === "published" && existingStatus !== "published") {
    const ok =
      confirmPublish === true ||
      confirmPublish === "1" ||
      confirmPublish === "on" ||
      confirmPublish === "yes";
    if (!ok) return { ok: false, reason: "confirm_publish" };
  }
  return { ok: true };
}

function parseExpectedUpdatedAt(raw) {
  if (raw == null || raw === "") return null;
  const d = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(d.getTime())) return { ok: false };
  return { ok: true, value: d.toISOString() };
}

function parseAudiences(raw) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === "string" && raw.trim()) list = [raw];
  else if (raw && typeof raw === "object") {
    list = Object.keys(raw).filter((k) => raw[k] === true || raw[k] === "1" || raw[k] === "on");
  }
  const keys = [...new Set(list.map((k) => String(k).trim().toLowerCase()).filter(Boolean))];
  if (!keys.length) return { ok: false, reason: "audiences_required" };
  for (const key of keys) {
    if (!AUDIENCE_KEYS.includes(key)) return { ok: false, reason: "audience_key" };
  }
  return { ok: true, value: keys };
}

function mapDbError(err) {
  const msg = err && err.message ? String(err.message) : "";
  if (/immutable|archived|active church|active branch|must belong|must match|requires active/i.test(msg)) {
    return { ok: false, status: STATUS.CONSTRAINT, reason: msg };
  }
  if (/unique|duplicate/i.test(msg)) {
    return { ok: false, status: STATUS.CONFLICT, reason: msg };
  }
  return { ok: false, status: STATUS.LOOKUP_ERROR, reason: msg || "error" };
}

/**
 * @param {Array<{ roleKey: string }>} effectiveRoles
 * @param {{ branchId: string|null }} scope
 * @param {{ allowPlatformAdminPublish?: boolean }} productPolicy
 * @param {'read'|'write'|'publish'} action
 */
function evaluateAnnouncementCapability(effectiveRoles, scope, productPolicy, action) {
  const roles = effectiveRoles || [];
  const hasHq = roles.some((r) => r.roleKey === "church_hq_admin");
  const hasBranch = roles.some((r) => r.roleKey === "branch_admin");
  const hasPlatform = roles.some((r) => r.roleKey === "platform_admin");
  const policy = { ...DEFAULT_PRODUCT_POLICY, ...(productPolicy || {}) };

  if (action === "read") {
    if (hasHq || hasPlatform) return { ok: true, mode: hasHq ? "hq" : "platform_inspect" };
    if (hasBranch && scope.branchId) return { ok: true, mode: "branch" };
    return { ok: false, reason: "role" };
  }

  if (action === "write") {
    if (hasHq) return { ok: true, mode: "hq" };
    if (hasBranch && scope.branchId) return { ok: true, mode: "branch" };
    if (hasPlatform) return { ok: true, mode: "platform_inspect" };
    return { ok: false, reason: "role" };
  }

  if (action === "publish") {
    if (hasHq) return { ok: true, mode: "hq" };
    if (hasBranch && scope.branchId) return { ok: true, mode: "branch" };
    if (hasPlatform && policy.allowPlatformAdminPublish) {
      return { ok: true, mode: "platform_publish" };
    }
    if (hasPlatform) return { ok: false, reason: "platform_publish_denied" };
    return { ok: false, reason: "role" };
  }

  return { ok: false, reason: "action" };
}

/**
 * @param {{ query: Function }} client
 * @param {{ actorUserId: string, tenant: object, branchId: string|null }} input
 */
async function authorizeActor(client, input) {
  const authz = await authorizeBlessBoardTenantAccess(
    { query: client.query.bind(client) },
    {
      userId: input.actorUserId,
      tenant: input.tenant,
      branchId: input.branchId,
    }
  );
  if (!authz.ok) {
    return {
      ok: false,
      status: STATUS.FORBIDDEN,
      reason: authz.status || AUTHZ_STATUS.UNAUTHORIZED,
      effectiveRoles: [],
    };
  }
  return {
    ok: true,
    effectiveRoles: authz.context.effectiveRoles || [],
  };
}

function buildDeliveryCounts(eligible, reads) {
  const eligibleCount = Math.max(0, Number(eligible) || 0);
  const readCount = Math.max(0, Number(reads.readCount) || 0);
  const seenCount = Math.max(0, Number(reads.seenCount) || 0);
  return {
    eligibleCount,
    seenCount,
    readCount,
    unreadCount: Math.max(0, eligibleCount - readCount),
  };
}

async function loadAnnouncementBundle(client, announcement) {
  const [audiences, attachments, reads, eligible] = await Promise.all([
    repo.listAudiences(client, announcement.id),
    repo.listAttachments(client, announcement.id),
    repo.countReads(client, announcement.id),
    repo.countEligibleMembers(client, {
      churchId: announcement.churchId,
      branchId: announcement.branchId,
    }),
  ]);
  const hasMembersAudience = audiences.some((a) => a.audienceKey === "members");
  return {
    ...announcement,
    audiences: audiences.map((a) => a.audienceKey),
    attachments,
    delivery: hasMembersAudience
      ? buildDeliveryCounts(eligible, reads)
      : {
          eligibleCount: 0,
          seenCount: reads.seenCount,
          readCount: reads.readCount,
          unreadCount: 0,
        },
  };
}

function buildFields(raw, { partial }) {
  const fields = {};
  if (!partial || raw.title !== undefined) {
    const title = plainText(raw.title, "title", { required: !partial, max: 200 });
    if (!title.ok) return title;
    if (title.value != null) fields.title = title.value;
  }
  if (!partial || raw.body !== undefined) {
    const body = plainText(raw.body, "body", { required: !partial, max: 20000 });
    if (!body.ok) return body;
    if (body.value != null) fields.body = body.value;
  }
  if (!partial || raw.status !== undefined) {
    const status = String(raw.status || (partial ? "" : "draft")).trim().toLowerCase();
    if (!partial && !status) fields.status = "draft";
    else if (status) {
      if (!STATUSES.has(status)) return { ok: false, reason: "status" };
      fields.status = status;
    }
  }
  if (raw.isPinned !== undefined) {
    fields.isPinned =
      raw.isPinned === true || raw.isPinned === "1" || raw.isPinned === "on" || raw.isPinned === "yes";
  } else if (!partial) {
    fields.isPinned = false;
  }
  if (raw.isFeatured !== undefined) {
    fields.isFeatured =
      raw.isFeatured === true ||
      raw.isFeatured === "1" ||
      raw.isFeatured === "on" ||
      raw.isFeatured === "yes";
  } else if (!partial) {
    fields.isFeatured = false;
  }
  if (raw.featuredUntil !== undefined) {
    if (raw.featuredUntil == null || raw.featuredUntil === "") {
      fields.clearFeaturedUntil = true;
      fields.featuredUntil = null;
    } else {
      const d = new Date(String(raw.featuredUntil));
      if (Number.isNaN(d.getTime())) return { ok: false, reason: "featured_until" };
      fields.featuredUntil = d.toISOString();
    }
  }
  const hasActionUrl = raw.actionUrl !== undefined || raw.action_url !== undefined;
  const hasActionLabel = raw.actionLabel !== undefined || raw.action_label !== undefined;
  if (!partial || hasActionUrl || hasActionLabel) {
    const urlRaw = raw.actionUrl !== undefined ? raw.actionUrl : raw.action_url;
    const labelRaw = raw.actionLabel !== undefined ? raw.actionLabel : raw.action_label;
    const url = httpsOrMediaUrl(urlRaw, "action_url");
    if (!url.ok) return url;
    const label = plainText(labelRaw, "action_label", { required: false, max: 100 });
    if (!label.ok) return label;
    if ((url.value && !label.value) || (!url.value && label.value)) {
      return { ok: false, reason: "action_pair" };
    }
    if (!url.value && !label.value && (hasActionUrl || hasActionLabel || !partial)) {
      fields.clearAction = true;
      fields.actionUrl = null;
      fields.actionLabel = null;
    } else if (url.value && label.value) {
      fields.actionUrl = url.value;
      fields.actionLabel = label.value;
      fields.clearAction = false;
    }
  }
  return { ok: true, fields };
}

async function createAnnouncement(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: "scope" };
  }
  let branchId = null;
  if (input.branchId != null && String(input.branchId).trim()) {
    branchId = String(input.branchId).trim();
  }
  const audiences = parseAudiences(input.audiences);
  if (!audiences.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: audiences.reason };
  }
  const built = buildFields(input, { partial: false });
  if (!built.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: built.reason };
  }
  const nextStatus = built.fields.status || "draft";
  const conf = requirePublishConfirm(
    "draft",
    nextStatus,
    input.confirmPublish,
    Boolean(input.enforcePublishConfirm)
  );
  if (!conf.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: conf.reason };
  }

  try {
    return await withClient(db, async (client) => {
      if (input.tenant) {
        const authz = await authorizeActor(client, {
          actorUserId,
          tenant: input.tenant,
          branchId,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: authz.reason };
        }
        const writeCap = evaluateAnnouncementCapability(
          authz.effectiveRoles,
          { branchId },
          input.productPolicy,
          "write"
        );
        if (!writeCap.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: writeCap.reason };
        }
        if (branchId == null && writeCap.mode === "branch") {
          return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: "church_wide_denied" };
        }
        if (nextStatus === "published") {
          const pubCap = evaluateAnnouncementCapability(
            authz.effectiveRoles,
            { branchId },
            input.productPolicy,
            "publish"
          );
          if (!pubCap.ok) {
            return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: pubCap.reason };
          }
        }
      }

      const church = await repo.findChurchStatus(client, churchId);
      if (!church) return { ok: false, status: STATUS.NOT_FOUND, item: null, reason: "church" };
      if (branchId) {
        const branch = await repo.findBranchScope(client, branchId);
        if (!branch || String(branch.church_id) !== churchId) {
          return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: "branch" };
        }
      }

      if (nextStatus === "published") {
        built.fields.publishedAt = new Date().toISOString();
      }

      const item = await repo.insertAnnouncement(client, {
        churchId,
        branchId,
        ...built.fields,
        createdByUserId: actorUserId,
      });
      await repo.replaceAudiences(client, item.id, audiences.value);

      const mediaIds = Array.isArray(input.mediaAssetIds) ? input.mediaAssetIds : [];
      for (let i = 0; i < mediaIds.length; i += 1) {
        const mediaId = String(mediaIds[i] || "").trim();
        if (!UUID_RE.test(mediaId)) {
          return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: "media_asset_id" };
        }
        const asset = await repo.findMediaAssetMeta(client, mediaId);
        if (!asset || String(asset.church_id) !== churchId || asset.status !== "active") {
          return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: "media_asset" };
        }
        await repo.insertAttachment(client, {
          announcementId: item.id,
          mediaAssetId: mediaId,
          sortOrder: i,
        });
      }

      const bundle = await loadAnnouncementBundle(client, item);
      return { ok: true, status: STATUS.OK, item: bundle };
    });
  } catch (err) {
    return { ...mapDbError(err), item: null };
  }
}

async function updateAnnouncement(db, id, patch) {
  const rowId = String(id || "").trim();
  if (!rowId || !UUID_RE.test(rowId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: "id" };
  }
  const raw = patch && typeof patch === "object" ? patch : {};
  const built = buildFields(raw, { partial: true });
  if (!built.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: built.reason };
  }
  if (raw.expectedUpdatedAt !== undefined && raw.expectedUpdatedAt !== null && raw.expectedUpdatedAt !== "") {
    const parsed = parseExpectedUpdatedAt(raw.expectedUpdatedAt);
    if (!parsed || !parsed.ok) {
      return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: "expected_updated_at" };
    }
    built.fields.expectedUpdatedAt = parsed.value;
  }

  let audiences = null;
  if (raw.audiences !== undefined) {
    audiences = parseAudiences(raw.audiences);
    if (!audiences.ok) {
      return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: audiences.reason };
    }
  }

  try {
    return await withClient(db, async (client) => {
      const existing = await repo.findAnnouncementById(client, rowId);
      if (!existing) return { ok: false, status: STATUS.NOT_FOUND, item: null };

      const scopeBranchId = existing.branchId;
      let effectiveRoles = [];
      if (raw.tenant && raw.actorUserId) {
        const authz = await authorizeActor(client, {
          actorUserId: raw.actorUserId,
          tenant: raw.tenant,
          branchId: scopeBranchId,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: authz.reason };
        }
        effectiveRoles = authz.effectiveRoles;
        const writeCap = evaluateAnnouncementCapability(
          effectiveRoles,
          { branchId: scopeBranchId },
          raw.productPolicy,
          "write"
        );
        if (!writeCap.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: writeCap.reason };
        }
        if (scopeBranchId == null && writeCap.mode === "branch") {
          return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: "church_wide_denied" };
        }
        if (raw.churchId && String(raw.churchId) !== String(existing.churchId)) {
          return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: "church" };
        }
        if (
          Object.prototype.hasOwnProperty.call(raw, "scopeBranchId") &&
          String(raw.scopeBranchId || "") !== String(existing.branchId || "")
        ) {
          return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: "scope" };
        }
      }

      const nextStatus =
        built.fields.status !== undefined ? built.fields.status : existing.status;
      if (nextStatus === "published" && existing.status !== "published") {
        const conf = requirePublishConfirm(
          existing.status,
          nextStatus,
          raw.confirmPublish,
          Boolean(raw.enforcePublishConfirm)
        );
        if (!conf.ok) {
          return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: conf.reason };
        }
        if (raw.tenant && raw.actorUserId) {
          const pubCap = evaluateAnnouncementCapability(
            effectiveRoles,
            { branchId: scopeBranchId },
            raw.productPolicy,
            "publish"
          );
          if (!pubCap.ok) {
            return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: pubCap.reason };
          }
        }
        built.fields.setPublishedAtNow = true;
      }

      const result = await repo.updateAnnouncement(client, rowId, built.fields);
      if (result.conflict) {
        return { ok: false, status: STATUS.CONFLICT, item: existing, reason: "optimistic_conflict" };
      }
      if (!result.item) return { ok: false, status: STATUS.NOT_FOUND, item: null };

      if (audiences) {
        await repo.replaceAudiences(client, rowId, audiences.value);
      }

      if (Array.isArray(raw.addMediaAssetIds)) {
        const existingAtt = await repo.listAttachments(client, rowId);
        let sort = existingAtt.length;
        for (const mid of raw.addMediaAssetIds) {
          const mediaId = String(mid || "").trim();
          if (!UUID_RE.test(mediaId)) {
            return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: "media_asset_id" };
          }
          const asset = await repo.findMediaAssetMeta(client, mediaId);
          if (
            !asset ||
            String(asset.church_id) !== String(result.item.churchId) ||
            asset.status !== "active"
          ) {
            return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: "media_asset" };
          }
          await repo.insertAttachment(client, {
            announcementId: rowId,
            mediaAssetId: mediaId,
            sortOrder: sort,
          });
          sort += 1;
        }
      }

      const bundle = await loadAnnouncementBundle(client, result.item);
      return { ok: true, status: STATUS.OK, item: bundle };
    });
  } catch (err) {
    return { ...mapDbError(err), item: null };
  }
}

async function listAdminAnnouncements(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, items: [], reason: "church_id" };
  }
  let branchId;
  if (Object.prototype.hasOwnProperty.call(input || {}, "branchId")) {
    branchId = input.branchId == null || input.branchId === "" ? null : String(input.branchId);
  }
  try {
    return await withClient(db, async (client) => {
      if (input.tenant && input.actorUserId) {
        const authz = await authorizeActor(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: branchId == null ? null : branchId,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, items: [], reason: authz.reason };
        }
        const readCap = evaluateAnnouncementCapability(
          authz.effectiveRoles,
          { branchId: branchId == null ? null : branchId },
          input.productPolicy,
          "read"
        );
        if (!readCap.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, items: [], reason: readCap.reason };
        }
        if (branchId == null && readCap.mode === "branch") {
          return { ok: false, status: STATUS.FORBIDDEN, items: [], reason: "church_wide_denied" };
        }
      }
      const items = await repo.listAnnouncements(client, {
        churchId,
        branchId,
        status: input.status || null,
        limit: input.limit,
        offset: input.offset,
      });
      const bundles = [];
      for (const item of items) {
        bundles.push(await loadAnnouncementBundle(client, item));
      }
      return { ok: true, status: STATUS.OK, items: bundles };
    });
  } catch (err) {
    return { ...mapDbError(err), items: [] };
  }
}

async function getAdminAnnouncement(db, input) {
  const id = String((input && input.id) || "").trim();
  if (!id || !UUID_RE.test(id)) {
    return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: "id" };
  }
  try {
    return await withClient(db, async (client) => {
      const existing = await repo.findAnnouncementById(client, id);
      if (!existing) return { ok: false, status: STATUS.NOT_FOUND, item: null };
      if (input.churchId && String(input.churchId) !== String(existing.churchId)) {
        return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: "church" };
      }
      if (
        Object.prototype.hasOwnProperty.call(input, "scopeBranchId") &&
        String(input.scopeBranchId || "") !== String(existing.branchId || "")
      ) {
        return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: "scope" };
      }
      if (input.tenant && input.actorUserId) {
        const authz = await authorizeActor(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: existing.branchId,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: authz.reason };
        }
        const readCap = evaluateAnnouncementCapability(
          authz.effectiveRoles,
          { branchId: existing.branchId },
          input.productPolicy,
          "read"
        );
        if (!readCap.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: readCap.reason };
        }
        if (existing.branchId == null && readCap.mode === "branch") {
          return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: "church_wide_denied" };
        }
      }
      const bundle = await loadAnnouncementBundle(client, existing);
      return { ok: true, status: STATUS.OK, item: bundle };
    });
  } catch (err) {
    return { ...mapDbError(err), item: null };
  }
}

async function listMemberAnnouncements(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  if (!churchId || !branchId || !memberId) {
    return { ok: false, status: STATUS.INVALID_INPUT, items: [], reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const items = await repo.listMemberAnnouncements(client, {
        churchId,
        branchId,
        memberId,
        limit: input.limit,
        offset: input.offset,
      });
      const out = [];
      for (const item of items) {
        const attachments = await repo.listAttachments(client, item.id);
        out.push({ ...item, attachments });
      }
      return { ok: true, status: STATUS.OK, items: out };
    });
  } catch (err) {
    return { ...mapDbError(err), items: [] };
  }
}

async function getMemberAnnouncement(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  const id = String((input && input.id) || "").trim();
  if (!churchId || !branchId || !memberId || !UUID_RE.test(id)) {
    return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const existing = await repo.findAnnouncementById(client, id);
      if (!existing || String(existing.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, item: null };
      }
      if (existing.status !== "published") {
        return { ok: false, status: STATUS.NOT_FOUND, item: null };
      }
      if (existing.branchId && String(existing.branchId) !== branchId) {
        return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: "branch_isolation" };
      }
      const audiences = await repo.listAudiences(client, id);
      if (!audiences.some((a) => a.audienceKey === "members")) {
        return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: "audience" };
      }
      if (input.recordSeen !== false) {
        await repo.upsertAnnouncementRead(client, {
          churchId,
          announcementId: id,
          memberId,
          markRead: false,
        });
      }
      const attachments = await repo.listAttachments(client, id);
      const reads = await client.query(
        `SELECT first_seen_at, read_at
           FROM blessboard.announcement_reads
          WHERE announcement_id = $1 AND member_id = $2`,
        [id, memberId]
      );
      const readRow = reads.rows[0] || null;
      return {
        ok: true,
        status: STATUS.OK,
        item: {
          ...existing,
          audiences: audiences.map((a) => a.audienceKey),
          attachments,
          firstSeenAt: readRow ? readRow.first_seen_at : null,
          readAt: readRow ? readRow.read_at : null,
          isUnread: !(readRow && readRow.read_at),
        },
      };
    });
  } catch (err) {
    return { ...mapDbError(err), item: null };
  }
}

async function markAnnouncementRead(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  const id = String((input && input.id) || "").trim();
  if (!churchId || !branchId || !memberId || !UUID_RE.test(id)) {
    return { ok: false, status: STATUS.INVALID_INPUT, read: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const existing = await repo.findAnnouncementById(client, id);
      if (!existing || String(existing.churchId) !== churchId || existing.status !== "published") {
        return { ok: false, status: STATUS.NOT_FOUND, read: null };
      }
      if (existing.branchId && String(existing.branchId) !== branchId) {
        return { ok: false, status: STATUS.FORBIDDEN, read: null, reason: "branch_isolation" };
      }
      const audiences = await repo.listAudiences(client, id);
      if (!audiences.some((a) => a.audienceKey === "members")) {
        return { ok: false, status: STATUS.FORBIDDEN, read: null, reason: "audience" };
      }
      const read = await repo.upsertAnnouncementRead(client, {
        churchId,
        announcementId: id,
        memberId,
        markRead: true,
      });
      return { ok: true, status: STATUS.OK, read };
    });
  } catch (err) {
    return { ...mapDbError(err), read: null };
  }
}

async function removeAnnouncementAttachment(db, input) {
  const announcementId = String((input && input.announcementId) || "").trim();
  const attachmentId = String((input && input.attachmentId) || "").trim();
  if (!UUID_RE.test(announcementId) || !UUID_RE.test(attachmentId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "id" };
  }
  try {
    return await withClient(db, async (client) => {
      const existing = await repo.findAnnouncementById(client, announcementId);
      if (!existing) return { ok: false, status: STATUS.NOT_FOUND };
      if (input.churchId && String(input.churchId) !== String(existing.churchId)) {
        return { ok: false, status: STATUS.FORBIDDEN, reason: "church" };
      }
      const removed = await repo.deleteAttachment(client, { announcementId, attachmentId });
      if (!removed) return { ok: false, status: STATUS.NOT_FOUND };
      return { ok: true, status: STATUS.OK };
    });
  } catch (err) {
    return mapDbError(err);
  }
}

module.exports = {
  STATUS,
  AUDIENCE_KEYS,
  DEFAULT_PRODUCT_POLICY,
  evaluateAnnouncementCapability,
  requirePublishConfirm,
  createAnnouncement,
  updateAnnouncement,
  listAdminAnnouncements,
  getAdminAnnouncement,
  listMemberAnnouncements,
  getMemberAnnouncement,
  markAnnouncementRead,
  removeAnnouncementAttachment,
};
