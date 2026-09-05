"use strict";

/**
 * Website Management public catalogue (doctors and services).
 * Toggles canonical public-profile / website-visible flags and CMS overlays.
 * Service create/edit writes the canonical appointment_service_types catalogue.
 */

const { PERMISSIONS, hasWebsitePermission } = require("../../platform/website/permissions");
const libraryService = require("./clinicWebsiteLibraryService");
const { LIBRARY_SOURCES, boolValue } = require("./clinicWebsiteCms");
const appointmentRepo = require("../repositories/appointmentRepository");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  INACTIVE: "inactive",
  NEEDS_PROFILE: "needs_profile",
  CONFLICT: "conflict",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERVICE_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function granted(input) {
  return Array.isArray(input && input.grantedPermissions) ? input.grantedPermissions : [];
}

function requireEdit(input) {
  if (!hasWebsitePermission(granted(input), PERMISSIONS.EDIT)) {
    return { ok: false, code: RESULT.FORBIDDEN };
  }
  return { ok: true };
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
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "service";
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
            s.public_profile_enabled
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

function presentDoctor(row, overlay) {
  const name = String(row.public_display_name || row.display_name || "").trim();
  const active = row.status === "active";
  const overlayHidden = overlay && overlay.visible === false;
  const websiteVisible = row.public_profile_enabled === true && !overlayHidden;
  const needsProfile = !name;
  return {
    id: row.id,
    kind: "doctor",
    name: name || `${row.first_name || ""} ${row.last_name || ""}`.trim() || "Staff member",
    subtitle: row.public_title || row.job_title || "Staff",
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
    editHref: overlay && overlay.stored ? `/app/settings/website/library/${overlay.id}` : "",
    overlayId: overlay && overlay.stored ? overlay.id : "",
  };
}

function presentService(row, overlay) {
  const overlayHidden = overlay && overlay.visible === false;
  const websiteVisible = row.public_website_visible === true && !overlayHidden;
  const active = row.status === "active";
  return {
    id: row.id,
    kind: "service",
    name: row.display_name,
    subtitle: row.public_summary || row.description || "Consultation",
    description: row.description || "",
    publicSummary: row.public_summary || "",
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
            s.public_profile_enabled, s.organization_id, s.healthcare_organization_id
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
    const overlay = await libraryService.upsertOperationalOverlay(db, {
      ...input,
      type: "doctor",
      operationalKey: profileKey,
      title: name,
      summary: row.public_title || row.job_title || "",
      body: row.public_bio || "",
      visible: true,
    });
    if (!overlay.ok) return overlay;
    return { ok: true, staffId: row.id, staffKey: profileKey, visible: true };
  }
  const key = row.public_profile_key;
  if (!key) return { ok: true, staffId: row.id, visible: false };
  const overlay = await libraryService.upsertOperationalOverlay(db, {
    ...input,
    type: "doctor",
    operationalKey: key,
    title: name || row.display_name,
    summary: row.public_title || row.job_title || "",
    body: row.public_bio || "",
    visible: false,
  });
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
  const overlay = await libraryService.upsertOperationalOverlay(db, {
    ...input,
    type: "service",
    operationalKey: row.service_key,
    title: row.display_name,
    summary: row.public_summary || "",
    visible: show,
  });
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
      ? String(input.description || "").trim() || null
      : null;
  const publicSummary =
    input && Object.prototype.hasOwnProperty.call(input, "publicSummary")
      ? String(input.publicSummary || "").trim() || null
      : description;
  const duration = Number(input && input.defaultDurationMinutes);
  const defaultDurationMinutes =
    Number.isFinite(duration) && duration >= 5 && duration <= 480 ? Math.round(duration) : 30;
  const status = String((input && input.status) || "active").trim() === "inactive" ? "inactive" : "active";
  const publicWebsiteVisible = boolValue(input && input.publicWebsiteVisible, true) === true;
  const publicBookable = boolValue(input && input.publicBookable, false) === true;
  const requestedKey = String((input && input.serviceKey) || "").trim().toLowerCase();
  const serviceKey = requestedKey
    ? SERVICE_KEY_RE.test(requestedKey)
      ? requestedKey
      : null
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
    throw err;
  }

  if (row.public_website_visible === true) {
    const overlay = await libraryService.upsertOperationalOverlay(db, {
      ...input,
      type: "service",
      operationalKey: row.service_key,
      title: row.display_name,
      summary: row.public_summary || "",
      visible: true,
    });
    if (!overlay.ok) return overlay;
  }

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
    patch.description = String(input.description || "").trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "publicSummary")) {
    patch.publicSummary = String(input.publicSummary || "").trim() || null;
  }

  const row = await appointmentRepo.updateServiceType(db, patch);
  if (!row) return { ok: false, code: RESULT.NOT_FOUND };

  const overlay = await libraryService.upsertOperationalOverlay(db, {
    ...input,
    type: "service",
    operationalKey: row.service_key,
    title: row.display_name,
    summary: row.public_summary || "",
    visible: row.public_website_visible === true,
  });
  if (!overlay.ok) return overlay;

  return {
    ok: true,
    serviceId: row.id,
    serviceKey: row.service_key,
    service: presentService(row, null),
  };
}

async function setCatalogueFeatured(db, input) {
  const allowed = requireEdit(input);
  if (!allowed.ok) return allowed;
  const kind = String((input && input.kind) || "");
  const featured = boolValue(input && input.featured, false) === true;
  if (kind === "doctor") {
    const row = await loadStaffRow(db, input, String(input.staffId || ""));
    if (!row || !row.public_profile_key) return { ok: false, code: RESULT.NOT_FOUND };
    return libraryService.upsertOperationalOverlay(db, {
      ...input,
      type: "doctor",
      operationalKey: row.public_profile_key,
      title: row.public_display_name || row.display_name,
      featured,
    });
  }
  if (kind === "service") {
    const row = await loadServiceRow(db, input, String(input.serviceId || ""));
    if (!row) return { ok: false, code: RESULT.NOT_FOUND };
    return libraryService.upsertOperationalOverlay(db, {
      ...input,
      type: "service",
      operationalKey: row.service_key,
      title: row.display_name,
      featured,
    });
  }
  return { ok: false, code: RESULT.INVALID_INPUT };
}

module.exports = {
  RESULT,
  loadCatalogue,
  getCatalogueService,
  createCatalogueService,
  updateCatalogueService,
  setDoctorWebsiteVisibility,
  setServiceWebsiteVisibility,
  setCatalogueFeatured,
};
