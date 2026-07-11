"use strict";

const { getPgPool } = require("../../db/pg");
const membersRepo = require("../../db/pg/church/membersRepo");
const {
  getChurchMemberSession,
  clearChurchMemberSession,
  requireChurchMemberSession,
  hashMemberPassword,
} = require("../../church/memberAuth");
const {
  churchSessionCsrfLocals,
  requireChurchSessionCsrf,
} = require("../../church/churchSessionCsrf");
const {
  validateRegistrationBody,
  AGE_GROUP_OPTIONS,
  ATTENDANCE_DURATION_OPTIONS,
  MINISTRY_INTEREST_OPTIONS,
  isMemberRegistrationEnabled,
} = require("../../church/memberRegistration");
const { revalidateChosenRole, destinationForRole, requireActiveOrganization } = require("../../services/church/tenantUnifiedLoginService");
const { runTenantUnifiedLoginPost } = require("../../services/church/runTenantUnifiedLogin");
const {
  clearAllChurchRoleSessions,
  applyRoleSession,
  getPortalChoice,
  consumePortalChoice,
  clearPortalChoice,
  existingSessionDestination,
  findChosenRole,
} = require("../../church/tenantLoginSession");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const memberPasswordResetRequestsRepo = require("../../db/pg/church/memberPasswordResetRequestsRepo");
const { maskLoginIdentifier } = require("../../church/loginProtection");
const {
  validatePublicForgotPasswordBody,
  PUBLIC_SUCCESS_MESSAGE,
} = require("../../church/memberPasswordResetRequestValidation");
const {
  gatePasswordResetRequest,
  recordPasswordResetSubmission,
} = require("../../services/church/passwordResetRateLimitService");

const { renderChurchNotFound, renderChurchUnavailable } = require("../../church/churchStatusAccess");

function requireChurchBranchHost(req, res, next) {
  if (!req.churchContext || req.churchContext.kind !== "branch") {
    return res.status(404).type("text").send("Not found");
  }
  if (!req.churchContext.organization || !req.churchContext.branch) {
    return renderChurchNotFound(req, res);
  }
  return next();
}

function branchAuthLocals(req, extra) {
  const org = req.churchContext.organization;
  const branch = req.churchContext.branch;
  const member = getChurchMemberSession(req);
  const csrf = member
    ? churchSessionCsrfLocals(req)
    : { churchCsrfToken: "", churchCsrfField: "_csrf" };
  return {
    churchName: branch.name || org.name,
    organizationName: org.name,
    branchName: branch.name,
    pageTitle: branch.name || org.name,
    organization: org,
    branch,
    ...csrf,
    ...(extra || {}),
  };
}

function redirectIfVerifiedMember(req, res, next) {
  const member = getChurchMemberSession(req);
  if (member && member.status === "verified" && Number(member.branch_id) === Number(req.churchContext.branch.id)) {
    return res.redirect("/member/dashboard");
  }
  return next();
}

function requireMemberRegistrationOpen(req, res, next) {
  if (!isMemberRegistrationEnabled(req.churchContext.branch)) {
    return res.render(
      "church/auth/register_closed",
      branchAuthLocals(req, {
        pageTitle: "Registration closed",
      })
    );
  }
  return next();
}

function registerChurchAuthRoutes(router) {
  router.use("/register", requireChurchBranchHost);
  router.use("/register", requireMemberRegistrationOpen);
  router.use("/login", requireChurchBranchHost);
  router.use("/forgot-password", requireChurchBranchHost);
  router.use("/forgot-password-submitted", requireChurchBranchHost);
  router.use("/registration-submitted", requireChurchBranchHost);
  router.use("/waiting-verification", requireChurchBranchHost);
  router.use("/logout", requireChurchBranchHost);
  router.use("/choose-portal", requireChurchBranchHost);
  router.use("/member", requireChurchBranchHost);

  router.get("/register", redirectIfVerifiedMember, (req, res) => {
    return res.render(
      "church/auth/register",
      branchAuthLocals(req, {
        error: null,
        form: {},
        ageGroupOptions: AGE_GROUP_OPTIONS,
        attendanceDurationOptions: ATTENDANCE_DURATION_OPTIONS,
        ministryInterestOptions: MINISTRY_INTEREST_OPTIONS,
      })
    );
  });

  router.post("/register", redirectIfVerifiedMember, async (req, res, next) => {
    try {
      const validation = validateRegistrationBody(req.body || {});
      if (!validation.ok) {
        return res.status(400).render(
          "church/auth/register",
          branchAuthLocals(req, {
            error: validation.error,
            form: validation.form,
            ageGroupOptions: AGE_GROUP_OPTIONS,
            attendanceDurationOptions: ATTENDANCE_DURATION_OPTIONS,
            ministryInterestOptions: MINISTRY_INTEREST_OPTIONS,
          })
        );
      }

      const org = req.churchContext.organization;
      const branch = req.churchContext.branch;
      const pool = getPgPool();

      const conflict = await membersRepo.findActiveRegistrationConflictForBranch(
        pool,
        branch.id,
        validation.data.email,
        validation.data.phone
      );
      if (conflict) {
        return res.status(400).render(
          "church/auth/register",
          branchAuthLocals(req, {
            error:
              "We could not complete registration with these details. If you already registered, try signing in or contact the church office.",
            form: validation.form,
            ageGroupOptions: AGE_GROUP_OPTIONS,
            attendanceDurationOptions: ATTENDANCE_DURATION_OPTIONS,
            ministryInterestOptions: MINISTRY_INTEREST_OPTIONS,
          })
        );
      }

      const passwordHash = await hashMemberPassword(validation.data.password);

      try {
        await membersRepo.createPendingMember(pool, {
          organization_id: org.id,
          branch_id: branch.id,
          platform_tenant_id: org.platform_tenant_id,
          email: validation.data.email,
          phone: validation.data.phone,
          full_name: validation.data.full_name,
          password_hash: passwordHash,
          gender: validation.data.gender,
          age_group: validation.data.age_group,
          address_area: validation.data.address_area,
          attendance_duration: validation.data.attendance_duration,
          ministry_interest: validation.data.ministry_interest,
          emergency_contact_name: validation.data.emergency_contact_name,
          emergency_contact_phone: validation.data.emergency_contact_phone,
        });
      } catch (e) {
        if (e && e.code === "23505") {
          return res.status(400).render(
            "church/auth/register",
            branchAuthLocals(req, {
              error:
                "We could not complete registration with these details. If you already registered, try signing in or contact the church office.",
              form: validation.form,
              ageGroupOptions: AGE_GROUP_OPTIONS,
              attendanceDurationOptions: ATTENDANCE_DURATION_OPTIONS,
              ministryInterestOptions: MINISTRY_INTEREST_OPTIONS,
            })
          );
        }
        throw e;
      }

      return res.redirect(303, "/registration-submitted");
    } catch (e) {
      return next(e);
    }
  });

  router.get("/registration-submitted", (req, res) => {
    return res.render("church/auth/registration_submitted", branchAuthLocals(req));
  });

  router.get("/login", (req, res) => {
    const existing = existingSessionDestination(req);
    if (existing) return res.redirect(existing);
    const choice = getPortalChoice(req);
    if (choice) return res.redirect("/choose-portal");
    return res.render(
      "church/auth/login",
      branchAuthLocals(req, {
        error: null,
        identifier: "",
      })
    );
  });

  router.post("/login", async (req, res, next) => {
    try {
      // Never trust client-posted role, organization_id, branch_id, or redirect.
      const identifier = String((req.body && req.body.identifier) || "").trim();
      const password = String((req.body && req.body.password) || "");
      const pool = getPgPool();

      return await runTenantUnifiedLoginPost(pool, req, res, {
        identifier,
        password,
        renderError: (message) =>
          res.status(400).render(
            "church/auth/login",
            branchAuthLocals(req, {
              error: message,
              identifier,
              loginFormAction: "/login",
            })
          ),
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/choose-portal", async (req, res, next) => {
    try {
      const choice = getPortalChoice(req);
      if (!choice) return res.redirect("/login");
      const org = req.churchContext.organization;
      const branch = req.churchContext.branch;
      if (
        Number(choice.organization_id) !== Number(org.id) ||
        Number(choice.branch_id) !== Number(branch.id)
      ) {
        clearPortalChoice(req);
        return res.redirect("/login");
      }
      const pool = getPgPool();
      const orgCheck = await requireActiveOrganization(pool, org);
      if (!orgCheck.ok) {
        clearPortalChoice(req);
        clearAllChurchRoleSessions(req);
        return renderChurchUnavailable(req, res);
      }
      const csrf = churchSessionCsrfLocals(req);
      return res.render(
        "church/auth/choose_portal",
        branchAuthLocals(req, {
          error: null,
          roles: choice.roles,
          ...csrf,
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.post("/choose-portal", requireChurchSessionCsrf, async (req, res, next) => {
    try {
      const org = req.churchContext.organization;
      const branch = req.churchContext.branch;
      const pending = getPortalChoice(req);
      if (!pending) return res.redirect(303, "/login");
      if (
        Number(pending.organization_id) !== Number(org.id) ||
        Number(pending.branch_id) !== Number(branch.id)
      ) {
        clearPortalChoice(req);
        return res.redirect(303, "/login");
      }

      const pool = getPgPool();
      const orgCheck = await requireActiveOrganization(pool, org);
      if (!orgCheck.ok) {
        clearPortalChoice(req);
        clearAllChurchRoleSessions(req);
        return renderChurchUnavailable(req, res);
      }
      const activeOrg = orgCheck.organization;

      const roleType = String((req.body && req.body.role) || "").trim();
      const selectedMeta = findChosenRole(pending, roleType);
      if (!selectedMeta) {
        const csrf = churchSessionCsrfLocals(req);
        return res.status(400).render(
          "church/auth/choose_portal",
          branchAuthLocals(req, {
            error: "Please choose one of your available portals.",
            roles: pending.roles,
            ...csrf,
          })
        );
      }

      // Ignore any client-posted redirect URL. Recheck DB before creating a role session.
      const rechecked = await revalidateChosenRole(pool, activeOrg, branch, selectedMeta);
      if (!rechecked.ok) {
        if (rechecked.orgUnavailable) {
          clearPortalChoice(req);
          clearAllChurchRoleSessions(req);
          return renderChurchUnavailable(req, res);
        }
        const csrf = churchSessionCsrfLocals(req);
        const stillValid = getPortalChoice(req);
        if (!stillValid) {
          return res.status(400).render(
            "church/auth/login",
            branchAuthLocals(req, {
              error: rechecked.error || "Unable to sign in right now. Please try again.",
              identifier: "",
              loginFormAction: "/login",
            })
          );
        }
        return res.status(400).render(
          "church/auth/choose_portal",
          branchAuthLocals(req, {
            error: rechecked.error || "That portal is no longer available. Choose another or sign in again.",
            roles: stillValid.roles,
            ...csrf,
          })
        );
      }

      // Clear only after successful revalidation to block replay.
      consumePortalChoice(req);
      clearAllChurchRoleSessions(req);
      applyRoleSession(req, rechecked.role);

      try {
        await auditLogsRepo.insertAuditLog(pool, {
          organization_id: activeOrg.id,
          branch_id: branch.id,
          actor_type: rechecked.role.type,
          actor_id: rechecked.role.accountId,
          action: "tenant_portal_selected",
          entity_type: "auth",
          entity_id: rechecked.role.accountId,
          metadata_json: { selected_role: rechecked.role.type },
        });
      } catch {
        /* audit must not block */
      }

      return res.redirect(303, destinationForRole(rechecked.role));
    } catch (e) {
      return next(e);
    }
  });

  router.get("/waiting-verification", requireChurchMemberSession, (req, res) => {
    if (req.churchMember.status !== "pending") {
      if (req.churchMember.status === "verified") {
        return res.redirect("/member/dashboard");
      }
      clearChurchMemberSession(req);
      return res.redirect("/login");
    }
    return res.render(
      "church/auth/waiting_verification",
      branchAuthLocals(req, {
        memberName: req.churchMember.full_name,
      })
    );
  });

  router.post("/logout", (req, res, next) => {
    const member = getChurchMemberSession(req);
    const hasPortalChoice = Boolean(getPortalChoice(req));
    if (!member && !hasPortalChoice) {
      clearPortalChoice(req);
      return res.redirect(303, "/");
    }
    return requireChurchSessionCsrf(req, res, () => {
      clearAllChurchRoleSessions(req);
      return res.redirect(303, "/");
    });
  });

  router.get("/forgot-password", (req, res) => {
    return res.render(
      "church/auth/forgot_password",
      branchAuthLocals(req, {
        error: null,
        form: {},
      })
    );
  });

  router.post("/forgot-password", async (req, res, next) => {
    try {
      const validation = validatePublicForgotPasswordBody(req.body || {});
      if (!validation.ok) {
        return res.status(400).render(
          "church/auth/forgot_password",
          branchAuthLocals(req, {
            error: validation.error,
            form: validation.form,
          })
        );
      }

      const org = req.churchContext.organization;
      const branch = req.churchContext.branch;
      const pool = getPgPool();

      const rateGate = await gatePasswordResetRequest(pool, req, {
        requestType: "member",
        organizationId: org.id,
        branchId: branch.id,
        identifier: validation.data.identifier,
      });
      if (!rateGate.allowed) {
        return res.redirect(303, "/forgot-password-submitted");
      }

      const matched = await memberPasswordResetRequestsRepo.findPossibleMemberByIdentifierForBranch(
        pool,
        branch.id,
        validation.data.identifier
      );

      const requestRow = await memberPasswordResetRequestsRepo.createPasswordResetRequest(pool, {
        organizationId: org.id,
        branchId: branch.id,
        memberId: matched ? matched.id : null,
        identifierSubmitted: validation.data.identifier,
        fullNameSubmitted: validation.data.full_name,
        phoneSubmitted: validation.data.phone,
        emailSubmitted: validation.data.email,
      });

      await auditLogsRepo.insertAuditLog(pool, {
        organization_id: org.id,
        branch_id: branch.id,
        actor_type: "public",
        actor_id: null,
        action: "member_password_reset_requested",
        entity_type: "password_reset_request",
        entity_id: requestRow.id,
        metadata_json: {
          request_id: requestRow.id,
          member_id: requestRow.member_id ?? null,
          identifier_masked: maskLoginIdentifier(validation.data.identifier),
          status: requestRow.status,
          action_source: "member_forgot_password_request",
        },
      });

      await recordPasswordResetSubmission(pool, req, {
        requestType: "member",
        organizationId: org.id,
        branchId: branch.id,
        identifier: validation.data.identifier,
      });

      return res.redirect(303, "/forgot-password-submitted");
    } catch (e) {
      return next(e);
    }
  });

  router.get("/forgot-password-submitted", (req, res) => {
    return res.render(
      "church/auth/forgot_password_submitted",
      branchAuthLocals(req, {
        successMessage: PUBLIC_SUCCESS_MESSAGE,
      })
    );
  });
}

registerChurchAuthRoutes.requireChurchBranchHost = requireChurchBranchHost;

module.exports = registerChurchAuthRoutes;
