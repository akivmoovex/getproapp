"use strict";

/**
 * BlessBoard V5 member resources, forms, and requests.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const { createRequireActiveMember } = require("./requireActiveMember");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { CSRF_FIELD, validateCsrf } = require("../../platform/http/v5Csrf");
const { buildMemberShellLocals } = require("./memberShellLocals");
const {
  STATUS,
  REQUEST_CATEGORIES,
  REQUEST_STATUSES,
  ALLOWED_FIELD_TYPES,
  listResources,
  getResource,
  listForms,
  getForm,
  submitForm,
  listFormSubmissions,
  getFormSubmission,
  createMemberRequest,
  listMemberRequests,
  getMemberRequest,
} = require("../services/formsRequestsService");
const { createMediaUploadService } = require("../media/mediaUploadService");
const formsRepo = require("../repositories/formsRequestsRepository");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function renderMemberView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
}

/**
 * @param {string|null|undefined} mime
 */
function resourceTypeLabel(mime) {
  const value = String(mime || "").toLowerCase();
  if (!value) return null;
  if (value.includes("pdf")) return "PDF";
  if (value.startsWith("image/")) return "Image";
  if (value.startsWith("audio/")) return "Audio";
  if (value.startsWith("video/")) return "Video";
  if (value.includes("word") || value.includes("document")) return "Document";
  if (value.includes("sheet") || value.includes("excel")) return "Spreadsheet";
  return "File";
}

/**
 * @param {string|null|undefined} mime
 * @param {boolean} hasFile
 */
function resourceIcon(mime, hasFile) {
  if (!hasFile) return "article";
  const value = String(mime || "").toLowerCase();
  if (value.includes("pdf")) return "picture_as_pdf";
  if (value.startsWith("audio/")) return "headphones";
  if (value.startsWith("video/")) return "movie";
  if (value.startsWith("image/")) return "image";
  return "description";
}

/**
 * @param {number|null|undefined} bytes
 */
function formatResourceSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 1)} MB`;
}

/**
 * Attach real media filename/type/size when the linked asset is active.
 * @param {{ query: Function }} pool
 * @param {object|null} resource
 */
async function presentMemberResource(pool, resource) {
  if (!resource) return null;
  const presented = {
    ...resource,
    fileName: null,
    mimeType: null,
    sizeBytes: null,
    sizeLabel: null,
    typeLabel: null,
    icon: resourceIcon(null, Boolean(resource.mediaAssetId)),
  };
  if (!resource.mediaAssetId || !UUID_RE.test(String(resource.mediaAssetId))) {
    return presented;
  }
  const client = await pool.connect();
  try {
    const meta = await formsRepo.findMediaMeta(client, resource.mediaAssetId);
    if (!meta || String(meta.status) !== "active") {
      return {
        ...presented,
        mediaAssetId: null,
        icon: resourceIcon(null, false),
      };
    }
    if (String(meta.church_id) !== String(resource.churchId)) {
      return {
        ...presented,
        mediaAssetId: null,
        icon: resourceIcon(null, false),
      };
    }
    const mimeType = meta.mime_type || null;
    const sizeBytes =
      meta.size_bytes == null || meta.size_bytes === "" ? null : Number(meta.size_bytes);
    return {
      ...presented,
      fileName: meta.original_filename || null,
      mimeType,
      sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
      sizeLabel: formatResourceSize(sizeBytes),
      typeLabel: resourceTypeLabel(mimeType),
      icon: resourceIcon(mimeType, true),
    };
  } finally {
    client.release();
  }
}

/**
 * @param {string} raw
 */
function normalizeMemberResourceFilter(raw) {
  const value = String(raw || "all")
    .trim()
    .toLowerCase();
  if (value === "files" || value === "info") return value;
  return "all";
}

/**
 * @param {object[]} resources
 * @param {string} filter
 * @param {string} q
 */
function filterVisibleMemberResources(resources, filter, q) {
  let out = Array.isArray(resources) ? resources.slice() : [];
  if (filter === "files") out = out.filter((item) => item && item.mediaAssetId);
  else if (filter === "info") out = out.filter((item) => item && !item.mediaAssetId);
  const query = String(q || "")
    .trim()
    .toLowerCase()
    .slice(0, 100);
  if (query) {
    out = out.filter((item) => {
      if (!item) return false;
      const title = String(item.title || "").toLowerCase();
      const description = String(item.description || "").toLowerCase();
      const fileName = String(item.fileName || "").toLowerCase();
      return title.includes(query) || description.includes(query) || fileName.includes(query);
    });
  }
  return out;
}

/**
 * Count allowlisted schema fields for member presentation.
 * @param {object|null|undefined} form
 */
function countMemberFormFields(form) {
  const fields =
    form && form.schema && Array.isArray(form.schema.fields) ? form.schema.fields : [];
  let count = 0;
  for (const field of fields) {
    if (!field || !field.key) continue;
    if (!ALLOWED_FIELD_TYPES.includes(field.type)) continue;
    count += 1;
  }
  return count;
}

/**
 * @param {object|null} form
 */
function presentMemberForm(form) {
  if (!form) return null;
  const fieldCount = countMemberFormFields(form);
  return {
    ...form,
    fieldCount,
    fieldCountLabel: fieldCount === 1 ? "1 field" : `${fieldCount} fields`,
  };
}

/**
 * Member-facing submission status — only real DB values (`submitted` | `archived`).
 * @param {string|null|undefined} status
 */
function memberSubmissionStatusLabel(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "archived") return "Closed";
  if (value === "submitted") return "Submitted";
  return null;
}

/**
 * @param {string|Date|null|undefined} value
 */
function formatMemberSubmittedAt(value) {
  if (!value) return null;
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch (_err) {
    return null;
  }
}

/**
 * @param {object|null} submission
 */
function presentMemberSubmission(submission) {
  if (!submission) return null;
  const statusLabel = memberSubmissionStatusLabel(submission.status);
  return {
    ...submission,
    statusLabel,
    submittedAtLabel: formatMemberSubmittedAt(submission.submittedAt),
  };
}

/**
 * @param {string} raw
 */
function normalizeMemberFormsFilter(raw) {
  const value = String(raw || "all")
    .trim()
    .toLowerCase();
  if (value === "available" || value === "history") return value;
  return "all";
}

/**
 * @param {object[]} forms
 * @param {string} q
 */
function filterVisibleMemberForms(forms, q) {
  let out = Array.isArray(forms) ? forms.slice() : [];
  const query = String(q || "")
    .trim()
    .toLowerCase()
    .slice(0, 100);
  if (!query) return out;
  return out.filter((item) => {
    if (!item) return false;
    const title = String(item.title || "").toLowerCase();
    const description = String(item.description || "").toLowerCase();
    return title.includes(query) || description.includes(query);
  });
}

/**
 * @param {object[]} submissions
 * @param {string} q
 */
function filterVisibleMemberSubmissions(submissions, q) {
  let out = Array.isArray(submissions) ? submissions.slice() : [];
  const query = String(q || "")
    .trim()
    .toLowerCase()
    .slice(0, 100);
  if (!query) return out;
  return out.filter((item) => {
    if (!item) return false;
    const title = String(item.formTitle || "").toLowerCase();
    const status = String(item.statusLabel || item.status || "").toLowerCase();
    return title.includes(query) || status.includes(query);
  });
}

/**
 * Safe member media download headers (private, nosniff, attachment disposition).
 * @param {import('express').Response} res
 * @param {{ asset?: object, buffer: Buffer }} delivered
 */
function sendMemberMediaDownload(res, delivered) {
  const asset = delivered.asset || {};
  const mime = asset.mimeType || asset.contentType || "application/octet-stream";
  const rawName = String(asset.originalFilename || "download")
    .replace(/[\r\n"]/g, "")
    .slice(0, 180);
  const filename = rawName || "download";
  res.setHeader("Content-Type", mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(delivered.buffer);
}

/**
 * @param {object|null|undefined} form
 * @returns {Record<string, string>}
 */
function fieldLabelsFromForm(form) {
  const labels = {};
  const fields =
    form && form.schema && Array.isArray(form.schema.fields) ? form.schema.fields : [];
  for (const field of fields) {
    if (!field || !field.key) continue;
    if (!ALLOWED_FIELD_TYPES.includes(field.type)) continue;
    labels[field.key] = field.label || field.key;
  }
  return labels;
}

/**
 * Real V5 request categories only (`prayer` | `pastoral` | `practical` | `other`).
 * @param {string|null|undefined} category
 */
function memberRequestCategoryLabel(category) {
  const value = String(category || "")
    .trim()
    .toLowerCase();
  if (value === "prayer") return "Prayer";
  if (value === "pastoral") return "Care";
  if (value === "practical") return "Support";
  if (value === "other") return "Other";
  return null;
}

/**
 * @param {string|null|undefined} category
 */
function memberRequestCategoryIcon(category) {
  const value = String(category || "")
    .trim()
    .toLowerCase();
  if (value === "prayer") return "church";
  if (value === "pastoral") return "medical_services";
  if (value === "practical") return "handshake";
  return "more_horiz";
}

/**
 * Real V5 request statuses only (`submitted` | `in_review` | `resolved` | `closed`).
 * @param {string|null|undefined} status
 */
function memberRequestStatusLabel(status) {
  const value = String(status || "")
    .trim()
    .toLowerCase();
  if (value === "submitted") return "Pending review";
  if (value === "in_review") return "In review";
  if (value === "resolved") return "Resolved";
  if (value === "closed") return "Closed";
  return null;
}

/**
 * @param {string|null|undefined} status
 */
function memberRequestStatusChipClass(status) {
  const value = String(status || "")
    .trim()
    .toLowerCase();
  if (value === "submitted") return "bb-mp-chip--pending";
  if (value === "in_review") return "bb-mp-chip--open";
  if (value === "resolved") return "bb-mp-chip--active";
  return "bb-mp-chip--request";
}

/**
 * @param {string} raw
 */
function normalizeMemberRequestsFilter(raw) {
  const value = String(raw || "all")
    .trim()
    .toLowerCase();
  if (value === "active" || value === "resolved" || value === "closed") return value;
  if (REQUEST_STATUSES.includes(value)) return value;
  return "all";
}

/**
 * @param {object[]} requests
 * @param {string} filter
 * @param {string} q
 */
function filterVisibleMemberRequests(requests, filter, q) {
  let out = Array.isArray(requests) ? requests.slice() : [];
  const mode = normalizeMemberRequestsFilter(filter);
  if (mode === "active") {
    out = out.filter((item) => item && (item.status === "submitted" || item.status === "in_review"));
  } else if (mode === "submitted" || mode === "in_review" || mode === "resolved" || mode === "closed") {
    out = out.filter((item) => item && item.status === mode);
  }
  const query = String(q || "")
    .trim()
    .toLowerCase()
    .slice(0, 100);
  if (!query) return out;
  return out.filter((item) => {
    if (!item) return false;
    const subject = String(item.subject || "").toLowerCase();
    const message = String(item.message || "").toLowerCase();
    const category = String(item.categoryLabel || item.category || "").toLowerCase();
    const status = String(item.statusLabel || item.status || "").toLowerCase();
    return (
      subject.includes(query) ||
      message.includes(query) ||
      category.includes(query) ||
      status.includes(query)
    );
  });
}

/**
 * Live summary counts from the member's own request list only.
 * @param {object[]} requests
 */
function summarizeMemberRequests(requests) {
  const list = Array.isArray(requests) ? requests : [];
  let pending = 0;
  let inReview = 0;
  let resolved = 0;
  let closed = 0;
  for (const item of list) {
    if (!item) continue;
    if (item.status === "submitted") pending += 1;
    else if (item.status === "in_review") inReview += 1;
    else if (item.status === "resolved") resolved += 1;
    else if (item.status === "closed") closed += 1;
  }
  return {
    total: list.length,
    active: pending + inReview,
    pending,
    inReview,
    resolved,
    closed,
  };
}

/**
 * Member-safe request history — status + member-visible note only.
 * Omits changedByUserId, memberVisible flags, and other internal fields.
 * @param {object|null|undefined} request
 * @returns {object|null}
 */
function presentMemberRequest(request) {
  if (!request) return null;
  const history = Array.isArray(request.history)
    ? request.history.map((h) => ({
        fromStatus: h.fromStatus || null,
        toStatus: h.toStatus,
        fromStatusLabel: h.fromStatus ? memberRequestStatusLabel(h.fromStatus) : null,
        toStatusLabel: memberRequestStatusLabel(h.toStatus),
        note: h.note || null,
        createdAt: h.createdAt || null,
        createdAtLabel: formatMemberSubmittedAt(h.createdAt),
      }))
    : [];
  const statusLabel = memberRequestStatusLabel(request.status);
  const categoryLabel = memberRequestCategoryLabel(request.category);
  return {
    id: request.id,
    category: request.category,
    categoryLabel,
    categoryIcon: memberRequestCategoryIcon(request.category),
    subject: request.subject,
    message: request.message,
    status: request.status,
    statusLabel,
    statusChipClass: memberRequestStatusChipClass(request.status),
    mediaAssetId: request.mediaAssetId || null,
    createdAt: request.createdAt || null,
    createdAtLabel: formatMemberSubmittedAt(request.createdAt),
    updatedAt: request.updatedAt || null,
    updatedAtLabel: formatMemberSubmittedAt(request.updatedAt || request.createdAt),
    history,
  };
}

function createFormsRequestsMemberRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const mediaService = deps.mediaService || createMediaUploadService(env);

  const router = express.Router();
  const requireMember = createRequireActiveMember({ getPool });

  function rejectApex(req, res, next) {
    if (isApexHost(req)) {
      if (typeof sendUnavailable === "function") return sendUnavailable(req, res);
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

  function shellLocals(req, res, activeNav, extra) {
    return buildMemberShellLocals(req, res, {
      env,
      isProduction,
      activeNav,
      extra: {
        requestCategories: REQUEST_CATEGORIES,
        ...(extra || {}),
      },
    });
  }

  function memberScope(req) {
    const tenant = resolveTenantForAuthorization(req);
    const access = req.blessBoardMemberAccess;
    if (!tenant || !tenant.church || !tenant.primaryBranch || !access || !access.member) {
      return null;
    }
    return {
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
      memberId: access.member.id,
      actorUserId: req.v5Session && req.v5Session.session ? req.v5Session.session.userId : null,
    };
  }

  function validateCsrfPost(req, res) {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      res.status(403).type("text").send("Invalid or missing CSRF token.");
      return false;
    }
    return true;
  }

  // --- resources ---
  router.get("/member/resources", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const listed = await listResources(getPool(), {
      churchId: scope.churchId,
      branchId: scope.branchId,
      forMember: true,
    });
    if (!listed.ok) return res.status(503).type("text").send("Unavailable");
    const allResources = [];
    for (const resource of listed.resources || []) {
      allResources.push(await presentMemberResource(getPool(), resource));
    }
    const filter = normalizeMemberResourceFilter(req.query && req.query.filter);
    const q = String((req.query && req.query.q) || "")
      .trim()
      .slice(0, 100);
    const resources = filterVisibleMemberResources(allResources, filter, q);
    return res
      .status(200)
      .type("html")
      .send(
        renderMemberView(
          "forms-requests/member-resources.ejs",
          shellLocals(req, res, "resources", {
            allResources,
            resources,
            filter,
            q,
          })
        )
      );
  });

  router.get("/member/resources/:id", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(404).type("text").send("Not found");
    const loaded = await getResource(getPool(), {
      id,
      churchId: scope.churchId,
      branchId: scope.branchId,
      forMember: true,
    });
    if (!loaded.ok) {
      return res.status(loaded.status === STATUS.FORBIDDEN ? 403 : 404).type("text").send("Not found");
    }
    const resource = await presentMemberResource(getPool(), loaded.resource);
    return res
      .status(200)
      .type("html")
      .send(
        renderMemberView(
          "forms-requests/member-resource-detail.ejs",
          shellLocals(req, res, "resources", { resource })
        )
      );
  });

  router.get("/member/resources/:id/file", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(404).type("text").send("Not found");
    const loaded = await getResource(getPool(), {
      id,
      churchId: scope.churchId,
      branchId: scope.branchId,
      forMember: true,
    });
    if (!loaded.ok || !loaded.resource.mediaAssetId) {
      return res.status(404).type("text").send("Not found");
    }
    const delivered = await mediaService.loadMediaBytes(getPool(), {
      assetId: loaded.resource.mediaAssetId,
      churchId: scope.churchId,
      allowPrivate: true,
      viewerChurchId: scope.churchId,
    });
    if (!delivered.ok) {
      return res.status(404).type("text").send("Not found");
    }
    if (delivered.redirectUrl) {
      res.setHeader("Cache-Control", "private, no-store");
      return res.redirect(302, delivered.redirectUrl);
    }
    if (!delivered.buffer) {
      return res.status(404).type("text").send("Not found");
    }
    return sendMemberMediaDownload(res, delivered);
  });

  // --- forms ---
  router.get("/member/forms", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const listed = await listForms(getPool(), {
      churchId: scope.churchId,
      branchId: scope.branchId,
      forMember: true,
    });
    const mine = await listFormSubmissions(getPool(), {
      churchId: scope.churchId,
      memberId: scope.memberId,
      forMember: true,
    });
    const allForms = (listed.ok ? listed.forms : []).map(presentMemberForm).filter(Boolean);
    const allSubmissions = (mine.ok ? mine.submissions : [])
      .map(presentMemberSubmission)
      .filter(Boolean);
    const filter = normalizeMemberFormsFilter(req.query && req.query.filter);
    const q = String((req.query && req.query.q) || "")
      .trim()
      .slice(0, 100);
    const forms =
      filter === "history" ? [] : filterVisibleMemberForms(allForms, q);
    const submissions =
      filter === "available" ? [] : filterVisibleMemberSubmissions(allSubmissions, q);
    return res
      .status(200)
      .type("html")
      .send(
        renderMemberView(
          "forms-requests/member-forms.ejs",
          shellLocals(req, res, "forms", {
            allForms,
            allSubmissions,
            forms,
            submissions,
            filter,
            q,
            saved: String((req.query && req.query.saved) || ""),
          })
        )
      );
  });

  router.get("/member/forms/submissions/:id", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(404).type("text").send("Not found");
    const loaded = await getFormSubmission(getPool(), {
      id,
      churchId: scope.churchId,
      memberId: scope.memberId,
      forMember: true,
    });
    if (!loaded.ok) {
      return res.status(loaded.status === STATUS.FORBIDDEN ? 403 : 404).type("text").send("Not found");
    }
    let form = null;
    if (loaded.submission && loaded.submission.formId) {
      const formLoaded = await getForm(getPool(), {
        id: loaded.submission.formId,
        churchId: scope.churchId,
        branchId: scope.branchId,
        forMember: true,
      });
      if (formLoaded.ok) form = formLoaded.form;
    }
    return res
      .status(200)
      .type("html")
      .send(
        renderMemberView(
          "forms-requests/member-submission.ejs",
          shellLocals(req, res, "forms", {
            submission: presentMemberSubmission(loaded.submission),
            form: presentMemberForm(form),
            fieldLabels: fieldLabelsFromForm(form),
            saved: String((req.query && req.query.saved) || ""),
          })
        )
      );
  });

  router.get("/member/forms/:id", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(404).type("text").send("Not found");
    const loaded = await getForm(getPool(), {
      id,
      churchId: scope.churchId,
      branchId: scope.branchId,
      forMember: true,
    });
    if (!loaded.ok) return res.status(404).type("text").send("Not found");
    return res
      .status(200)
      .type("html")
      .send(
        renderMemberView(
          "forms-requests/member-form-detail.ejs",
          shellLocals(req, res, "forms", {
            form: presentMemberForm(loaded.form),
            error: null,
            submittedAnswers: {},
            allowedFieldTypes: ALLOWED_FIELD_TYPES,
          })
        )
      );
  });

  router.post("/member/forms/:id/submit", rejectApex, requireMember, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(404).type("text").send("Not found");
    const body = req.body || {};
    const answers = {};
    for (const [key, value] of Object.entries(body)) {
      if (key === CSRF_FIELD || key.startsWith("_")) continue;
      answers[key] = value;
    }
    const submitted = await submitForm(getPool(), {
      churchId: scope.churchId,
      formId: id,
      memberId: scope.memberId,
      branchId: scope.branchId,
      answers,
    });
    if (!submitted.ok) {
      const loaded = await getForm(getPool(), {
        id,
        churchId: scope.churchId,
        branchId: scope.branchId,
        forMember: true,
      });
      return res
        .status(400)
        .type("html")
        .send(
          renderMemberView(
            "forms-requests/member-form-detail.ejs",
            shellLocals(req, res, "forms", {
              form: presentMemberForm(
                loaded.ok ? loaded.form : { id, title: "Form", schema: { fields: [] } }
              ),
              error: "Please check your answers and try again.",
              submittedAnswers: answers,
              allowedFieldTypes: ALLOWED_FIELD_TYPES,
            })
          )
        );
    }
    return res.redirect(303, `/member/forms/submissions/${submitted.submission.id}?saved=1`);
  });

  // --- requests ---
  router.get("/member/requests", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const listed = await listMemberRequests(getPool(), {
      churchId: scope.churchId,
      memberId: scope.memberId,
      forMember: true,
    });
    const allRequests = (listed.ok ? listed.requests : []).map(presentMemberRequest).filter(Boolean);
    const filter = normalizeMemberRequestsFilter(req.query && req.query.filter);
    const q = String((req.query && req.query.q) || "")
      .trim()
      .slice(0, 100);
    const requests = filterVisibleMemberRequests(allRequests, filter, q);
    return res
      .status(200)
      .type("html")
      .send(
        renderMemberView(
          "forms-requests/member-requests.ejs",
          shellLocals(req, res, "requests", {
            pageTitle: "Request status",
            allRequests,
            requests,
            summary: summarizeMemberRequests(allRequests),
            filter,
            q,
            saved: String((req.query && req.query.saved) || ""),
          })
        )
      );
  });

  router.get("/member/requests/new", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    return res
      .status(200)
      .type("html")
      .send(
        renderMemberView(
          "forms-requests/member-request-new.ejs",
          shellLocals(req, res, "requests", {
            pageTitle: "Submit a request",
            error: null,
            submittedValues: {},
          })
        )
      );
  });

  router.post("/member/requests", rejectApex, requireMember, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const body = req.body || {};
    const created = await createMemberRequest(getPool(), {
      churchId: scope.churchId,
      branchId: scope.branchId,
      memberId: scope.memberId,
      actorUserId: scope.actorUserId,
      category: body.category,
      subject: body.subject,
      message: body.message,
      mediaAssetId: body.media_asset_id || null,
    });
    if (!created.ok) {
      return res
        .status(400)
        .type("html")
        .send(
          renderMemberView(
            "forms-requests/member-request-new.ejs",
            shellLocals(req, res, "requests", {
              pageTitle: "Submit a request",
              error: "Please check the form and try again.",
              submittedValues: {
                category: String(body.category || ""),
                subject: String(body.subject || ""),
                message: String(body.message || ""),
              },
            })
          )
        );
    }
    return res.redirect(303, `/member/requests/${created.request.id}?saved=1`);
  });

  router.get("/member/requests/:id", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(404).type("text").send("Not found");
    const loaded = await getMemberRequest(getPool(), {
      id,
      churchId: scope.churchId,
      memberId: scope.memberId,
      forMember: true,
    });
    if (!loaded.ok) {
      return res.status(loaded.status === STATUS.FORBIDDEN ? 403 : 404).type("text").send("Not found");
    }
    return res
      .status(200)
      .type("html")
      .send(
        renderMemberView(
          "forms-requests/member-request-detail.ejs",
          shellLocals(req, res, "requests", {
            pageTitle: loaded.request.subject || "Request",
            request: presentMemberRequest(loaded.request),
            saved: String((req.query && req.query.saved) || ""),
          })
        )
      );
  });

  router.get("/member/requests/:id/file", rejectApex, requireMember, async (req, res) => {
    const scope = memberScope(req);
    if (!scope) return res.status(403).type("text").send("Forbidden");
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(404).type("text").send("Not found");
    const loaded = await getMemberRequest(getPool(), {
      id,
      churchId: scope.churchId,
      memberId: scope.memberId,
      forMember: true,
    });
    if (!loaded.ok || !loaded.request.mediaAssetId) {
      return res.status(404).type("text").send("Not found");
    }
    const delivered = await mediaService.loadMediaBytes(getPool(), {
      assetId: loaded.request.mediaAssetId,
      churchId: scope.churchId,
      allowPrivate: true,
      viewerChurchId: scope.churchId,
    });
    if (!delivered.ok) {
      return res.status(404).type("text").send("Not found");
    }
    if (delivered.redirectUrl) {
      res.setHeader("Cache-Control", "private, no-store");
      return res.redirect(302, delivered.redirectUrl);
    }
    if (!delivered.buffer) {
      return res.status(404).type("text").send("Not found");
    }
    return sendMemberMediaDownload(res, delivered);
  });

  return router;
}

module.exports = {
  createFormsRequestsMemberRouter,
};
