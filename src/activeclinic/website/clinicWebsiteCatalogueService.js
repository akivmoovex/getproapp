"use strict";

/**
 * Website Management public catalogue (doctors and services).
 * Toggles canonical public-profile / website-visible flags and CMS overlays.
 * Service create/edit writes the canonical appointment_service_types catalogue.
 * Doctor create/edit writes public profile fields on staff_members without granting login.
 */

const crypto = require("crypto");
const { PERMISSIONS, hasWebsitePermission } = require("../../platform/website/permissions");
const libraryService = require("./clinicWebsiteLibraryService");
const { LIBRARY_SOURCES, boolValue } = require("./clinicWebsiteCms");
const appointmentRepo = require("../repositories/appointmentRepository");
const { createStaffMember } = require("../services/activeClinicStaffService");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  INACTIVE: "inactive",
  NEEDS_PROFILE: "needs_profile",
  CONFLICT: "conflict",
  HAS_LOGIN: "has_login",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Matches appointment_service_types_key_format: letter first, then [a-z0-9_-].
const SERVICE_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const PROFILE_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const SERVICE_DESCRIPTION_MAX = 500;
const SERVICE_SUMMARY_MAX = 1000;

function granted(input) {
  return Array.isArray(input && input.grantedPermissions) ? input.grantedPermissions : [];
}

function requireEdit(input) {
  if (!hasWebsitePermission(granted(input), PERMISSIONS.EDIT)) {
    return { ok: false, code: RESULT.FORBIDDEN };
  }
  return { ok: true };
}

/**
 * Empty catalogue form image fields must not clear an existing operational overlay photo.
 * Only forward image* keys when a real media selection is present.
 */
function sanitizeOverlayImageInput(payload) {
  const next = { ...(payload || {}) };
  delete next.image;
  const mediaId = String(next.imageMediaId || "").trim();
  const src = String(next.imageSrc || "").trim();
  if (!(mediaId || src)) {
    delete next.imageMediaId;
    delete next.imageSrc;
    delete next.imageAlt;
  }
  return next;
}

function slugKey(name) {
  const base = String(name || "clinician")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base.replace(/^[^a-z]+/, "") || "clinician";
}

function serviceKeyFromName(name) {
  const base = String(name || "service")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  // DB requires a leading letter (same rule as staff public_profile_key).
  return base.replace(/^[^a-z]+/, "").slice(0, 64) || "service";
}

function clampText(value, max) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

function resolveServiceCategoryAndSummary(input, existing) {
  const hasCategory = input && Object.prototype.hasOwnProperty.call(input, "category");
  const hasSummary = input && Object.prototype.hasOwnProperty.call(input, "publicSummary");
  const categoryRaw = hasCategory ? String(input.category || "").trim() : "";
  const summaryRaw = hasSummary
    ? String(input.publicSummary || "").trim()
    : existing
      ? String(existing.public_summary || "").trim()
      : "";
  // Category is the public short label; fall back to explicit summary, then description.
  const publicSummary =
    clampText(summaryRaw || categoryRaw, SERVICE_SUMMARY_MAX) ||
    (existing ? existing.public_summary || null : null);
  return {
    category: categoryRaw || (publicSummary || ""),
    publicSummary,
  };
}

function overlayFor(items, type, key) {
  const wanted = String(key || "");
  if (!wanted) return null;
  const matches = (items || []).filter(
    (item) =>
      item &&
      item.source === LIBRARY_SOURCES.OPERATIONAL &&
      item.type === type &&
      String(item.operational_key || "") === wanted
  );
  return matches.find((item) => item.stored) || matches[0] || null;
}

async function uniqueProfileKey(db, healthcareOrganizationId, staffId, preferred) {
  let candidate = slugKey(preferred);
  for (let i = 0; i < 12; i += 1) {
    const key = i === 0 ? candidate : `${candidate.slice(0, 32)}-${i + 1}`;
    const existing = await db.query(
      `SELECT id FROM activeclinic.staff_members
        WHERE healthcare_organization_id = $1
          AND public_profile_key = $2
          AND id <> $3
        LIMIT 1`,
      [healthcareOrganizationId, key, staffId]
    );
    if (!existing.rows.length) return key;
  }
  return `${candidate.slice(0, 24)}-${String(staffId).replace(/-/g, "").slice(0, 8)}`;
}

async function listCatalogueStaff(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "");
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(healthcareOrganizationId)) {
    return [];
  }
  const result = await db.query(
    `SELECT s.id, s.status, s.display_name, s.first_name, s.last_name, s.job_title,
            s.public_display_name, s.public_title, s.public_bio, s.public_profile_key,
            s.public_profile_enabled, s.platform_identity_id
       FROM activeclinic.staff_members s
      WHERE s.organization_id = $1
        AND s.healthcare_organization_id = $2
        AND s.status <> 'archived'
      ORDER BY s.display_name ASC`,
    [organizationId, healthcareOrganizationId]
  );
  return result.rows;
}

async function listCatalogueServices(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "");
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(healthcareOrganizationId)) {
    return [];
  }
  const result = await db.query(
    `SELECT ast.id, ast.service_key, ast.display_name, ast.description, ast.public_summary, ast.status,
            ast.public_bookable, ast.public_website_visible, ast.default_duration_minutes
       FROM activeclinic.appointment_service_types ast
      WHERE ast.organization_id = $1
        AND ast.healthcare_organization_id = $2
        AND ast.status <> 'archived'
      ORDER BY ast.display_name ASC`,
    [organizationId, healthcareOrganizationId]
  );
  return result.rows;
}

function splitPublicName(name) {
  const cleaned = String(name || "")
    .trim()
    .replace(/^(dr|doctor)\.?\s+/i, "");
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0].slice(0, 100), lastName: parts[0].slice(0, 100) };
  return {
    firstName: parts[0].slice(0, 100),
    lastName: parts.slice(1).join(" ").slice(0, 100),
  };
}

function splitPublicBio(publicBio) {
  const text = String(publicBio || "").trim();
  const match = text.match(/^Qualifications:\s*([^\n]+)(?:\n+([\s\S]*))?$/i);
  if (!match) return { qualifications: "", biography: text };
  return {
    qualifications: String(match[1] || "").trim(),
    biography: String(match[2] || "").trim(),
  };
}

function composePublicBio(biography, qualifications) {
  const bio = String(biography || "").trim();
  const quals = String(qualifications || "").trim();
  if (!quals) return bio || null;
  if (!bio) return `Qualifications: ${quals}`.slice(0, 2000);
  if (/^Qualifications:/i.test(bio)) return bio.slice(0, 2000);
  return `Qualifications: ${quals}\n\n${bio}`.slice(0, 2000);
}

function resolveDoctorTitleFields(input, existing) {
  const hasProfessionalTitle = Object.prototype.hasOwnProperty.call(input || {}, "professionalTitle");
  const hasSpecialty =
    Object.prototype.hasOwnProperty.call(input || {}, "specialty") ||
    Object.prototype.hasOwnProperty.call(input || {}, "publicTitle") ||
    Object.prototype.hasOwnProperty.call(input || {}, "title");
  const professionalTitle = hasProfessionalTitle
    ? String(input.professionalTitle || "").trim().slice(0, 120) || null
    : existing
      ? existing.public_title
      : null;
  const specialtyRaw = hasSpecialty
    ? String(input.specialty || input.publicTitle || input.title || "").trim().slice(0, 120) || null
    : existing
      ? existing.job_title
      : null;
  // Prefer explicit professional title for public_title; fall back to specialty/title.
  const publicTitle =
    professionalTitle ||
    (hasSpecialty ? specialtyRaw : existing ? existing.public_title : specialtyRaw) ||
    null;
  const jobTitle = specialtyRaw || publicTitle || (existing && existing.job_title) || "Clinician";
  return { publicTitle, jobTitle, specialty: specialtyRaw || "" };
}

function syntheticPublicProfilePhone() {
  const n = crypto.randomBytes(4).readUInt32BE(0) % 100000000;
  return `+2609${String(n).padStart(8, "0")}`;
}

function presentDoctor(row, overlay) {
  const publicName = String(row.public_display_name || "").trim();
  const name = publicName || String(row.display_name || "").trim();
  const active = row.status === "active";
  const overlayHidden = overlay && overlay.visible === false;
  const websiteVisible = row.public_profile_enabled === true && !overlayHidden;
  // Public profile is incomplete until a dedicated public name and profile key exist.
  const needsProfile = !publicName || !row.public_profile_key;
  const image = overlay && overlay.image ? overlay.image : null;
  const title = String(row.public_title || "").trim();
  const specialty = String(row.job_title || "").trim();
  const splitBio = splitPublicBio(row.public_bio);
  return {
    id: row.id,
    kind: "doctor",
    name: name || `${row.first_name || ""} ${row.last_name || ""}`.trim() || "Staff member",
    subtitle: title || specialty || "Staff",
    title,
    specialty: specialty && specialty !== title ? specialty : specialty || "",
    qualifications: splitBio.qualifications,
    bio: splitBio.biography || row.public_bio || "",
    staffKey: row.public_profile_key || "",
    operationallyAvailable: active,
    websiteVisible,
    overlayHidden: Boolean(overlayHidden),
    featured: Boolean(overlay && overlay.featured),
    needsProfile,
    inactive: !active,
    canShow: active && !needsProfile,
    canHide: websiteVisible,
    canFeature: websiteVisible,
    publicProfileEnabled: row.public_profile_enabled === true,
    hasLogin: Boolean(row.platform_identity_id),
    image: image
      ? {
          mediaId: image.mediaId || "",
          src: image.src || "",
          alt: image.alt || "",
        }
      : { mediaId: "", src: "", alt: "" },
    editHref: `/app/settings/website/catalogue/doctors/${row.id}/edit`,
    overlayId: overlay && overlay.stored ? overlay.id : "",
  };
}

function presentService(row, overlay) {
  const overlayHidden = overlay && overlay.visible === false;
  const websiteVisible = row.public_website_visible === true && !overlayHidden;
  const active = row.status === "active";
  const image = overlay && overlay.image ? overlay.image : null;
  const publicSummary = row.public_summary || "";
  return {
    id: row.id,
    kind: "service",
    name: row.display_name,
    subtitle: publicSummary || row.description || "Consultation",
    description: row.description || "",
    category: publicSummary,
    publicSummary,
    serviceKey: row.service_key,
    defaultDurationMinutes: row.default_duration_minutes || 30,
    operationallyAvailable: active,
    websiteVisible,
    overlayHidden: Boolean(overlayHidden),
    featured: Boolean(overlay && overlay.featured),
    bookable: row.public_bookable === true,
    needsProfile: false,
    inactive: !active,
    canShow: active,
    canHide: websiteVisible,
    canFeature: websiteVisible,
    publicWebsiteVisible: row.public_website_visible === true,
    image: image
      ? {
          mediaId: image.mediaId || "",
          src: image.src || "",
          alt: image.alt || "",
        }
      : { mediaId: "", src: "", alt: "" },
    editHref: `/app/settings/website/catalogue/services/${row.id}/edit`,
    overlayId: overlay && overlay.stored ? overlay.id : "",
  };
}

async function loadCatalogue(db, input) {
  const edit = hasWebsitePermission(granted(input), PERMISSIONS.VIEW) ||
    hasWebsitePermission(granted(input), PERMISSIONS.EDIT);
  if (!edit) return { ok: false, code: RESULT.FORBIDDEN };
  const loaded = await libraryService.loadLibrary(db, input);
  if (!loaded.ok) return loaded;
  const [staffRows, serviceRows] = await Promise.all([
    listCatalogueStaff(db, input),
    listCatalogueServices(db, input),
  ]);
  const doctors = staffRows.map((row) =>
    presentDoctor(row, overlayFor(loaded.items, "doctor", row.public_profile_key))
  );
  const services = serviceRows.map((row) =>
    presentService(row, overlayFor(loaded.items, "service", row.service_key))
  );
  return {
    ok: true,
    doctors,
    services,
    canEdit: hasWebsitePermission(granted(input), PERMISSIONS.EDIT),
    emptyDoctors: doctors.length === 0,
    emptyServices: services.length === 0,
  };
}

async function loadStaffRow(db, input, staffId) {
  const result = await db.query(
    `SELECT s.id, s.status, s.display_name, s.first_name, s.last_name, s.job_title,
            s.public_display_name, s.public_title, s.public_bio, s.public_profile_key,
            s.public_profile_enabled, s.organization_id, s.healthcare_organization_id,
            s.platform_identity_id
       FROM activeclinic.staff_members s
      WHERE s.id = $1
        AND s.organization_id = $2
        AND s.healthcare_organization_id = $3
      LIMIT 1`,
    [staffId, input.organizationId, input.healthcareOrganizationId]
  );
  return result.rows[0] || null;
}

async function loadServiceRow(db, input, serviceId) {
  const result = await db.query(
    `SELECT ast.id, ast.service_key, ast.display_name, ast.description, ast.public_summary, ast.status,
            ast.public_bookable, ast.public_website_visible, ast.default_duration_minutes,
            ast.organization_id, ast.healthcare_organization_id
       FROM activeclinic.appointment_service_types ast
      WHERE ast.id = $1
        AND ast.organization_id = $2
        AND ast.healthcare_organization_id = $3
      LIMIT 1`,
    [serviceId, input.organizationId, input.healthcareOrganizationId]
  );
  return result.rows[0] || null;
}

async function setDoctorWebsiteVisibility(db, input) {
  const allowed = requireEdit(input);
  if (!allowed.ok) return allowed;
  const staffId = String((input && input.staffId) || "");
  const show = boolValue(input && input.visible, false) === true;
  if (!UUID_RE.test(staffId)) return { ok: false, code: RESULT.INVALID_INPUT };
  const row = await loadStaffRow(db, input, staffId);
  if (!row) return { ok: false, code: RESULT.NOT_FOUND };
  const name = String(row.public_display_name || row.display_name || "").trim();
  if (show) {
    if (row.status !== "active") return { ok: false, code: RESULT.INACTIVE };
    if (!name) return { ok: false, code: RESULT.NEEDS_PROFILE };
    const profileKey =
      row.public_profile_key ||
      (await uniqueProfileKey(db, row.healthcare_organization_id, row.id, name));
    await db.query(
      `UPDATE activeclinic.staff_members
          SET public_profile_enabled = true,
              public_profile_key = $3,
              public_display_name = COALESCE(public_display_name, $4),
              updated_at = now()
        WHERE id = $1 AND organization_id = $2`,
      [row.id, input.organizationId, profileKey, name]
    );
    const overlay = await libraryService.upsertOperationalOverlay(
      db,
      sanitizeOverlayImageInput({
        ...input,
        type: "doctor",
        operationalKey: profileKey,
        title: name,
        summary: row.public_title || row.job_title || "",
        body: row.public_bio || "",
        visible: true,
      })
    );
    if (!overlay.ok) return overlay;
    return { ok: true, staffId: row.id, staffKey: profileKey, visible: true };
  }
  const key = row.public_profile_key;
  if (!key) return { ok: true, staffId: row.id, visible: false };
  const overlay = await libraryService.upsertOperationalOverlay(
    db,
    sanitizeOverlayImageInput({
      ...input,
      type: "doctor",
      operationalKey: key,
      title: name || row.display_name,
      summary: row.public_title || row.job_title || "",
      body: row.public_bio || "",
      visible: false,
    })
  );
  if (!overlay.ok) return overlay;
  return { ok: true, staffId: row.id, staffKey: key, visible: false };
}

async function setServiceWebsiteVisibility(db, input) {
  const allowed = requireEdit(input);
  if (!allowed.ok) return allowed;
  const serviceId = String((input && input.serviceId) || "");
  const show = boolValue(input && input.visible, false) === true;
  if (!UUID_RE.test(serviceId)) return { ok: false, code: RESULT.INVALID_INPUT };
  const row = await loadServiceRow(db, input, serviceId);
  if (!row) return { ok: false, code: RESULT.NOT_FOUND };
  if (show && row.status !== "active") return { ok: false, code: RESULT.INACTIVE };
  await db.query(
    `UPDATE activeclinic.appointment_service_types
        SET public_website_visible = $4,
            updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND healthcare_organization_id = $3`,
    [row.id, input.organizationId, input.healthcareOrganizationId, show]
  );
  const overlay = await libraryService.upsertOperationalOverlay(
    db,
    sanitizeOverlayImageInput({
      ...input,
      type: "service",
      operationalKey: row.service_key,
      title: row.display_name,
      summary: row.public_summary || "",
      visible: show,
    })
  );
  if (!overlay.ok) return overlay;
  return {
    ok: true,
    serviceId: row.id,
    serviceKey: row.service_key,
    visible: show,
    bookable: row.public_bookable === true,
  };
}

async function uniqueServiceKey(db, input, preferred) {
  let candidate = serviceKeyFromName(preferred);
  if (!SERVICE_KEY_RE.test(candidate)) candidate = "service";
  for (let i = 0; i < 16; i += 1) {
    const key = i === 0 ? candidate : `${candidate.slice(0, 40)}-${i + 1}`;
    const existing = await db.query(
      `SELECT id FROM activeclinic.appointment_service_types
        WHERE organization_id = $1
          AND healthcare_organization_id = $2
          AND service_key = $3
        LIMIT 1`,
      [input.organizationId, input.healthcareOrganizationId, key]
    );
    if (!existing.rows.length) return key;
  }
  return `${candidate.slice(0, 32)}-${Date.now().toString(36)}`;
}

async function getCatalogueService(db, input) {
  const allowed = requireEdit(input);
  if (!allowed.ok) {
    const viewOk =
      hasWebsitePermission(granted(input), PERMISSIONS.VIEW) ||
      hasWebsitePermission(granted(input), PERMISSIONS.EDIT);
    if (!viewOk) return { ok: false, code: RESULT.FORBIDDEN };
  }
  const serviceId = String((input && input.serviceId) || "");
  if (!UUID_RE.test(serviceId)) return { ok: false, code: RESULT.INVALID_INPUT };
  const row = await loadServiceRow(db, input, serviceId);
  if (!row) return { ok: false, code: RESULT.NOT_FOUND };
  const loaded = await libraryService.loadLibrary(db, input);
  if (!loaded.ok) return loaded;
  return {
    ok: true,
    service: presentService(row, overlayFor(loaded.items, "service", row.service_key)),
    canEdit: hasWebsitePermission(granted(input), PERMISSIONS.EDIT),
  };
}

async function createCatalogueService(db, input) {
  const allowed = requireEdit(input);
  if (!allowed.ok) return allowed;

  const displayName = String((input && input.displayName) || "").trim();
  if (!displayName) return { ok: false, code: RESULT.INVALID_INPUT };

  const description =
    input && Object.prototype.hasOwnProperty.call(input, "description")
      ? clampText(input.description, SERVICE_DESCRIPTION_MAX)
      : null;
  if (
    input &&
    Object.prototype.hasOwnProperty.call(input, "description") &&
    String(input.description || "").trim() &&
    !description
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const { publicSummary: categoryOrSummary } = resolveServiceCategoryAndSummary(input, null);
  const publicSummary = categoryOrSummary || description;
  const duration = Number(input && input.defaultDurationMinutes);
  const defaultDurationMinutes =
    Number.isFinite(duration) && duration >= 5 && duration <= 480 ? Math.round(duration) : 30;
  const status = String((input && input.status) || "active").trim() === "inactive" ? "inactive" : "active";
  // Draft-safe: do not publish to the public website unless the editor explicitly opts in.
  const publicWebsiteVisible = boolValue(input && input.publicWebsiteVisible, false) === true;
  const publicBookable = boolValue(input && input.publicBookable, false) === true;
  // Normalize optional keys the same way as auto-generated ones so HTML5 / pasted
  // values with spaces or underscores do not silently block service creation.
  const requestedRaw = String((input && input.serviceKey) || "").trim();
  const requestedKey = requestedRaw ? serviceKeyFromName(requestedRaw) : "";
  if (requestedRaw && !SERVICE_KEY_RE.test(requestedKey)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const serviceKey = requestedKey
    ? requestedKey
    : await uniqueServiceKey(db, input, displayName);
  if (!serviceKey) return { ok: false, code: RESULT.INVALID_INPUT };

  if (requestedKey) {
    const clash = await db.query(
      `SELECT id FROM activeclinic.appointment_service_types
        WHERE organization_id = $1 AND healthcare_organization_id = $2 AND service_key = $3
        LIMIT 1`,
      [input.organizationId, input.healthcareOrganizationId, serviceKey]
    );
    if (clash.rows.length) return { ok: false, code: RESULT.CONFLICT };
  }

  let row;
  try {
    row = await appointmentRepo.insertServiceType(db, {
      organizationId: input.organizationId,
      healthcareOrganizationId: input.healthcareOrganizationId,
      serviceKey,
      displayName,
      description,
      defaultDurationMinutes,
      requiresAssignedStaff: false,
      status,
      publicSummary,
      publicBookable,
      publicWebsiteVisible: publicWebsiteVisible && status === "active",
    });
  } catch (err) {
    if (err && (err.code === "23505" || /unique/i.test(String(err.message || "")))) {
      return { ok: false, code: RESULT.CONFLICT };
    }
    if (err && (err.code === "23514" || /check/i.test(String(err.message || "")))) {
      return { ok: false, code: RESULT.INVALID_INPUT };
    }
    throw err;
  }

  const overlay = await libraryService.upsertOperationalOverlay(
    db,
    sanitizeOverlayImageInput({
      ...input,
      type: "service",
      operationalKey: row.service_key,
      title: row.display_name,
      summary: row.public_summary || "",
      visible: row.public_website_visible === true,
    })
  );
  if (!overlay.ok) return overlay;

  return {
    ok: true,
    serviceId: row.id,
    serviceKey: row.service_key,
    service: presentService(row, null),
  };
}

async function updateCatalogueService(db, input) {
  const allowed = requireEdit(input);
  if (!allowed.ok) return allowed;

  const serviceId = String((input && input.serviceId) || "");
  if (!UUID_RE.test(serviceId)) return { ok: false, code: RESULT.INVALID_INPUT };
  const existing = await loadServiceRow(db, input, serviceId);
  if (!existing) return { ok: false, code: RESULT.NOT_FOUND };

  const displayName = String((input && input.displayName) || "").trim();
  if (!displayName) return { ok: false, code: RESULT.INVALID_INPUT };

  const duration = Number(input && input.defaultDurationMinutes);
  const defaultDurationMinutes =
    Number.isFinite(duration) && duration >= 5 && duration <= 480
      ? Math.round(duration)
      : existing.default_duration_minutes || 30;
  const status = String((input && input.status) || existing.status || "active").trim();
  if (status !== "active" && status !== "inactive") {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const publicWebsiteVisible = boolValue(
    input && input.publicWebsiteVisible,
    existing.public_website_visible === true
  );
  const publicBookable = boolValue(input && input.publicBookable, existing.public_bookable === true);

  const patch = {
    id: existing.id,
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    displayName,
    defaultDurationMinutes,
    status,
    publicBookable,
    publicWebsiteVisible: publicWebsiteVisible && status === "active",
  };
  if (Object.prototype.hasOwnProperty.call(input, "description")) {
    patch.description = clampText(input.description, SERVICE_DESCRIPTION_MAX);
  }
  if (
    Object.prototype.hasOwnProperty.call(input, "publicSummary") ||
    Object.prototype.hasOwnProperty.call(input, "category")
  ) {
    const resolved = resolveServiceCategoryAndSummary(input, existing);
    patch.publicSummary = resolved.publicSummary;
  }

  const row = await appointmentRepo.updateServiceType(db, patch);
  if (!row) return { ok: false, code: RESULT.NOT_FOUND };

  const overlay = await libraryService.upsertOperationalOverlay(
    db,
    sanitizeOverlayImageInput({
      ...input,
      type: "service",
      operationalKey: row.service_key,
      title: row.display_name,
      summary: row.public_summary || "",
      visible: row.public_website_visible === true,
    })
  );
  if (!overlay.ok) return overlay;

  return {
    ok: true,
    serviceId: row.id,
    serviceKey: row.service_key,
    service: presentService(row, null),
  };
}

async function syncDoctorOverlay(db, input, row, opts) {
  const key = row.public_profile_key;
  if (!key) return { ok: true };
  const overlayInput = sanitizeOverlayImageInput({
    ...input,
    type: "doctor",
    operationalKey: key,
    title: row.public_display_name || row.display_name,
    summary: row.public_title || row.job_title || "",
    body: row.public_bio || "",
    visible: opts && opts.visible != null ? opts.visible : row.public_profile_enabled === true,
    imageMediaId: opts && opts.imageMediaId,
    imageSrc: opts && opts.imageSrc,
    imageAlt: opts && opts.imageAlt,
  });
  if (opts && opts.clearImage === true) {
    overlayInput.imageMediaId = "";
    overlayInput.imageSrc = "";
    overlayInput.imageAlt = "";
  }
  if (opts && opts.featured != null) overlayInput.featured = opts.featured;
  return libraryService.upsertOperationalOverlay(db, overlayInput);
}

async function applyPublicProfileFields(db, input, staffId, fields) {
  const result = await db.query(
    `UPDATE activeclinic.staff_members
        SET public_display_name = $4,
            public_title = $5,
            public_bio = $6,
            public_profile_key = $7,
            public_profile_enabled = $8,
            job_title = COALESCE($9, job_title),
            display_name = COALESCE($10, display_name),
            status = COALESCE($11, status),
            updated_at = now()
      WHERE id = $1
        AND organization_id = $2
        AND healthcare_organization_id = $3
      RETURNING id, status, display_name, first_name, last_name, job_title,
                public_display_name, public_title, public_bio, public_profile_key,
                public_profile_enabled, organization_id, healthcare_organization_id,
                platform_identity_id`,
    [
      staffId,
      input.organizationId,
      input.healthcareOrganizationId,
      fields.publicDisplayName,
      fields.publicTitle,
      fields.publicBio,
      fields.publicProfileKey,
      fields.publicProfileEnabled === true,
      fields.jobTitle || null,
      fields.displayName || null,
      fields.status || null,
    ]
  );
  return result.rows[0] || null;
}

async function getCatalogueDoctor(db, input) {
  const view =
    hasWebsitePermission(granted(input), PERMISSIONS.VIEW) ||
    hasWebsitePermission(granted(input), PERMISSIONS.EDIT);
  if (!view) return { ok: false, code: RESULT.FORBIDDEN };
  const staffId = String((input && input.staffId) || "");
  if (!UUID_RE.test(staffId)) return { ok: false, code: RESULT.INVALID_INPUT };
  const row = await loadStaffRow(db, input, staffId);
  if (!row || row.status === "archived") return { ok: false, code: RESULT.NOT_FOUND };
  const loaded = await libraryService.loadLibrary(db, input);
  if (!loaded.ok) return loaded;
  const overlay = overlayFor(loaded.items, "doctor", row.public_profile_key);
  return {
    ok: true,
    doctor: presentDoctor(row, overlay),
    canEdit: hasWebsitePermission(granted(input), PERMISSIONS.EDIT),
  };
}

async function createCatalogueDoctor(db, input) {
  const allowed = requireEdit(input);
  if (!allowed.ok) return allowed;

  const existingStaffId = String((input && input.existingStaffId) || "").trim();
  if (UUID_RE.test(existingStaffId)) {
    // Publish/edit public profile on an existing clinician — never create a duplicate identity.
    return updateCatalogueDoctor(db, {
      ...input,
      staffId: existingStaffId,
    });
  }

  const publicDisplayName = String((input && input.publicDisplayName) || input.displayName || "").trim();
  if (!publicDisplayName || publicDisplayName.length > 200) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const titles = resolveDoctorTitleFields(input, null);
  const hasBio =
    Object.prototype.hasOwnProperty.call(input || {}, "publicBio") ||
    Object.prototype.hasOwnProperty.call(input || {}, "biography") ||
    Object.prototype.hasOwnProperty.call(input || {}, "bio") ||
    Object.prototype.hasOwnProperty.call(input || {}, "qualifications");
  const publicBio = hasBio
    ? composePublicBio(
        input.publicBio || input.biography || input.bio,
        input.qualifications
      )
    : null;
  const status = String((input && input.status) || "active").trim() === "inactive" ? "inactive" : "active";
  // Draft-safe: public profiles stay unpublished until the editor explicitly opts in.
  const publicWebsiteVisible = boolValue(input && input.publicWebsiteVisible, false) === true;
  const requestedRaw = String((input && (input.profileKey || input.staffKey || input.publicProfileKey)) || "").trim();
  const requestedKey = requestedRaw ? slugKey(requestedRaw) : "";
  if (requestedRaw && !PROFILE_KEY_RE.test(requestedKey)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const names = splitPublicName(publicDisplayName);
  const firstName = String((input && input.firstName) || names.firstName || "").trim().slice(0, 100);
  const lastName = String((input && input.lastName) || names.lastName || "").trim().slice(0, 100);
  if (!firstName || !lastName) return { ok: false, code: RESULT.INVALID_INPUT };

  // Never attach a platform identity — public profiles do not grant login.
  const created = await createStaffMember(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    firstName,
    lastName,
    displayName: publicDisplayName,
    jobTitle: titles.jobTitle || "Clinician",
    employmentType: "visiting",
    status,
    phone: syntheticPublicProfilePhone(),
    email: null,
  });
  if (!created.ok) {
    if (created.code === RESULT.FORBIDDEN || created.code === "activeclinic_product_not_enabled") {
      return { ok: false, code: RESULT.FORBIDDEN };
    }
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const staffId = created.staffMember.id;
  let profileKey = requestedKey || (await uniqueProfileKey(db, input.healthcareOrganizationId, staffId, publicDisplayName));
  if (requestedKey) {
    const clash = await db.query(
      `SELECT id FROM activeclinic.staff_members
        WHERE healthcare_organization_id = $1 AND public_profile_key = $2 AND id <> $3
        LIMIT 1`,
      [input.healthcareOrganizationId, profileKey, staffId]
    );
    if (clash.rows.length) {
      await db.query(
        `UPDATE activeclinic.staff_members SET status = 'archived', updated_at = now()
          WHERE id = $1 AND organization_id = $2`,
        [staffId, input.organizationId]
      );
      return { ok: false, code: RESULT.CONFLICT };
    }
  }

  const enabled = publicWebsiteVisible && status === "active";
  const row = await applyPublicProfileFields(db, input, staffId, {
    publicDisplayName,
    publicTitle: titles.publicTitle,
    publicBio,
    publicProfileKey: profileKey,
    publicProfileEnabled: enabled,
    jobTitle: titles.jobTitle || "Clinician",
    displayName: publicDisplayName,
    status,
  });
  if (!row) return { ok: false, code: RESULT.NOT_FOUND };

  const overlay = await syncDoctorOverlay(db, input, row, {
    visible: enabled,
    imageMediaId: input.imageMediaId,
    imageSrc: input.imageSrc,
    imageAlt: input.imageAlt,
  });
  if (!overlay.ok) return overlay;

  return {
    ok: true,
    staffId: row.id,
    staffKey: row.public_profile_key,
    doctor: presentDoctor(row, null),
  };
}

async function updateCatalogueDoctor(db, input) {
  const allowed = requireEdit(input);
  if (!allowed.ok) return allowed;

  const staffId = String((input && input.staffId) || "");
  if (!UUID_RE.test(staffId)) return { ok: false, code: RESULT.INVALID_INPUT };
  const existing = await loadStaffRow(db, input, staffId);
  if (!existing || existing.status === "archived") return { ok: false, code: RESULT.NOT_FOUND };

  const publicDisplayName = String(
    (input && input.publicDisplayName) || input.displayName || existing.public_display_name || existing.display_name || ""
  ).trim();
  if (!publicDisplayName || publicDisplayName.length > 200) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const titles = resolveDoctorTitleFields(input, existing);
  const hasBio =
    Object.prototype.hasOwnProperty.call(input || {}, "publicBio") ||
    Object.prototype.hasOwnProperty.call(input || {}, "biography") ||
    Object.prototype.hasOwnProperty.call(input || {}, "bio") ||
    Object.prototype.hasOwnProperty.call(input || {}, "qualifications");
  const existingSplit = splitPublicBio(existing.public_bio);
  const publicBio = hasBio
    ? composePublicBio(
        Object.prototype.hasOwnProperty.call(input || {}, "biography") ||
          Object.prototype.hasOwnProperty.call(input || {}, "publicBio") ||
          Object.prototype.hasOwnProperty.call(input || {}, "bio")
          ? input.publicBio || input.biography || input.bio
          : existingSplit.biography,
        Object.prototype.hasOwnProperty.call(input || {}, "qualifications")
          ? input.qualifications
          : existingSplit.qualifications
      )
    : existing.public_bio;
  const statusRaw = String((input && input.status) || existing.status || "active").trim();
  const status = statusRaw === "inactive" ? "inactive" : statusRaw === "active" ? "active" : existing.status;
  if (status !== "active" && status !== "inactive") {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const publicWebsiteVisible = boolValue(
    input && input.publicWebsiteVisible,
    existing.public_profile_enabled === true
  );
  const enabled = publicWebsiteVisible === true && status === "active";
  const profileKey =
    existing.public_profile_key ||
    (await uniqueProfileKey(db, existing.healthcare_organization_id, existing.id, publicDisplayName));

  const row = await applyPublicProfileFields(db, input, staffId, {
    publicDisplayName,
    publicTitle: titles.publicTitle,
    publicBio,
    publicProfileKey: profileKey,
    publicProfileEnabled: enabled,
    jobTitle: titles.jobTitle || existing.job_title,
    // Keep operational display_name for login staff; only refresh for public-only rows.
    displayName: existing.platform_identity_id ? existing.display_name : publicDisplayName,
    status,
  });
  if (!row) return { ok: false, code: RESULT.NOT_FOUND };

  const overlay = await syncDoctorOverlay(db, input, row, {
    visible: enabled,
    imageMediaId: input.imageMediaId,
    imageSrc: input.imageSrc,
    imageAlt: input.imageAlt,
  });
  if (!overlay.ok) return overlay;

  return {
    ok: true,
    staffId: row.id,
    staffKey: row.public_profile_key,
    doctor: presentDoctor(row, null),
  };
}

async function deleteCatalogueDoctor(db, input) {
  const allowed = requireEdit(input);
  if (!allowed.ok) return allowed;

  const staffId = String((input && input.staffId) || "");
  if (!UUID_RE.test(staffId)) return { ok: false, code: RESULT.INVALID_INPUT };
  const existing = await loadStaffRow(db, input, staffId);
  if (!existing || existing.status === "archived") return { ok: false, code: RESULT.NOT_FOUND };

  // Authenticated staff accounts stay; only clear/unpublish the public profile.
  if (existing.platform_identity_id) {
    const row = await applyPublicProfileFields(db, input, staffId, {
      publicDisplayName: existing.public_display_name || existing.display_name,
      publicTitle: existing.public_title,
      publicBio: existing.public_bio,
      publicProfileKey: existing.public_profile_key,
      publicProfileEnabled: false,
    });
    if (row && row.public_profile_key) {
      await syncDoctorOverlay(db, input, row, { visible: false });
    }
    return { ok: true, staffId, unpublished: true, archived: false };
  }

  if (existing.public_profile_key) {
    await syncDoctorOverlay(db, input, existing, { visible: false });
  }
  await db.query(
    `UPDATE activeclinic.staff_members
        SET status = 'archived',
            public_profile_enabled = false,
            updated_at = now()
      WHERE id = $1 AND organization_id = $2 AND healthcare_organization_id = $3`,
    [staffId, input.organizationId, input.healthcareOrganizationId]
  );
  return { ok: true, staffId, unpublished: true, archived: true };
}

async function setCatalogueFeatured(db, input) {
  const allowed = requireEdit(input);
  if (!allowed.ok) return allowed;
  const kind = String((input && input.kind) || "");
  const featured = boolValue(input && input.featured, false) === true;
  if (kind === "doctor") {
    const row = await loadStaffRow(db, input, String(input.staffId || ""));
    if (!row || !row.public_profile_key) return { ok: false, code: RESULT.NOT_FOUND };
    return libraryService.upsertOperationalOverlay(
      db,
      sanitizeOverlayImageInput({
        ...input,
        type: "doctor",
        operationalKey: row.public_profile_key,
        title: row.public_display_name || row.display_name,
        featured,
      })
    );
  }
  if (kind === "service") {
    const row = await loadServiceRow(db, input, String(input.serviceId || ""));
    if (!row) return { ok: false, code: RESULT.NOT_FOUND };
    return libraryService.upsertOperationalOverlay(
      db,
      sanitizeOverlayImageInput({
        ...input,
        type: "service",
        operationalKey: row.service_key,
        title: row.display_name,
        featured,
      })
    );
  }
  return { ok: false, code: RESULT.INVALID_INPUT };
}

module.exports = {
  RESULT,
  loadCatalogue,
  getCatalogueService,
  createCatalogueService,
  updateCatalogueService,
  getCatalogueDoctor,
  createCatalogueDoctor,
  updateCatalogueDoctor,
  deleteCatalogueDoctor,
  setDoctorWebsiteVisibility,
  setServiceWebsiteVisibility,
  setCatalogueFeatured,
};
