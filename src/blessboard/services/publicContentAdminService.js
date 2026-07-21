"use strict";

/**
 * Admin-write public website content service.
 * Separate from read path. Provisioning creates empty draft pages only (no demo copy).
 */

const repo = require("../repositories/publicContentRepository");
const {
  PUBLIC_PAGE_KEYS,
  PAGE_KEY_TITLES,
  KEY_RE,
  CHANNEL_TYPE_RE,
  CONTENT_STATUS,
} = require("./publicContentConstants");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  LOOKUP_ERROR: "lookup_error",
  CONSTRAINT: "constraint",
});

const PAGE_STATUSES = new Set(["draft", "published", "archived"]);
const EVENT_STATUSES = new Set(["draft", "published", "cancelled", "archived"]);
const HTML_HINT = /<\/?[a-z][\s\S]*>/i;

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
  if (value == null) return null;
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

/**
 * HTTPS-only media/resource URLs (uploads not supported yet).
 * @param {unknown} value
 * @param {string} field
 */
const MEDIA_ASSET_PATH_RE =
  /^\/_bb\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Accept HTTPS URLs or app-mediated media paths (`/_bb/media/:uuid`).
 * Relative paths are not protocol-relative and must not contain traversal.
 */
function httpsMediaUrl(value, field) {
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

function parseExpectedUpdatedAt(raw) {
  if (raw == null || raw === "") return null;
  const d = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(d.getTime())) return { ok: false };
  return { ok: true, value: d.toISOString() };
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

async function assertChurchExists(client, churchId) {
  const church = await repo.findChurchStatus(client, churchId);
  if (!church) return { ok: false, status: STATUS.NOT_FOUND, reason: "church" };
  return { ok: true, church };
}

async function assertBranchBelongs(client, churchId, branchId) {
  if (!branchId) return { ok: true, branch: null };
  const branch = await repo.findBranchScope(client, branchId);
  if (!branch) return { ok: false, status: STATUS.NOT_FOUND, reason: "branch" };
  if (branch.church_id !== churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "branch_church_mismatch" };
  }
  return { ok: true, branch };
}

function mapDbError(err) {
  const msg = err && err.message ? String(err.message) : "";
  if (/immutable|archived|active church|active branch|must belong/i.test(msg)) {
    return { ok: false, status: STATUS.CONSTRAINT, reason: msg };
  }
  if (/unique|duplicate/i.test(msg)) {
    return { ok: false, status: STATUS.CONFLICT, reason: msg };
  }
  return { ok: false, status: STATUS.LOOKUP_ERROR, reason: msg || "error" };
}

/**
 * Ensure empty draft public_pages for standard page keys. No sections or demo text.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{ churchId: string, branchId?: string|null }} input
 */
async function provisionEmptyPublicPages(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, pages: [], createdCount: 0, reason: "church_id" };
  }
  let branchId = null;
  if (input && input.branchId != null && String(input.branchId).trim()) {
    branchId = String(input.branchId).trim();
  }
  try {
    return await withClient(db, async (client) => {
      const churchOk = await assertChurchExists(client, churchId);
      if (!churchOk.ok) return { ok: false, status: churchOk.status, pages: [], createdCount: 0, reason: churchOk.reason };
      const branchOk = await assertBranchBelongs(client, churchId, branchId);
      if (!branchOk.ok) {
        return { ok: false, status: branchOk.status, pages: [], createdCount: 0, reason: branchOk.reason };
      }
      const pages = [];
      let createdCount = 0;
      for (const pageKey of PUBLIC_PAGE_KEYS) {
        const result = await repo.ensureDraftPage(client, {
          churchId,
          branchId,
          pageKey,
          title: PAGE_KEY_TITLES[pageKey] || pageKey,
        });
        if (result.created) createdCount += 1;
        if (result.page) pages.push(result.page);
      }
      // Canonical service times live on the church-wide home page only.
      const {
        ensureCanonicalServiceTimesSection,
      } = require("./homeServiceTimesService");
      await ensureCanonicalServiceTimesSection(client, { churchId, branchId: null });
      return { ok: true, status: STATUS.OK, pages, createdCount };
    });
  } catch (err) {
    return { ...mapDbError(err), pages: [], createdCount: 0 };
  }
}

/**
 * Admin list of pages (any status) for a scope.
 */
async function listAdminPages(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, pages: [], reason: "church_id" };
  }
  let branchId = null;
  if (input && Object.prototype.hasOwnProperty.call(input, "branchId")) {
    branchId =
      input.branchId == null || input.branchId === "" ? null : String(input.branchId).trim();
  }
  try {
    return await withClient(db, async (client) => {
      const pages = [];
      for (const pageKey of PUBLIC_PAGE_KEYS) {
        const page = await repo.findPageByScope(client, { churchId, branchId, pageKey });
        if (page) pages.push(page);
      }
      return { ok: true, status: STATUS.OK, pages };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, pages: [] };
  }
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {string} pageId
 * @param {{ title?: string, status?: string, expectedUpdatedAt?: string|Date, confirmPublish?: unknown }} patch
 */
async function updatePublicPage(db, pageId, patch) {
  const id = String(pageId || "").trim();
  if (!id) return { ok: false, status: STATUS.INVALID_INPUT, page: null, reason: "page_id" };
  const body = patch && typeof patch === "object" ? patch : {};
  let title = undefined;
  if (body.title !== undefined) {
    const t = plainText(body.title, "title", { required: true, max: 200 });
    if (!t.ok) return { ok: false, status: STATUS.INVALID_INPUT, page: null, reason: t.reason };
    title = t.value;
  }
  let status = undefined;
  if (body.status !== undefined) {
    status = String(body.status).trim().toLowerCase();
    if (!PAGE_STATUSES.has(status)) {
      return { ok: false, status: STATUS.INVALID_INPUT, page: null, reason: "status" };
    }
  }
  let expectedUpdatedAt = null;
  if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== null && body.expectedUpdatedAt !== "") {
    const parsed = parseExpectedUpdatedAt(body.expectedUpdatedAt);
    if (!parsed.ok) {
      return { ok: false, status: STATUS.INVALID_INPUT, page: null, reason: "expected_updated_at" };
    }
    expectedUpdatedAt = parsed.value;
  }
  try {
    return await withClient(db, async (client) => {
      const existing = await repo.findPageById(client, id);
      if (!existing) return { ok: false, status: STATUS.NOT_FOUND, page: null };
      if (status !== undefined) {
        const conf = requirePublishConfirm(
          existing.status,
          status,
          body.confirmPublish,
          Boolean(body.enforcePublishConfirm)
        );
        if (!conf.ok) {
          return { ok: false, status: STATUS.INVALID_INPUT, page: null, reason: conf.reason };
        }
      }
      const result = await repo.updatePage(client, id, {
        title,
        status,
        expectedUpdatedAt,
      });
      if (result.conflict) {
        return { ok: false, status: STATUS.CONFLICT, page: existing, reason: "optimistic_conflict" };
      }
      if (!result.page) return { ok: false, status: STATUS.NOT_FOUND, page: null };
      return { ok: true, status: STATUS.OK, page: result.page };
    });
  } catch (err) {
    return { ...mapDbError(err), page: null };
  }
}

/**
 * Load page + sections for admin by church/branch scope and page_key.
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{ churchId: string, branchId?: string|null, pageKey: string }} input
 */
async function getAdminPageBundle(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const pageKey = String((input && input.pageKey) || "")
    .trim()
    .toLowerCase();
  let branchId = null;
  if (input && input.branchId != null && String(input.branchId).trim()) {
    branchId = String(input.branchId).trim();
  }
  if (!churchId || !KEY_RE.test(pageKey)) {
    return { ok: false, status: STATUS.INVALID_INPUT, page: null, sections: [], reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const page = await repo.findPageByScope(client, { churchId, branchId, pageKey });
      if (!page) return { ok: false, status: STATUS.NOT_FOUND, page: null, sections: [] };
      const sections = await repo.listSectionsForPage(client, page.id, {});
      return { ok: true, status: STATUS.OK, page, sections };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, page: null, sections: [] };
  }
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{ pageId: string, sectionKey: string, sectionType: string, heading?: string, bodyText?: string, mediaUrl?: string, sortOrder?: number, status?: string }} input
 */
async function createPageSection(db, input) {
  const raw = input && typeof input === "object" ? input : {};
  const pageId = String(raw.pageId || "").trim();
  const sectionKey = String(raw.sectionKey || "")
    .trim()
    .toLowerCase();
  const sectionType = String(raw.sectionType || "")
    .trim()
    .toLowerCase();
  if (!pageId) return { ok: false, status: STATUS.INVALID_INPUT, section: null, reason: "page_id" };
  if (!KEY_RE.test(sectionKey)) {
    return { ok: false, status: STATUS.INVALID_INPUT, section: null, reason: "section_key" };
  }
  if (!KEY_RE.test(sectionType)) {
    return { ok: false, status: STATUS.INVALID_INPUT, section: null, reason: "section_type" };
  }
  const heading = plainText(raw.heading, "heading", { required: false, max: 200 });
  if (!heading.ok) return { ok: false, status: STATUS.INVALID_INPUT, section: null, reason: heading.reason };
  const bodyText = plainText(raw.bodyText, "body_text", { required: false, max: 20000 });
  if (!bodyText.ok) return { ok: false, status: STATUS.INVALID_INPUT, section: null, reason: bodyText.reason };
  const mediaUrl = httpsMediaUrl(raw.mediaUrl, "media_url");
  if (!mediaUrl.ok) return { ok: false, status: STATUS.INVALID_INPUT, section: null, reason: mediaUrl.reason };
  const status = raw.status != null ? String(raw.status).trim().toLowerCase() : "draft";
  if (!PAGE_STATUSES.has(status)) {
    return { ok: false, status: STATUS.INVALID_INPUT, section: null, reason: "status" };
  }
  if (status === "published") {
    const conf = requirePublishConfirm(
      "draft",
      status,
      raw.confirmPublish,
      Boolean(raw.enforcePublishConfirm)
    );
    if (!conf.ok) {
      return { ok: false, status: STATUS.INVALID_INPUT, section: null, reason: conf.reason };
    }
  }
  try {
    return await withClient(db, async (client) => {
      const page = await repo.findPageById(client, pageId);
      if (!page) return { ok: false, status: STATUS.NOT_FOUND, section: null };
      const section = await repo.insertSection(client, {
        pageId,
        sectionKey,
        sectionType,
        heading: heading.value,
        bodyText: bodyText.value,
        mediaUrl: mediaUrl.value,
        sortOrder: raw.sortOrder != null ? Number(raw.sortOrder) : 0,
        status,
      });
      return { ok: true, status: STATUS.OK, section };
    });
  } catch (err) {
    return { ...mapDbError(err), section: null };
  }
}

async function updatePageSection(db, sectionId, patch) {
  const id = String(sectionId || "").trim();
  if (!id) return { ok: false, status: STATUS.INVALID_INPUT, section: null, reason: "section_id" };
  const body = patch && typeof patch === "object" ? patch : {};
  const fields = {};
  if (body.heading !== undefined) {
    const h = plainText(body.heading, "heading", { required: false, max: 200 });
    if (!h.ok) return { ok: false, status: STATUS.INVALID_INPUT, section: null, reason: h.reason };
    fields.heading = h.value;
  }
  if (body.bodyText !== undefined) {
    const t = plainText(body.bodyText, "body_text", { required: false, max: 20000 });
    if (!t.ok) return { ok: false, status: STATUS.INVALID_INPUT, section: null, reason: t.reason };
    fields.bodyText = t.value;
  }
  if (body.mediaUrl !== undefined) {
    const m = httpsMediaUrl(body.mediaUrl, "media_url");
    if (!m.ok) return { ok: false, status: STATUS.INVALID_INPUT, section: null, reason: m.reason };
    fields.mediaUrl = m.value;
  }
  if (body.sortOrder !== undefined) fields.sortOrder = Number(body.sortOrder);
  if (body.status !== undefined) {
    const status = String(body.status).trim().toLowerCase();
    if (!PAGE_STATUSES.has(status)) {
      return { ok: false, status: STATUS.INVALID_INPUT, section: null, reason: "status" };
    }
    fields.status = status;
  }
  if (body.sectionType !== undefined) {
    const st = String(body.sectionType).trim().toLowerCase();
    if (!KEY_RE.test(st)) {
      return { ok: false, status: STATUS.INVALID_INPUT, section: null, reason: "section_type" };
    }
    fields.sectionType = st;
  }
  if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== null && body.expectedUpdatedAt !== "") {
    const parsed = parseExpectedUpdatedAt(body.expectedUpdatedAt);
    if (!parsed.ok) {
      return { ok: false, status: STATUS.INVALID_INPUT, section: null, reason: "expected_updated_at" };
    }
    fields.expectedUpdatedAt = parsed.value;
  }
  try {
    return await withClient(db, async (client) => {
      const existing = await repo.findSectionById(client, id);
      if (!existing) return { ok: false, status: STATUS.NOT_FOUND, section: null };
      if (fields.status !== undefined) {
        const conf = requirePublishConfirm(
          existing.status,
          fields.status,
          body.confirmPublish,
          Boolean(body.enforcePublishConfirm)
        );
        if (!conf.ok) {
          return { ok: false, status: STATUS.INVALID_INPUT, section: null, reason: conf.reason };
        }
      }
      const result = await repo.updateSection(client, id, fields);
      if (result.conflict) {
        return { ok: false, status: STATUS.CONFLICT, section: existing, reason: "optimistic_conflict" };
      }
      if (!result.section) return { ok: false, status: STATUS.NOT_FOUND, section: null };
      return { ok: true, status: STATUS.OK, section: result.section };
    });
  } catch (err) {
    return { ...mapDbError(err), section: null };
  }
}

async function listAdminSections(db, pageId) {
  const id = String(pageId || "").trim();
  if (!id) return { ok: false, status: STATUS.INVALID_INPUT, sections: [], reason: "page_id" };
  try {
    return await withClient(db, async (client) => {
      const sections = await repo.listSectionsForPage(client, id, {});
      return { ok: true, status: STATUS.OK, sections };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, sections: [] };
  }
}

function normalizeOwnedScope(raw) {
  const churchId = String((raw && raw.churchId) || "").trim();
  if (!churchId) return { ok: false, reason: "church_id" };
  let branchId = null;
  if (raw && raw.branchId != null && String(raw.branchId).trim()) {
    branchId = String(raw.branchId).trim();
  }
  return { ok: true, churchId, branchId };
}

/**
 * Generic create for church/branch owned entities.
 */
async function createOwned(db, kind, input, buildFields) {
  const scope = normalizeOwnedScope(input);
  if (!scope.ok) return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: scope.reason };
  const built = buildFields(input || {});
  if (!built.ok) return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: built.reason };
  if (built.fields.status === "published") {
    const conf = requirePublishConfirm(
      "draft",
      "published",
      input && input.confirmPublish,
      Boolean(input && input.enforcePublishConfirm)
    );
    if (!conf.ok) return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: conf.reason };
  }
  try {
    return await withClient(db, async (client) => {
      const churchOk = await assertChurchExists(client, scope.churchId);
      if (!churchOk.ok) return { ok: false, status: churchOk.status, item: null, reason: churchOk.reason };
      const branchOk = await assertBranchBelongs(client, scope.churchId, scope.branchId);
      if (!branchOk.ok) return { ok: false, status: branchOk.status, item: null, reason: branchOk.reason };
      const insertFns = {
        leader: repo.insertLeader,
        ministry: repo.insertMinistry,
        event: repo.insertEvent,
        sermon: repo.insertSermon,
        contact_channel: repo.insertContactChannel,
        giving_method: repo.insertGivingMethod,
      };
      const item = await insertFns[kind](client, {
        churchId: scope.churchId,
        branchId: scope.branchId,
        ...built.fields,
      });
      return { ok: true, status: STATUS.OK, item };
    });
  } catch (err) {
    return { ...mapDbError(err), item: null };
  }
}

async function updateOwned(db, kind, id, patch, buildPatch) {
  const rowId = String(id || "").trim();
  if (!rowId) return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: "id" };
  const raw = patch && typeof patch === "object" ? patch : {};
  const built = buildPatch(raw);
  if (!built.ok) return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: built.reason };
  if (raw.expectedUpdatedAt !== undefined && raw.expectedUpdatedAt !== null && raw.expectedUpdatedAt !== "") {
    const parsed = parseExpectedUpdatedAt(raw.expectedUpdatedAt);
    if (!parsed.ok) {
      return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: "expected_updated_at" };
    }
    built.fields.expectedUpdatedAt = parsed.value;
  }
  const findFns = {
    leader: repo.findLeaderById,
    ministry: repo.findMinistryById,
    event: repo.findEventById,
    sermon: repo.findSermonById,
    contact_channel: repo.findContactChannelById,
    giving_method: repo.findGivingMethodById,
  };
  const updateFns = {
    leader: repo.updateLeader,
    ministry: repo.updateMinistry,
    event: repo.updateEvent,
    sermon: repo.updateSermon,
    contact_channel: repo.updateContactChannel,
    giving_method: repo.updateGivingMethod,
  };
  try {
    return await withClient(db, async (client) => {
      const existing = await findFns[kind](client, rowId);
      if (!existing) return { ok: false, status: STATUS.NOT_FOUND, item: null };
      if (built.fields.status !== undefined) {
        const conf = requirePublishConfirm(
          existing.status,
          built.fields.status,
          raw.confirmPublish,
          Boolean(raw.enforcePublishConfirm)
        );
        if (!conf.ok) {
          return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: conf.reason };
        }
      }
      const result = await updateFns[kind](client, rowId, built.fields);
      if (result.conflict) {
        return { ok: false, status: STATUS.CONFLICT, item: existing, reason: "optimistic_conflict" };
      }
      if (!result.item) return { ok: false, status: STATUS.NOT_FOUND, item: null };
      return { ok: true, status: STATUS.OK, item: result.item };
    });
  } catch (err) {
    return { ...mapDbError(err), item: null };
  }
}

function buildLeaderFields(raw, { partial }) {
  const fields = {};
  if (!partial || raw.displayName !== undefined) {
    const n = plainText(raw.displayName, "display_name", { required: !partial, max: 200 });
    if (!n.ok) return n;
    if (n.value != null) fields.displayName = n.value;
    else if (!partial) return { ok: false, reason: "display_name" };
  }
  if (!partial || raw.roleTitle !== undefined) {
    const n = plainText(raw.roleTitle, "role_title", { required: !partial, max: 120 });
    if (!n.ok) return n;
    if (n.value != null) fields.roleTitle = n.value;
    else if (!partial) return { ok: false, reason: "role_title" };
  }
  if (raw.biography !== undefined || !partial) {
    if (raw.biography !== undefined) {
      const n = plainText(raw.biography, "biography", { required: false, max: 10000 });
      if (!n.ok) return n;
      fields.biography = n.value;
    }
  }
  if (raw.imageUrl !== undefined) {
    const n = httpsMediaUrl(raw.imageUrl, "image_url");
    if (!n.ok) return n;
    fields.imageUrl = n.value;
  }
  if (raw.sortOrder !== undefined) fields.sortOrder = Number(raw.sortOrder);
  if (raw.status !== undefined || !partial) {
    const status = raw.status != null ? String(raw.status).trim().toLowerCase() : "draft";
    if (!PAGE_STATUSES.has(status)) return { ok: false, reason: "status" };
    fields.status = status;
  }
  return { ok: true, fields };
}

function buildMinistryFields(raw, { partial }) {
  const fields = {};
  if (!partial || raw.name !== undefined) {
    const n = plainText(raw.name, "name", { required: !partial, max: 200 });
    if (!n.ok) return n;
    if (n.value != null) fields.name = n.value;
    else if (!partial) return { ok: false, reason: "name" };
  }
  if (raw.summary !== undefined) {
    const n = plainText(raw.summary, "summary", { required: false, max: 500 });
    if (!n.ok) return n;
    fields.summary = n.value;
  }
  if (raw.description !== undefined) {
    const n = plainText(raw.description, "description", { required: false, max: 20000 });
    if (!n.ok) return n;
    fields.description = n.value;
  }
  if (raw.meetingDay !== undefined) {
    const n = plainText(raw.meetingDay, "meeting_day", { required: false, max: 64 });
    if (!n.ok) return n;
    fields.meetingDay = n.value;
  }
  if (raw.contactEmail !== undefined) {
    const n = plainText(raw.contactEmail, "contact_email", { required: false, max: 254, min: 3 });
    if (!n.ok) return n;
    fields.contactEmail = n.value;
  }
  if (raw.imageUrl !== undefined) {
    const n = httpsMediaUrl(raw.imageUrl, "image_url");
    if (!n.ok) return n;
    fields.imageUrl = n.value;
  }
  if (raw.sortOrder !== undefined) fields.sortOrder = Number(raw.sortOrder);
  if (raw.joinPolicy !== undefined || raw.join_policy !== undefined) {
    const policy = String(raw.joinPolicy != null ? raw.joinPolicy : raw.join_policy)
      .trim()
      .toLowerCase();
    if (policy !== "open" && policy !== "request") return { ok: false, reason: "join_policy" };
    fields.joinPolicy = policy;
  } else if (!partial) {
    fields.joinPolicy = "request";
  }
  if (raw.status !== undefined || !partial) {
    const status = raw.status != null ? String(raw.status).trim().toLowerCase() : "draft";
    if (!PAGE_STATUSES.has(status)) return { ok: false, reason: "status" };
    fields.status = status;
  }
  return { ok: true, fields };
}

function buildEventFields(raw, { partial }) {
  const fields = {};
  if (!partial || raw.title !== undefined) {
    const n = plainText(raw.title, "title", { required: !partial, max: 200 });
    if (!n.ok) return n;
    if (n.value != null) fields.title = n.value;
    else if (!partial) return { ok: false, reason: "title" };
  }
  if (raw.summary !== undefined) {
    const n = plainText(raw.summary, "summary", { required: false, max: 1000 });
    if (!n.ok) return n;
    fields.summary = n.value;
  }
  if (!partial || raw.startsAt !== undefined) {
    if (raw.startsAt == null && !partial) return { ok: false, reason: "starts_at" };
    if (raw.startsAt != null) fields.startsAt = raw.startsAt;
  }
  if (raw.endsAt !== undefined) fields.endsAt = raw.endsAt;
  if (!partial || raw.timezone !== undefined) {
    const n = plainText(raw.timezone, "timezone", { required: !partial, max: 64 });
    if (!n.ok) return n;
    if (n.value != null) fields.timezone = n.value;
    else if (!partial) return { ok: false, reason: "timezone" };
  }
  if (raw.location !== undefined) {
    const n = plainText(raw.location, "location", { required: false, max: 300 });
    if (!n.ok) return n;
    fields.location = n.value;
  }
  if (raw.registrationUrl !== undefined) {
    const n = httpsMediaUrl(raw.registrationUrl, "registration_url");
    if (!n.ok) return n;
    fields.registrationUrl = n.value;
  }
  if (raw.imageUrl !== undefined) {
    const n = httpsMediaUrl(raw.imageUrl, "image_url");
    if (!n.ok) return n;
    fields.imageUrl = n.value;
  }
  if (raw.capacity !== undefined || raw.clearCapacity !== undefined) {
    if (raw.clearCapacity === true || raw.capacity === "" || raw.capacity == null) {
      fields.clearCapacity = true;
      fields.capacity = null;
    } else {
      const n = Number(raw.capacity);
      if (!Number.isInteger(n) || n < 1) return { ok: false, reason: "capacity" };
      fields.capacity = n;
      fields.clearCapacity = false;
    }
  }
  if (raw.status !== undefined || !partial) {
    const status = raw.status != null ? String(raw.status).trim().toLowerCase() : "draft";
    if (!EVENT_STATUSES.has(status)) return { ok: false, reason: "status" };
    fields.status = status;
  }
  return { ok: true, fields };
}

function buildSermonFields(raw, { partial }) {
  const fields = {};
  if (!partial || raw.title !== undefined) {
    const n = plainText(raw.title, "title", { required: !partial, max: 200 });
    if (!n.ok) return n;
    if (n.value != null) fields.title = n.value;
    else if (!partial) return { ok: false, reason: "title" };
  }
  if (!partial || raw.speakerName !== undefined) {
    const n = plainText(raw.speakerName, "speaker_name", { required: !partial, max: 200 });
    if (!n.ok) return n;
    if (n.value != null) fields.speakerName = n.value;
    else if (!partial) return { ok: false, reason: "speaker_name" };
  }
  if (!partial || raw.preachedAt !== undefined) {
    if (raw.preachedAt == null && !partial) return { ok: false, reason: "preached_at" };
    if (raw.preachedAt != null) fields.preachedAt = raw.preachedAt;
  }
  if (raw.summary !== undefined) {
    const n = plainText(raw.summary, "summary", { required: false, max: 5000 });
    if (!n.ok) return n;
    fields.summary = n.value;
  }
  if (raw.mediaUrl !== undefined) {
    const n = httpsMediaUrl(raw.mediaUrl, "media_url");
    if (!n.ok) return n;
    fields.mediaUrl = n.value;
  }
  if (raw.resourceUrl !== undefined) {
    const n = httpsMediaUrl(raw.resourceUrl, "resource_url");
    if (!n.ok) return n;
    fields.resourceUrl = n.value;
  }
  if (raw.status !== undefined || !partial) {
    const status = raw.status != null ? String(raw.status).trim().toLowerCase() : "draft";
    if (!PAGE_STATUSES.has(status)) return { ok: false, reason: "status" };
    fields.status = status;
  }
  return { ok: true, fields };
}

function buildContactFields(raw, { partial }) {
  const fields = {};
  if (!partial || raw.channelType !== undefined) {
    const t = String(raw.channelType || "")
      .trim()
      .toLowerCase();
    if (!CHANNEL_TYPE_RE.test(t)) return { ok: false, reason: "channel_type" };
    fields.channelType = t;
  }
  if (!partial || raw.label !== undefined) {
    const n = plainText(raw.label, "label", { required: !partial, max: 120 });
    if (!n.ok) return n;
    if (n.value != null) fields.label = n.value;
    else if (!partial) return { ok: false, reason: "label" };
  }
  if (!partial || raw.value !== undefined) {
    const n = plainText(raw.value, "value", { required: !partial, max: 500 });
    if (!n.ok) return n;
    if (n.value != null) fields.value = n.value;
    else if (!partial) return { ok: false, reason: "value" };
  }
  if (raw.sortOrder !== undefined) fields.sortOrder = Number(raw.sortOrder);
  if (raw.status !== undefined || !partial) {
    const status = raw.status != null ? String(raw.status).trim().toLowerCase() : "draft";
    if (!PAGE_STATUSES.has(status)) return { ok: false, reason: "status" };
    fields.status = status;
  }
  return { ok: true, fields };
}

function buildGivingFields(raw, { partial }) {
  const fields = {};
  if (!partial || raw.methodType !== undefined) {
    const t = String(raw.methodType || "")
      .trim()
      .toLowerCase();
    if (!CHANNEL_TYPE_RE.test(t)) return { ok: false, reason: "method_type" };
    fields.methodType = t;
  }
  if (!partial || raw.label !== undefined) {
    const n = plainText(raw.label, "label", { required: !partial, max: 120 });
    if (!n.ok) return n;
    if (n.value != null) fields.label = n.value;
    else if (!partial) return { ok: false, reason: "label" };
  }
  if (raw.instructions !== undefined) {
    const n = plainText(raw.instructions, "instructions", { required: false, max: 5000 });
    if (!n.ok) return n;
    fields.instructions = n.value;
  }
  if (raw.externalUrl !== undefined) {
    const n = httpsMediaUrl(raw.externalUrl, "external_url");
    if (!n.ok) return n;
    fields.externalUrl = n.value;
  }
  if (raw.sortOrder !== undefined) fields.sortOrder = Number(raw.sortOrder);
  if (raw.status !== undefined || !partial) {
    const status = raw.status != null ? String(raw.status).trim().toLowerCase() : "draft";
    if (!PAGE_STATUSES.has(status)) return { ok: false, reason: "status" };
    fields.status = status;
  }
  return { ok: true, fields };
}

async function createLeader(db, input) {
  return createOwned(db, "leader", input, (raw) => buildLeaderFields(raw, { partial: false }));
}
async function updateLeader(db, id, patch) {
  return updateOwned(db, "leader", id, patch, (raw) => buildLeaderFields(raw, { partial: true }));
}
async function createMinistry(db, input) {
  return createOwned(db, "ministry", input, (raw) => buildMinistryFields(raw, { partial: false }));
}
async function updateMinistry(db, id, patch) {
  return updateOwned(db, "ministry", id, patch, (raw) => buildMinistryFields(raw, { partial: true }));
}
async function createEvent(db, input) {
  return createOwned(db, "event", input, (raw) => buildEventFields(raw, { partial: false }));
}
async function updateEvent(db, id, patch) {
  return updateOwned(db, "event", id, patch, (raw) => buildEventFields(raw, { partial: true }));
}
async function createSermon(db, input) {
  return createOwned(db, "sermon", input, (raw) => buildSermonFields(raw, { partial: false }));
}
async function updateSermon(db, id, patch) {
  return updateOwned(db, "sermon", id, patch, (raw) => buildSermonFields(raw, { partial: true }));
}
async function createContactChannel(db, input) {
  return createOwned(db, "contact_channel", input, (raw) => buildContactFields(raw, { partial: false }));
}
async function updateContactChannel(db, id, patch) {
  return updateOwned(db, "contact_channel", id, patch, (raw) =>
    buildContactFields(raw, { partial: true })
  );
}
async function createGivingMethod(db, input) {
  return createOwned(db, "giving_method", input, (raw) => buildGivingFields(raw, { partial: false }));
}
async function updateGivingMethod(db, id, patch) {
  return updateOwned(db, "giving_method", id, patch, (raw) => buildGivingFields(raw, { partial: true }));
}

async function listAdminLeaders(db, input) {
  return listAdminScoped(db, input, repo.listLeaders);
}
async function listAdminMinistries(db, input) {
  return listAdminScoped(db, input, repo.listMinistries);
}
async function listAdminEvents(db, input) {
  return listAdminScoped(db, input, repo.listEvents);
}
async function listAdminSermons(db, input) {
  return listAdminScoped(db, input, repo.listSermons);
}
async function listAdminContactChannels(db, input) {
  return listAdminScoped(db, input, repo.listContactChannels);
}
async function listAdminGivingMethods(db, input) {
  return listAdminScoped(db, input, repo.listGivingMethods);
}

async function listAdminScoped(db, input, listFn) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) return { ok: false, status: STATUS.INVALID_INPUT, items: [], reason: "church_id" };
  let branchId;
  if (input && Object.prototype.hasOwnProperty.call(input, "branchId")) {
    branchId = input.branchId == null || input.branchId === "" ? null : String(input.branchId).trim();
  }
  try {
    return await withClient(db, async (client) => {
      const items = await listFn(client, { churchId, branchId });
      return { ok: true, status: STATUS.OK, items };
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, items: [] };
  }
}

module.exports = {
  STATUS,
  CONTENT_STATUS,
  PUBLIC_PAGE_KEYS,
  provisionEmptyPublicPages,
  listAdminPages,
  getAdminPageBundle,
  updatePublicPage,
  createPageSection,
  updatePageSection,
  listAdminSections,
  createLeader,
  updateLeader,
  listAdminLeaders,
  createMinistry,
  updateMinistry,
  listAdminMinistries,
  createEvent,
  updateEvent,
  listAdminEvents,
  createSermon,
  updateSermon,
  listAdminSermons,
  createContactChannel,
  updateContactChannel,
  listAdminContactChannels,
  createGivingMethod,
  updateGivingMethod,
  listAdminGivingMethods,
};
