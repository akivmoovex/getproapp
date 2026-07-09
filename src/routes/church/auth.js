"use strict";

const { getPgPool } = require("../../db/pg");
const membersRepo = require("../../db/pg/church/membersRepo");
const {
  getChurchMemberSession,
  setChurchMemberSession,
  clearChurchMemberSession,
  requireChurchMemberSession,
  hashMemberPassword,
  verifyMemberPassword,
} = require("../../church/memberAuth");
const {
  validateRegistrationBody,
  AGE_GROUP_OPTIONS,
  ATTENDANCE_DURATION_OPTIONS,
  MINISTRY_INTEREST_OPTIONS,
  isMemberRegistrationEnabled,
} = require("../../church/memberRegistration");
const { authenticateWithLoginProtection } = require("../../services/church/churchLoginProtectionService");
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

const { renderChurchNotFound } = require("../../church/churchStatusAccess");

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
  return {
    churchName: branch.name || org.name,
    pageTitle: branch.name || org.name,
    organization: org,
    branch,
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
    const member = getChurchMemberSession(req);
    if (member && Number(member.branch_id) === Number(req.churchContext.branch.id)) {
      if (member.status === "verified") {
        return res.redirect("/member/dashboard");
      }
      if (member.status === "pending") {
        return res.redirect("/waiting-verification");
      }
    }
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
      const identifier = String((req.body && req.body.identifier) || "").trim();
      const password = String((req.body && req.body.password) || "");
      const branch = req.churchContext.branch;
      const org = req.churchContext.organization;
      const pool = getPgPool();

      const renderLoginError = (message) =>
        res.status(400).render(
          "church/auth/login",
          branchAuthLocals(req, {
            error: message,
            identifier,
          })
        );

      const auth = await authenticateWithLoginProtection(pool, req, {
        accountType: "member",
        organizationId: org.id,
        branchId: branch.id,
        identifier,
        password,
        findAccount: (db, ident) => membersRepo.findMemberByEmailOrPhoneForBranch(db, branch.id, ident),
        verifyPassword: verifyMemberPassword,
        validateAccountStatus(row) {
          if (row.status === "rejected") {
            return {
              ok: false,
              error:
                "Your membership request was not approved. Please contact the church office if you believe this is an error.",
              clearSession: true,
            };
          }
          if (row.status === "suspended") {
            return {
              ok: false,
              error:
                "Your member access is currently suspended. Please contact the church office for assistance.",
              clearSession: true,
            };
          }
          if (row.status !== "pending" && row.status !== "verified") {
            return {
              ok: false,
              error: "Unable to sign in right now. Please contact the church office.",
              clearSession: true,
            };
          }
          return { ok: true };
        },
      });

      if (!auth.ok) {
        if (auth.clearSession) {
          clearChurchMemberSession(req);
        }
        return renderLoginError(auth.error);
      }

      const row = auth.account;
      setChurchMemberSession(req, {
        member_id: row.id,
        organization_id: row.organization_id,
        branch_id: row.branch_id,
        status: row.status,
        full_name: row.full_name,
      });

      if (row.status === "pending") {
        return res.redirect(303, "/waiting-verification");
      }
      if (row.status === "verified") {
        return res.redirect(303, "/member/dashboard");
      }

      clearChurchMemberSession(req);
      return renderLoginError("Unable to sign in right now. Please contact the church office.");
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

  router.post("/logout", (req, res) => {
    clearChurchMemberSession(req);
    return res.redirect(303, "/");
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
