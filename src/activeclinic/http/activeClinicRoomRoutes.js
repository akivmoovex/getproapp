"use strict";

/**
 * ActiveClinic ACN27 Rooms & Spaces HTTP routes.
 * Canonical workspace: /app/rooms — does NOT own /app/facilities (B2-10).
 *
 * RBAC:
 *   view  → activeclinic.facility.view
 *   manage (create/edit) → activeclinic.facility.update
 */

const {
  issueCsrfToken,
  setCsrfCookie,
  validateCsrf,
  CSRF_FIELD,
} = require("../../platform/http/v5Csrf");
const {
  createRequireActiveClinicAuth,
} = require("./loadActiveClinicAuth");
const {
  createRequireActiveClinicPermission,
  renderSimpleState,
} = require("./activeClinicPermissionMiddleware");
const {
  buildActiveClinicShellViewModel,
} = require("../services/buildActiveClinicShellViewModel");
const {
  renderActiveClinicAppPage,
} = require("./renderActiveClinicShell");
const {
  createFacilityRoom,
  updateFacilityRoom,
  getFacilityRoom,
  listFacilityRooms,
  ROOM_TYPES,
  ROOM_TYPE_LABELS,
  STATUSES,
  STATUS_LABELS,
  RESULT,
} = require("../services/activeClinicFacilityRoomService");
const facilityRepo = require("../repositories/facilityRepository");
const departmentRepo = require("../repositories/departmentRepository");
const {
  getPlatformDeploymentCode,
} = require("../../platform/config/platformDeploymentCode");

const STITCH = Object.freeze({
  desktop: "b8f071b326234022afb3eecc665be9bc",
  mobile: "74a8167ce99e45388a7dd1fbe9a92a88",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorMessageForCode(code) {
  switch (code) {
    case RESULT.DUPLICATE_CODE:
      return "That room code is already used in this facility.";
    case RESULT.INVALID_CODE:
      return "Room code must start with a letter or number (max 64 characters).";
    case RESULT.INVALID_TYPE:
      return "Choose a valid room type.";
    case RESULT.INVALID_STATUS:
      return "Choose a valid status.";
    case RESULT.FACILITY_NOT_FOUND:
    case RESULT.FACILITY_MISMATCH:
      return "Facility was not found in this organization.";
    case RESULT.DEPARTMENT_NOT_FOUND:
      return "Department was not found in this organization.";
    case RESULT.DEPARTMENT_FACILITY_MISMATCH:
      return "Department must belong to the selected facility.";
    case RESULT.NOT_FOUND:
      return "Room was not found.";
    case RESULT.INVALID_INPUT:
      return "Check required fields and try again.";
    default:
      return "Unable to save room.";
  }
}

function authOrgId(auth) {
  return auth && auth.organization && auth.organization.id;
}

function actorFromAuth(auth) {
  return {
    platformIdentityId: auth && auth.platformIdentityId,
    userId: auth && auth.platformIdentityId,
  };
}

function parseRoomBody(body) {
  const b = body || {};
  return {
    facilityId: String(b.facility_id || b.facilityId || "").trim(),
    departmentId: String(b.department_id || b.departmentId || "").trim() || null,
    displayName: String(b.display_name || b.displayName || "").trim(),
    roomCode: String(b.room_code || b.roomCode || "").trim(),
    roomType: String(b.room_type || b.roomType || "").trim(),
    floorArea: String(b.floor_area || b.floorArea || "").trim(),
    description: String(b.description || "").trim(),
    status: String(b.status || "available").trim(),
  };
}

/**
 * @param {import('express').Express} app
 * @param {{ getPool: Function, env: NodeJS.ProcessEnv, isProduction: boolean }} deps
 */
function registerActiveClinicRoomRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction;
  const requireAuth = createRequireActiveClinicAuth({ env, isProduction });
  const requirePermission = createRequireActiveClinicPermission({
    getPool,
    env,
    isProduction,
  });

  function issuePageCsrf(res) {
    const token = issueCsrfToken(env);
    setCsrfCookie(res, token, { secure: isProduction, env });
    return token;
  }

  async function renderShell(req, res, options) {
    const csrfToken = issuePageCsrf(res);
    const shell = await buildActiveClinicShellViewModel(getPool(), {
      req,
      auth: req.activeClinicAuth,
      csrfToken,
      activeNav: options.activeNav || "rooms",
      pageHeader: options.pageHeader,
      breadcrumbs: options.breadcrumbs,
      flash: options.flash || null,
      pageData: Object.assign({}, options.pageData || {}, {
        csrfField: CSRF_FIELD,
      }),
    });
    if (shell.selectedFacility) {
      req.activeClinicAuth.selectedFacility = shell.selectedFacility;
    }
    const html = renderActiveClinicAppPage(options.content, shell);
    return res.status(options.status || 200).type("html").send(html);
  }

  async function loadFacilityOptions(auth) {
    const orgId = authOrgId(auth);
    const rows = await facilityRepo.listByOrganization(getPool(), {
      organizationId: orgId,
      status: "active",
    });
    return (rows || []).map((f) => ({
      value: f.id,
      label: f.display_name,
      key: f.facility_key,
    }));
  }

  async function loadDepartmentOptions(auth, facilityId) {
    if (!facilityId || !UUID_RE.test(facilityId)) return [];
    const rows = await departmentRepo.listDepartmentsByFacility(getPool(), {
      facilityId,
      organizationId: authOrgId(auth),
      status: "active",
    });
    return (rows || []).map((d) => ({
      value: d.id,
      label: d.display_name,
      key: d.department_key,
    }));
  }

  function typeOptions() {
    return ROOM_TYPES.map((t) => ({ value: t, label: ROOM_TYPE_LABELS[t] || t }));
  }

  function statusOptions() {
    return STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] || s }));
  }

  function canManage(auth) {
    const perms = (auth && auth.permissions) || [];
    return perms.includes("activeclinic.facility.update");
  }

  // —— List ——
  app.get(
    "/app/rooms",
    requireAuth,
    requirePermission("activeclinic.facility.view"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const orgId = authOrgId(auth);
        const q = req.query || {};
        let facilityId = String(q.facility || q.facility_id || "").trim();
        if (!facilityId && auth.selectedFacility && auth.selectedFacility.id) {
          facilityId = auth.selectedFacility.id;
        }

        const listed = await listFacilityRooms(getPool(), {
          organizationId: orgId,
          facilityId: facilityId || null,
          departmentId: String(q.department || "").trim() || null,
          status: String(q.status || "").trim() || null,
          roomType: String(q.type || q.room_type || "").trim() || null,
          q: String(q.q || "").trim() || null,
        });

        if (!listed.ok) {
          return res.status(400).type("html").send(
            renderSimpleState("Rooms unavailable", errorMessageForCode(listed.code), {
              status: 400,
              linkHref: "/app",
              linkLabel: "Back to dashboard",
            })
          );
        }

        const facilities = await loadFacilityOptions(auth);
        const departments = await loadDepartmentOptions(auth, facilityId);
        const manage = canManage(auth);
        const facilityLabel =
          (facilities.find((f) => f.value === facilityId) || {}).label ||
          (auth.selectedFacility && auth.selectedFacility.displayName) ||
          "Facility";

        return await renderShell(req, res, {
          activeNav: "rooms",
          content: "app/rooms-list-content.ejs",
          pageHeader: {
            title: "Rooms & Spaces",
            description: `Physical care spaces within ${facilityLabel}.`,
            actions: manage
              ? [
                  {
                    label: "Add Room",
                    href: facilityId
                      ? `/app/rooms/new?facility=${encodeURIComponent(facilityId)}`
                      : "/app/rooms/new",
                  },
                  { label: "Facilities", href: "/app/facilities", ghost: true },
                ]
              : [{ label: "Facilities", href: "/app/facilities", ghost: true }],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Rooms & Spaces" },
          ],
          pageData: {
            catalogue: {
              rooms: listed.rooms,
              metrics: listed.metrics,
              filters: {
                q: String(q.q || "").trim(),
                facility: facilityId || "",
                department: String(q.department || "").trim(),
                status: String(q.status || "").trim(),
                type: String(q.type || q.room_type || "").trim(),
              },
              filterOptions: {
                facilities,
                departments,
                types: typeOptions(),
                statuses: statusOptions(),
              },
              canManage: manage,
              stitch: STITCH,
              facilityLabel,
            },
          },
          flash:
            req.query && req.query.ok === "1"
              ? { type: "success", message: "Room saved." }
              : null,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // —— New ——
  app.get(
    "/app/rooms/new",
    requireAuth,
    requirePermission("activeclinic.facility.update"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        let facilityId = String((req.query && req.query.facility) || "").trim();
        if (!facilityId && auth.selectedFacility && auth.selectedFacility.id) {
          facilityId = auth.selectedFacility.id;
        }
        const facilities = await loadFacilityOptions(auth);
        const departments = await loadDepartmentOptions(auth, facilityId);
        return await renderShell(req, res, {
          activeNav: "rooms",
          content: "app/room-form-content.ejs",
          pageHeader: {
            title: "Add Room",
            description: "Create a physical room or space inside a facility.",
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Rooms & Spaces", href: "/app/rooms" },
            { label: "Add" },
          ],
          pageData: {
            mode: "create",
            form: {
              facilityId,
              departmentId: "",
              displayName: "",
              roomCode: "",
              roomType: "consultation",
              floorArea: "",
              description: "",
              status: "available",
            },
            facilities,
            departments,
            typeOptions: typeOptions(),
            statusOptions: statusOptions(),
            stitch: STITCH,
            error: null,
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/rooms",
    requireAuth,
    requirePermission("activeclinic.facility.update"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const auth = req.activeClinicAuth;
        const form = parseRoomBody(req.body);
        const deployment = getPlatformDeploymentCode(env);
        const created = await createFacilityRoom(getPool(), {
          organizationId: authOrgId(auth),
          facilityId: form.facilityId,
          departmentId: form.departmentId,
          displayName: form.displayName,
          roomCode: form.roomCode,
          roomType: form.roomType,
          floorArea: form.floorArea,
          description: form.description,
          status: form.status,
          actor: actorFromAuth(auth),
          deploymentCode: deployment && deployment.code,
        });
        if (!created.ok) {
          const facilities = await loadFacilityOptions(auth);
          const departments = await loadDepartmentOptions(auth, form.facilityId);
          return await renderShell(req, res, {
            status: 400,
            activeNav: "rooms",
            content: "app/room-form-content.ejs",
            pageHeader: { title: "Add Room" },
            breadcrumbs: [
              { label: "Home", href: "/app" },
              { label: "Rooms & Spaces", href: "/app/rooms" },
              { label: "Add" },
            ],
            pageData: {
              mode: "create",
              form,
              facilities,
              departments,
              typeOptions: typeOptions(),
              statusOptions: statusOptions(),
              stitch: STITCH,
              error: errorMessageForCode(created.code),
            },
          });
        }
        return res.redirect(
          303,
          `/app/rooms/${encodeURIComponent(created.room.id)}?ok=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  // —— Detail ——
  app.get(
    "/app/rooms/:roomId",
    requireAuth,
    requirePermission("activeclinic.facility.view"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const loaded = await getFacilityRoom(getPool(), {
          organizationId: authOrgId(auth),
          roomId: req.params.roomId,
        });
        if (!loaded.ok) {
          return res.status(404).type("html").send(
            renderSimpleState("Room not found", errorMessageForCode(loaded.code), {
              status: 404,
              linkHref: "/app/rooms",
              linkLabel: "Back to rooms",
            })
          );
        }
        const manage = canManage(auth);
        return await renderShell(req, res, {
          activeNav: "rooms",
          content: "app/room-detail-content.ejs",
          pageHeader: {
            title: loaded.room.displayName,
            description: `${loaded.room.roomCode} · ${loaded.room.facilityDisplayName || "Facility"}`,
            actions: manage
              ? [
                  {
                    label: "Edit",
                    href: `/app/rooms/${encodeURIComponent(loaded.room.id)}/edit`,
                  },
                  { label: "All rooms", href: "/app/rooms", ghost: true },
                ]
              : [{ label: "All rooms", href: "/app/rooms", ghost: true }],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Rooms & Spaces", href: "/app/rooms" },
            { label: loaded.room.displayName },
          ],
          pageData: {
            room: loaded.room,
            canManage: manage,
            stitch: STITCH,
          },
          flash:
            req.query && req.query.ok === "1"
              ? { type: "success", message: "Room saved." }
              : null,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // —— Edit ——
  app.get(
    "/app/rooms/:roomId/edit",
    requireAuth,
    requirePermission("activeclinic.facility.update"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const loaded = await getFacilityRoom(getPool(), {
          organizationId: authOrgId(auth),
          roomId: req.params.roomId,
        });
        if (!loaded.ok) {
          return res.status(404).type("html").send(
            renderSimpleState("Room not found", errorMessageForCode(loaded.code), {
              status: 404,
              linkHref: "/app/rooms",
              linkLabel: "Back to rooms",
            })
          );
        }
        const room = loaded.room;
        const facilities = await loadFacilityOptions(auth);
        const departments = await loadDepartmentOptions(auth, room.facilityId);
        return await renderShell(req, res, {
          activeNav: "rooms",
          content: "app/room-form-content.ejs",
          pageHeader: {
            title: "Edit Room",
            description: room.displayName,
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Rooms & Spaces", href: "/app/rooms" },
            {
              label: room.displayName,
              href: `/app/rooms/${encodeURIComponent(room.id)}`,
            },
            { label: "Edit" },
          ],
          pageData: {
            mode: "edit",
            roomId: room.id,
            form: {
              facilityId: room.facilityId,
              departmentId: room.departmentId || "",
              displayName: room.displayName,
              roomCode: room.roomCode,
              roomType: room.roomType,
              floorArea: room.floorArea || "",
              description: room.description || "",
              status: room.status,
            },
            facilities,
            departments,
            typeOptions: typeOptions(),
            statusOptions: statusOptions(),
            stitch: STITCH,
            error: null,
            facilityLocked: true,
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/rooms/:roomId",
    requireAuth,
    requirePermission("activeclinic.facility.update"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const auth = req.activeClinicAuth;
        const form = parseRoomBody(req.body);
        const deployment = getPlatformDeploymentCode(env);
        const updated = await updateFacilityRoom(getPool(), {
          organizationId: authOrgId(auth),
          roomId: req.params.roomId,
          departmentId: form.departmentId,
          displayName: form.displayName,
          roomCode: form.roomCode,
          roomType: form.roomType,
          floorArea: form.floorArea,
          description: form.description,
          status: form.status,
          actor: actorFromAuth(auth),
          deploymentCode: deployment && deployment.code,
        });
        if (!updated.ok) {
          const facilities = await loadFacilityOptions(auth);
          const departments = await loadDepartmentOptions(auth, form.facilityId);
          return await renderShell(req, res, {
            status: 400,
            activeNav: "rooms",
            content: "app/room-form-content.ejs",
            pageHeader: { title: "Edit Room" },
            breadcrumbs: [
              { label: "Home", href: "/app" },
              { label: "Rooms & Spaces", href: "/app/rooms" },
              { label: "Edit" },
            ],
            pageData: {
              mode: "edit",
              roomId: req.params.roomId,
              form,
              facilities,
              departments,
              typeOptions: typeOptions(),
              statusOptions: statusOptions(),
              stitch: STITCH,
              error: errorMessageForCode(updated.code),
              facilityLocked: true,
            },
          });
        }
        return res.redirect(
          303,
          `/app/rooms/${encodeURIComponent(updated.room.id)}?ok=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicRoomRoutes,
  STITCH,
};
