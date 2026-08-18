"use strict";

/**
 * ActiveClinic staff directory + create/edit routes (AC-V6-S04 / S05).
 * Stitch staff screens are STITCH_GAP / VISUAL_BLOCKED.
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
  loadActiveClinicStaffListScreen,
  loadActiveClinicStaffDetailScreen,
} = require("../services/loadActiveClinicStaffScreens");
const {
  loadActiveClinicCreateStaffScreen,
  loadActiveClinicEditStaffScreen,
  parseStaffFormBody,
  validateStaffFormValues,
  buildInviteRoleAssignments,
  orderFacilityIds,
} = require("../services/loadActiveClinicStaffFormScreens");
const {
  inviteActiveClinicStaff,
  RESULT: INVITE_RESULT,
} = require("../services/activeClinicStaffInvitationService");
const {
  updateStaffMemberProfile,
  createStaffMember,
  RESULT: STAFF_RESULT,
} = require("../services/activeClinicStaffService");
const {
  assignStaffToFacility,
  listFacilitiesForStaff,
  removeStaffFromFacility,
  setPrimaryFacilityForStaff,
} = require("../services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
} = require("../services/activeClinicAuthorizationService");
const {
  canGrantRole,
} = require("../services/activeClinicAccessManagementService");
const {
  summarizePermissionsForRoleKeys,
} = require("../services/activeClinicInviteAccessReview");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");

const DELIVERY_LABELS = Object.freeze({
  link_generated: "Link generated — automated email/SMS is not configured.",
  sent: "Invitation email recorded as sent. Keep the copyable link below.",
  queued: "Invitation email accepted for processing. Keep the copyable link below.",
  failed: "Invitation email failed — use the link below.",
  unavailable: "Email delivery is unavailable — use the link below.",
  not_requested: "Invitation not requested.",
});

function inviteErrorMessage(code) {
  switch (code) {
    case INVITE_RESULT.AMBIGUOUS_IDENTITY:
      return "That contact matches more than one login identity. Resolve the conflict before inviting.";
    case INVITE_RESULT.IDENTITY_DISABLED:
      return "The matching login identity is disabled.";
    case INVITE_RESULT.IDENTITY_CONFLICT:
    case INVITE_RESULT.LINK_CONFLICT:
      return "Unable to link a login identity for this staff profile.";
    case INVITE_RESULT.FACILITY_ASSIGNMENT_FAILED:
      return "One or more facility assignments could not be saved.";
    case INVITE_RESULT.ROLE_ASSIGNMENT_FAILED:
      return "The initial role could not be assigned.";
    case INVITE_RESULT.GRANT_DENIED:
      return "You are not allowed to grant one or more of the selected roles.";
    case INVITE_RESULT.PRODUCT_NOT_ENABLED:
      return "ActiveClinic is not enabled for this organization.";
    case STAFF_RESULT.INVALID_INPUT:
    case INVITE_RESULT.INVALID_INPUT:
      return "Check required fields, phone, and email.";
    default:
      return "Unable to create staff invitation.";
  }
}

/**
 * @param {import('express').Express} app
 * @param {{ getPool: Function, env: NodeJS.ProcessEnv, isProduction: boolean }} deps
 */
function registerActiveClinicStaffRoutes(app, deps) {
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
      activeNav: options.activeNav,
      pageHeader: options.pageHeader,
      breadcrumbs: options.breadcrumbs,
      flash: options.flash || null,
      pageData: options.pageData || {},
    });
    if (shell.selectedFacility) {
      req.activeClinicAuth.selectedFacility = shell.selectedFacility;
    }
    const html = renderActiveClinicAppPage(options.content, shell);
    return res.status(options.status || 200).type("html").send(html);
  }

  async function syncFacilityAssignments(auth, staffMemberId, values) {
    const organizationId = auth.organization.id;
    const desired = new Set(values.facilityIds.map(String));
    const listed = await listFacilitiesForStaff(getPool(), {
      staffMemberId,
      organizationId,
    });
    const active = (listed.assignments || []).filter((a) => a.status === "active");
    const current = new Set(active.map((a) => String(a.facilityId)));

    for (const facilityId of desired) {
      if (!current.has(facilityId)) {
        const assigned = await assignStaffToFacility(getPool(), {
          organizationId,
          staffMemberId,
          facilityId,
          isPrimary: false,
          deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!assigned.ok) return assigned;
      }
    }
    for (const facilityId of current) {
      if (!desired.has(facilityId)) {
        const removed = await removeStaffFromFacility(getPool(), {
          organizationId,
          staffMemberId,
          facilityId,
          deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!removed.ok) return removed;
      }
    }
    const primary = values.primaryFacilityId || values.facilityIds[0];
    if (primary && desired.has(String(primary))) {
      const setPrimary = await setPrimaryFacilityForStaff(getPool(), {
        organizationId,
        staffMemberId,
        facilityId: primary,
        deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      });
      if (!setPrimary.ok) return setPrimary;
    }
    return { ok: true };
  }

  app.get(
    "/app/staff",
    requireAuth,
    requirePermission("activeclinic.staff.view"),
    async (req, res, next) => {
      try {
        const list = await loadActiveClinicStaffListScreen(getPool(), {
          auth: req.activeClinicAuth,
          query: req.query || {},
        });
        const canInvite = list.actions && list.actions.inviteHref;
        return await renderShell(req, res, {
          activeNav: "staff",
          content: "app/staff-list-content.ejs",
          pageHeader: {
            title: "Staff",
            description: "Staff directory for this healthcare organization.",
            actions: canInvite
              ? [{ label: "Invite staff", href: list.actions.inviteHref }]
              : [],
          },
          breadcrumbs: [{ label: "Home", href: "/app" }, { label: "Staff" }],
          pageData: { list },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/staff/new",
    requireAuth,
    requirePermission("activeclinic.staff.create"),
    async (req, res, next) => {
      try {
        const inviteMode = String(req.query.invite || "") === "1";
        const form = await loadActiveClinicCreateStaffScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!form.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Access Restricted",
              "You do not have permission to invite staff.",
              {
                state: "access-denied",
                linkHref: "/app/staff",
                linkLabel: "Back to staff",
              }
            )
          );
        }
        return await renderShell(req, res, {
          activeNav: "staff",
          content: "app/staff-form-content.ejs",
          pageHeader: {
            title: inviteMode ? "Invite staff member" : "Add staff",
            description: inviteMode
              ? "Create a staff profile and issue an activation invitation."
              : "Create a staff profile, assign facilities and roles, and optionally issue an activation invitation.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Staff", href: "/app/staff" },
            { label: inviteMode ? "Invite" : "Add" },
          ],
          pageData: {
            form,
            stitch: inviteMode
              ? { desktop: "f30963c89fad49ceabc2447dfd46f8f0" }
              : {},
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/staff/invite",
    requireAuth,
    requirePermission("activeclinic.staff.invite"),
    async (req, res, next) => {
      try {
        return await renderShell(req, res, {
          activeNav: "staff",
          content: "app/staff-invite-content.ejs",
          pageHeader: {
            title: "Invite staff member",
            description: "Start the staff invitation workflow.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Staff", href: "/app/staff" },
            { label: "Invite" },
          ],
          pageData: {
            stitch: { desktop: "f30963c89fad49ceabc2447dfd46f8f0" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  async function handleCreateInvite(req, res, next) {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).send("Forbidden");
      }
      const auth = req.activeClinicAuth;
      const values = parseStaffFormBody(req.body);
      const preview = await loadActiveClinicCreateStaffScreen(getPool(), {
        auth,
        values,
      });
      if (!preview.ok) {
        return res.status(403).send("Forbidden");
      }

      if (values.issueInvitation && !preview.canInvite) {
        const form = await loadActiveClinicCreateStaffScreen(getPool(), {
          auth,
          values,
          errors: ["You do not have permission to issue staff invitations."],
        });
        return await renderShell(req, res, {
          status: 403,
          activeNav: "staff",
          content: "app/staff-form-content.ejs",
          pageHeader: { title: "Add staff", description: null, actions: [] },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Staff", href: "/app/staff" },
            { label: "Add" },
          ],
          pageData: { form },
        });
      }

      const checked = validateStaffFormValues(values, {
        requireFacilities: preview.canAssignFacility,
        requireRole: preview.canAssignAccess && values.issueInvitation,
        roleOptions: preview.roleOptions,
      });
      if (!checked.ok) {
        const form = await loadActiveClinicCreateStaffScreen(getPool(), {
          auth,
          values,
          errors: checked.errors,
          fieldErrors: checked.fieldErrors,
        });
        return await renderShell(req, res, {
          status: 400,
          activeNav: "staff",
          content: "app/staff-form-content.ejs",
          pageHeader: { title: "Add staff", description: null, actions: [] },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Staff", href: "/app/staff" },
            { label: "Add" },
          ],
          pageData: { form },
        });
      }

      if (!auth.healthcareOrganization || !auth.healthcareOrganization.id) {
        const form = await loadActiveClinicCreateStaffScreen(getPool(), {
          auth,
          values,
          errors: ["Healthcare organization context is missing."],
        });
        return await renderShell(req, res, {
          status: 400,
          activeNav: "staff",
          content: "app/staff-form-content.ejs",
          pageHeader: { title: "Add staff", description: null, actions: [] },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Staff", href: "/app/staff" },
            { label: "Add" },
          ],
          pageData: { form },
        });
      }

      const allowedFacilityIds = new Set(preview.facilities.map((f) => String(f.id)));
      values.facilityIds = values.facilityIds.filter((id) => allowedFacilityIds.has(id));
      if (preview.canAssignFacility && !values.facilityIds.length) {
        const form = await loadActiveClinicCreateStaffScreen(getPool(), {
          auth,
          values,
          errors: ["Select at least one facility within your access."],
          fieldErrors: { facility_ids: "Select at least one facility." },
        });
        return await renderShell(req, res, {
          status: 400,
          activeNav: "staff",
          content: "app/staff-form-content.ejs",
          pageHeader: { title: "Add staff", description: null, actions: [] },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Staff", href: "/app/staff" },
            { label: "Add" },
          ],
          pageData: { form },
        });
      }

      const deployment = getPlatformDeploymentCode(env);
      const facilityIds = orderFacilityIds(values);
      const roleAssignments = preview.canAssignAccess
        ? buildInviteRoleAssignments(values)
        : [];
      const accessReview = await summarizePermissionsForRoleKeys(
        getPool(),
        roleAssignments.map((r) => r.roleKey)
      );

      // Create staff profile without invitation (directory / pending identity).
      if (!values.issueInvitation) {
        const created = await createStaffMember(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          firstName: values.firstName,
          lastName: values.lastName,
          preferredName: values.preferredName || null,
          phone: values.phone,
          phoneCountry: values.phoneCountry || null,
          phoneNational: values.phoneNational || null,
          clinicDefaultCountry:
            (auth.healthcareOrganization && auth.healthcareOrganization.countryCode) ||
            null,
          email: values.email || null,
          employmentType: values.employmentType,
          jobTitle: values.jobTitle || null,
          staffNumber: values.staffNumber || null,
          startDate: values.startDate || null,
          endDate: values.endDate || null,
          status: "invited",
          platformIdentityId: null,
          deploymentCode: deployment.code || CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!created.ok) {
          const form = await loadActiveClinicCreateStaffScreen(getPool(), {
            auth,
            values,
            errors: [inviteErrorMessage(created.code)],
          });
          return await renderShell(req, res, {
            status: 400,
            activeNav: "staff",
            content: "app/staff-form-content.ejs",
            pageHeader: { title: "Add staff", description: null, actions: [] },
            breadcrumbs: [
              { label: "Home", href: "/app" },
              { label: "Staff", href: "/app/staff" },
              { label: "Add" },
            ],
            pageData: { form },
          });
        }

        if (preview.canAssignFacility) {
          for (const facilityId of facilityIds) {
            const assigned = await assignStaffToFacility(getPool(), {
              organizationId: auth.organization.id,
              staffMemberId: created.staffMember.id,
              facilityId,
              isPrimary: facilityIds[0] === facilityId,
              deploymentCode: deployment.code || CODE_ACTIVECLINIC_ORG_V6,
            });
            if (!assigned.ok && assigned.code !== "facility_assignment_exists") {
              const form = await loadActiveClinicCreateStaffScreen(getPool(), {
                auth,
                values,
                errors: ["Facility assignment failed."],
              });
              return await renderShell(req, res, {
                status: 400,
                activeNav: "staff",
                content: "app/staff-form-content.ejs",
                pageHeader: { title: "Add staff", description: null, actions: [] },
                breadcrumbs: [
                  { label: "Home", href: "/app" },
                  { label: "Staff", href: "/app/staff" },
                  { label: "Add" },
                ],
                pageData: { form },
              });
            }
          }
        }

        for (const role of roleAssignments) {
          const grant = await canGrantRole(getPool(), {
            auth,
            roleKey: role.roleKey,
            scopeType: role.scopeType,
            facilityId: role.facilityId || null,
            targetStaffMemberId: created.staffMember.id,
          });
          if (!grant.ok) {
            const form = await loadActiveClinicCreateStaffScreen(getPool(), {
              auth,
              values,
              errors: [inviteErrorMessage(INVITE_RESULT.GRANT_DENIED)],
            });
            return await renderShell(req, res, {
              status: 403,
              activeNav: "staff",
              content: "app/staff-form-content.ejs",
              pageHeader: { title: "Add staff", description: null, actions: [] },
              breadcrumbs: [
                { label: "Home", href: "/app" },
                { label: "Staff", href: "/app/staff" },
                { label: "Add" },
              ],
              pageData: { form },
            });
          }
          await assignStaffRole(getPool(), {
            organizationId: auth.organization.id,
            staffMemberId: created.staffMember.id,
            roleKey: role.roleKey,
            scopeType: role.scopeType,
            facilityId: role.facilityId || null,
            assignedByPlatformIdentityId: auth.platformIdentity.id,
            deploymentCode: deployment.code || CODE_ACTIVECLINIC_ORG_V6,
            assignmentOrigin: "manual",
          });
        }

        return res.redirect(
          303,
          `/app/staff/${encodeURIComponent(created.staffMember.id)}?created=1`
        );
      }

      const invited = await inviteActiveClinicStaff(getPool(), {
        organizationId: auth.organization.id,
        healthcareOrganizationId: auth.healthcareOrganization.id,
        facilityIds: preview.canAssignFacility ? facilityIds : [],
        firstName: values.firstName,
        lastName: values.lastName,
        preferredName: values.preferredName || null,
        phone: values.phone,
        phoneCountry: values.phoneCountry || null,
        phoneNational: values.phoneNational || null,
        clinicDefaultCountry:
          (auth.healthcareOrganization && auth.healthcareOrganization.countryCode) ||
          null,
        email: values.email || null,
        employmentType: values.employmentType,
        jobTitle: values.jobTitle || null,
        staffNumber: values.staffNumber || null,
        startDate: values.startDate || null,
        endDate: values.endDate || null,
        roleAssignments,
        auth,
        actorPlatformIdentityId: auth.platformIdentity.id,
        deploymentCode: deployment.code || CODE_ACTIVECLINIC_ORG_V6,
        env,
      });

      if (!invited.ok) {
        const form = await loadActiveClinicCreateStaffScreen(getPool(), {
          auth,
          values,
          errors: [inviteErrorMessage(invited.code)],
        });
        return await renderShell(req, res, {
          status: invited.code === INVITE_RESULT.GRANT_DENIED ? 403 : 400,
          activeNav: "staff",
          content: "app/staff-form-content.ejs",
          pageHeader: { title: "Invite staff", description: null, actions: [] },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Staff", href: "/app/staff" },
            { label: "Invite" },
          ],
          pageData: { form },
        });
      }

      const deliveryStatus = invited.deliveryStatus || "link_generated";
      return await renderShell(req, res, {
        activeNav: "staff",
        content: "app/staff-invite-result-content.ejs",
        pageHeader: {
          title: "Invitation ready",
          description: "Share the activation link with the new staff member.",
          actions: [],
        },
        breadcrumbs: [
          { label: "Home", href: "/app" },
          { label: "Staff", href: "/app/staff" },
          { label: "Invitation" },
        ],
        pageData: {
          invite: {
            staffMember: {
              id: invited.staffMember.id,
              displayName: invited.staffMember.displayName,
            },
            activationUrl: invited.activationUrl,
            expiresAt: invited.expiresAt,
            deliveryStatus,
            deliveryLabel: DELIVERY_LABELS[deliveryStatus] || DELIVERY_LABELS.link_generated,
            share: invited.share || {},
            identityCreated: invited.identityCreated === true,
            roles: roleAssignments,
            accessReview,
          },
        },
      });
    } catch (err) {
      return next(err);
    }
  }

  app.post(
    "/app/staff",
    requireAuth,
    requirePermission("activeclinic.staff.create"),
    handleCreateInvite
  );

  app.get(
    "/app/staff/:staffId/edit",
    requireAuth,
    requirePermission("activeclinic.staff.update"),
    async (req, res, next) => {
      try {
        const form = await loadActiveClinicEditStaffScreen(getPool(), {
          auth: req.activeClinicAuth,
          staffId: req.params.staffId,
        });
        if (!form.ok) {
          return res.status(form.code === "access_denied" ? 403 : 404).type("html").send(
            renderSimpleState(
              form.code === "access_denied" ? "Access Restricted" : "Not found",
              form.code === "access_denied"
                ? "You do not have permission to edit this staff profile."
                : "That staff profile is not available.",
              {
                state: form.code === "access_denied" ? "access-denied" : "not-found",
                linkHref: "/app/staff",
                linkLabel: "Back to staff",
              }
            )
          );
        }
        return await renderShell(req, res, {
          activeNav: "staff",
          content: "app/staff-form-content.ejs",
          pageHeader: {
            title: `Edit ${form.staff.displayName}`,
            description: "Update staff profile and facility assignments.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Staff", href: "/app/staff" },
            {
              label: form.staff.displayName,
              href: `/app/staff/${encodeURIComponent(form.staff.id)}`,
            },
            { label: "Edit" },
          ],
          pageData: { form },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/staff/:staffId",
    requireAuth,
    requirePermission("activeclinic.staff.update"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        // Avoid capturing lifecycle POSTs that share the same prefix via more specific routes.
        const form = await loadActiveClinicEditStaffScreen(getPool(), {
          auth,
          staffId: req.params.staffId,
        });
        if (!form.ok) {
          return res.status(404).send("Not found");
        }

        const values = parseStaffFormBody(req.body);
        const checked = validateStaffFormValues(values, {
          requireFacilities: form.canAssignFacility,
          requireRole: false,
        });
        if (!checked.ok) {
          const rerender = await loadActiveClinicEditStaffScreen(getPool(), {
            auth: req.activeClinicAuth,
            staffId: req.params.staffId,
            values,
            errors: checked.errors,
            fieldErrors: checked.fieldErrors,
          });
          return await renderShell(req, res, {
            status: 400,
            activeNav: "staff",
            content: "app/staff-form-content.ejs",
            pageHeader: {
              title: `Edit ${form.staff.displayName}`,
              description: null,
              actions: [],
            },
            breadcrumbs: [
              { label: "Home", href: "/app" },
              { label: "Staff", href: "/app/staff" },
              { label: "Edit" },
            ],
            pageData: { form: rerender },
          });
        }

        const updated = await updateStaffMemberProfile(getPool(), {
          id: form.staff.id,
          organizationId: req.activeClinicAuth.organization.id,
          deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
          patch: {
            firstName: values.firstName,
            lastName: values.lastName,
            preferredName: values.preferredName || null,
            phone: values.phone,
            phoneCountry: values.phoneCountry || null,
            phoneNational: values.phoneNational || null,
            clinicDefaultCountry:
              (auth.healthcareOrganization && auth.healthcareOrganization.countryCode) ||
              null,
            email: values.email || null,
            jobTitle: values.jobTitle || null,
            employmentType: values.employmentType,
            staffNumber: values.staffNumber || null,
            startDate: values.startDate || null,
            endDate: values.endDate || null,
          },
        });
        if (!updated.ok) {
          const rerender = await loadActiveClinicEditStaffScreen(getPool(), {
            auth: req.activeClinicAuth,
            staffId: req.params.staffId,
            values,
            errors: ["Unable to save staff profile. Check phone and email."],
          });
          return await renderShell(req, res, {
            status: 400,
            activeNav: "staff",
            content: "app/staff-form-content.ejs",
            pageHeader: {
              title: `Edit ${form.staff.displayName}`,
              description: null,
              actions: [],
            },
            breadcrumbs: [
              { label: "Home", href: "/app" },
              { label: "Staff", href: "/app/staff" },
              { label: "Edit" },
            ],
            pageData: { form: rerender },
          });
        }

        if (form.canAssignFacility) {
          const allowed = new Set(form.facilities.map((f) => String(f.id)));
          values.facilityIds = values.facilityIds.filter((id) => allowed.has(id));
          const synced = await syncFacilityAssignments(
            req.activeClinicAuth,
            form.staff.id,
            values
          );
          if (!synced.ok) {
            const facilityMsg =
              synced.code === "dependent_facility_roles"
                ? "Revoke facility-scoped roles for a facility before removing that facility assignment."
                : "Staff saved, but facility assignments could not be updated.";
            const rerender = await loadActiveClinicEditStaffScreen(getPool(), {
              auth: req.activeClinicAuth,
              staffId: req.params.staffId,
              values,
              errors: [facilityMsg],
            });
            return await renderShell(req, res, {
              status: 400,
              activeNav: "staff",
              content: "app/staff-form-content.ejs",
              pageHeader: {
                title: `Edit ${form.staff.displayName}`,
                description: null,
                actions: [],
              },
              breadcrumbs: [
                { label: "Home", href: "/app" },
                { label: "Staff", href: "/app/staff" },
                { label: "Edit" },
              ],
              pageData: { form: rerender },
            });
          }
        }

        return res.redirect(
          303,
          `/app/staff/${encodeURIComponent(form.staff.id)}?ok=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/staff/:staffId/suspend",
    requireAuth,
    requirePermission("activeclinic.staff.archive"),
    async (req, res, next) => {
      try {
        const detail = await loadActiveClinicStaffDetailScreen(getPool(), {
          auth: req.activeClinicAuth,
          staffId: req.params.staffId,
        });
        if (!detail.ok) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "That staff profile is not available.", {
              state: "not-found",
              linkHref: "/app/staff",
              linkLabel: "Back to staff",
            })
          );
        }
        if (!detail.actions || !detail.actions.suspend) {
          return res.redirect(303, `/app/staff/${encodeURIComponent(detail.staff.id)}`);
        }
        return await renderShell(req, res, {
          activeNav: "staff",
          content: "app/staff-suspend-content.ejs",
          pageHeader: {
            title: "Suspend staff account",
            description: `Confirm suspension for ${detail.staff.displayName}.`,
            actions: [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Staff", href: "/app/staff" },
            {
              label: detail.staff.displayName,
              href: `/app/staff/${encodeURIComponent(detail.staff.id)}`,
            },
            { label: "Suspend" },
          ],
          pageData: {
            staff: detail.staff,
            stitch: { desktop: "3d43526745534570bbe9cd22948be3c1" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/staff/:staffId",
    requireAuth,
    requirePermission("activeclinic.staff.view"),
    async (req, res, next) => {
      try {
        const detail = await loadActiveClinicStaffDetailScreen(getPool(), {
          auth: req.activeClinicAuth,
          staffId: req.params.staffId,
        });
        if (!detail.ok) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "That staff profile is not available.", {
              state: "not-found",
              linkHref: "/app/staff",
              linkLabel: "Back to staff",
            })
          );
        }
        const s = detail.staff;
        const headerActions = [{ label: "All staff", href: "/app/staff", ghost: true }];
        if (detail.actions.editHref) {
          headerActions.unshift({ label: "Edit", href: detail.actions.editHref });
        }
        return await renderShell(req, res, {
          activeNav: "staff",
          content: "app/staff-detail-content.ejs",
          pageHeader: {
            title: s.displayName,
            description: s.jobTitle || "Staff profile",
            actions: headerActions,
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Staff", href: "/app/staff" },
            { label: s.displayName },
          ],
          pageData: { detail },
          flash:
            req.query && req.query.ok === "1"
              ? { type: "success", message: "Action completed." }
              : req.query && req.query.error
                ? {
                    type: "error",
                    message: "That action could not be completed.",
                  }
                : null,
        });
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicStaffRoutes,
};
