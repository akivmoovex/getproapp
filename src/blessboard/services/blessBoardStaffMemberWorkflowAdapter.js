"use strict";

/**
 * BlessBoard staff-managed Add Member adapter (V2.04 Phase 3).
 *
 * Owns: Church ID (member_number), church/branch assignment, membership status,
 * portal access status. Clinical / patient fields are rejected.
 */

const {
  PERSON_RELATIONSHIP_KEY,
} = require("../../platform/person/personConstants");
const {
  BLESSBOARD_DUPLICATE_POLICY,
} = require("../../platform/person/duplicate");
const {
  presentBlessBoardMatch,
} = require("./blessBoardMemberDuplicateService");
const memberRepo = require("../repositories/memberIdentityRepository");

const MEMBERSHIP_STATUSES = Object.freeze([
  "pending",
  "active",
  "inactive",
  "suspended",
  "transferred",
  "former",
  "deceased",
]);

const PORTAL_ACCESS = Object.freeze({
  NOT_ACTIVATED: "not_activated",
  NONE: "not_activated", // Phase 3 alias
  INVITED: "not_activated",
  ACTIVE: "active",
  BLOCKED: "blocked",
});

function normalizePortalAccessStatus(raw) {
  const value = String(raw || PORTAL_ACCESS.NOT_ACTIVATED)
    .trim()
    .toLowerCase();
  if (value === "none" || value === "invited") return PORTAL_ACCESS.NOT_ACTIVATED;
  if (
    value === PORTAL_ACCESS.NOT_ACTIVATED ||
    value === PORTAL_ACCESS.ACTIVE ||
    value === PORTAL_ACCESS.BLOCKED
  ) {
    return value;
  }
  return null;
}

function createBlessBoardStaffMemberAdapter(deps) {
  const authorizeFn =
    (deps && deps.authorize) ||
    ((db, input) =>
      require("./blessBoardRbacAuthorizationService").authorize(db, {
        permission: input.permissionKey || "members.create",
        actor: { userId: input.actor && input.actor.userId },
        tenantContext: {
          organizationId: input.trusted && input.trusted.organizationId,
          churchId: input.trusted && input.trusted.churchId,
          primaryBranchId: input.trusted && input.trusted.branchId,
        },
        resourceContext: {
          organizationId: input.trusted && input.trusted.organizationId,
          churchId: input.trusted && input.trusted.churchId,
          branchId: input.trusted && input.trusted.branchId,
        },
      }));

  return {
    productCode: "blessboard",
    relationshipKey: PERSON_RELATIONSHIP_KEY.BB_MEMBERSHIP,
    createPermissionKey: "members.create",
    duplicatePolicy: BLESSBOARD_DUPLICATE_POLICY,
    presentMatch: presentBlessBoardMatch,

    async authorize(db, ctx) {
      const churchId = String((ctx.trusted && ctx.trusted.churchId) || "").trim();
      const userId = String((ctx.actor && ctx.actor.userId) || "").trim();
      if (!churchId || !userId) {
        return { ok: false, code: "unauthorized_context" };
      }
      const authz = await authorizeFn(db, {
        trusted: ctx.trusted,
        actor: ctx.actor,
        permissionKey: "members.create",
      });
      if (!authz || authz.allowed !== true) {
        return {
          ok: false,
          code: (authz && authz.reasonCode) || "unauthorized",
        };
      }
      return { ok: true, authz };
    },

    normalizeProductFields(input) {
      const src = (input && input.product) || {};
      const trusted = (input && input.trusted) || {};
      const churchId = String(src.churchId || trusted.churchId || "").trim();
      const branchId = String(src.branchId || trusted.branchId || "").trim();
      if (!churchId) {
        return { ok: false, code: "church_id_required" };
      }
      if (!branchId) {
        return { ok: false, code: "branch_id_required" };
      }

      // Reject clinical / AC fields leaking into BB adapter.
      for (const forbidden of [
        "patientNumber",
        "patient_number",
        "diagnosis",
        "encounterId",
        "prescription",
        "healthcareOrganizationId",
      ]) {
        if (src[forbidden] != null) {
          return { ok: false, code: "forbidden_product_field", field: forbidden };
        }
      }

      const memberNumberRaw =
        src.churchIdNumber != null
          ? src.churchIdNumber
          : src.memberNumber != null
            ? src.memberNumber
            : src.member_number != null
              ? src.member_number
              : src.churchMemberNumber;
      const memberNumber =
        memberNumberRaw == null || String(memberNumberRaw).trim() === ""
          ? null
          : String(memberNumberRaw).trim();
      if (memberNumber && memberNumber.length > 64) {
        return { ok: false, code: "invalid_church_id" };
      }

      const membershipStatus = String(
        src.membershipStatus || src.status || "active"
      )
        .trim()
        .toLowerCase();
      if (!MEMBERSHIP_STATUSES.includes(membershipStatus)) {
        return { ok: false, code: "invalid_membership_status" };
      }

      const portalAccessStatus = normalizePortalAccessStatus(
        src.portalAccessStatus
      );
      if (!portalAccessStatus) {
        return { ok: false, code: "invalid_portal_access_status" };
      }
      // Staff-created members may exist without portal activation.
      if (portalAccessStatus === PORTAL_ACCESS.ACTIVE && !src.userId) {
        return { ok: false, code: "portal_active_requires_user" };
      }

      const productIdentifiers = [];
      if (memberNumber) {
        productIdentifiers.push({
          key: "member_number",
          valueNormalized: memberNumber,
          blocking: true,
        });
      }

      return {
        ok: true,
        product: {
          churchId,
          branchId,
          memberNumber,
          membershipStatus,
          portalAccessStatus,
          userId: src.userId || null,
          isPrimary: src.isPrimary !== false,
          dateOfBirth: src.dateOfBirth || null,
          occupation: src.occupation || null,
          maritalStatus: src.maritalStatus || null,
          numberOfChildren: src.numberOfChildren,
          addressLine1: src.addressLine1 || null,
          addressLine2: src.addressLine2 || null,
          addressCity: src.addressCity || null,
          addressDistrict: src.addressDistrict || null,
          addressProvince: src.addressProvince || null,
          addressCountryCode: src.addressCountryCode || null,
          addressPostalCode: src.addressPostalCode || null,
          nextOfKinName: src.nextOfKinName || null,
          nextOfKinRelationship: src.nextOfKinRelationship || null,
          nextOfKinPhoneDisplay: src.nextOfKinPhoneDisplay || null,
          nextOfKinPhoneNormalized: src.nextOfKinPhoneNormalized || null,
        },
        productIdentifiers,
      };
    },

    async loadDuplicateCandidates(db, ctx) {
      const churchId = String(
        (ctx.trusted && ctx.trusted.churchId) ||
          (ctx.product && ctx.product.churchId) ||
          ""
      ).trim();
      const probe = ctx.probe || {};
      const product = ctx.product || {};
      const rows = await memberRepo.findStaffDuplicateMemberCandidates(db, {
        churchId,
        memberNumber: product.memberNumber || null,
        phoneNormalized: probe.phoneNormalized || null,
        emailNormalized: probe.emailNormalized || null,
        firstName: probe.firstName || null,
        lastName: probe.lastName || null,
        limit: 20,
      });
      const organizationId = String(
        (ctx.trusted && ctx.trusted.organizationId) || ""
      ).trim();
      return {
        ok: true,
        candidates: rows.map((m) => ({
          id: m.id,
          subjectRef: m.id,
          organizationId,
          productCode: "blessboard",
          firstName: m.firstName,
          lastName: m.lastName,
          phoneNormalized: m.phoneNormalized,
          emailNormalized: m.emailNormalized,
          productIdentifiers: m.memberNumber
            ? [
                {
                  key: "member_number",
                  valueNormalized: String(m.memberNumber).trim(),
                  blocking: true,
                },
              ]
            : [],
        })),
      };
    },

    async createProductRelationship(db, ctx) {
      const product = ctx.product || {};
      const demographics = ctx.demographics || {};
      const portalAccessStatus =
        product.portalAccessStatus || PORTAL_ACCESS.NOT_ACTIVATED;

      const run = async (client) => {
        const member = await memberRepo.insertMember(client, {
          churchId: product.churchId,
          userId:
            portalAccessStatus === PORTAL_ACCESS.ACTIVE
              ? product.userId || null
              : null,
          platformPersonId: product.platformPersonId || null,
          firstName: demographics.firstName,
          lastName: demographics.lastName,
          preferredName: demographics.preferredName,
          emailNormalized: demographics.emailNormalized,
          emailDisplay: demographics.emailDisplay,
          phoneNormalized: demographics.phoneNormalized,
          phoneDisplay: demographics.phoneDisplay,
          memberNumber: product.memberNumber,
          status: product.membershipStatus || "active",
          portalAccessStatus,
          dateOfBirth: product.dateOfBirth || demographics.dateOfBirth || null,
          occupation: product.occupation || null,
          maritalStatus: product.maritalStatus || null,
          numberOfChildren: product.numberOfChildren,
          addressLine1: product.addressLine1 || null,
          addressLine2: product.addressLine2 || null,
          addressCity: product.addressCity || null,
          addressDistrict: product.addressDistrict || null,
          addressProvince: product.addressProvince || null,
          addressCountryCode: product.addressCountryCode || null,
          addressPostalCode: product.addressPostalCode || null,
          nextOfKinName: product.nextOfKinName || null,
          nextOfKinRelationship: product.nextOfKinRelationship || null,
          nextOfKinPhoneDisplay: product.nextOfKinPhoneDisplay || null,
          nextOfKinPhoneNormalized: product.nextOfKinPhoneNormalized || null,
        });
        const membership = await memberRepo.insertMembership(client, {
          memberId: member.id,
          branchId: product.branchId,
          membershipStatus:
            product.membershipStatus === "pending" ? "pending" : "active",
          isPrimary: product.isPrimary !== false,
          joinedAt: new Date(),
        });
        return { member, membership };
      };

      let created;
      if (db && typeof db.connect === "function") {
        const client = await db.connect();
        try {
          await client.query("BEGIN");
          created = await run(client);
          await client.query("COMMIT");
        } catch (err) {
          try {
            await client.query("ROLLBACK");
          } catch (_e) {
            /* ignore */
          }
          throw err;
        } finally {
          client.release();
        }
      } else {
        // Test / client-shaped db
        created = await run(db);
      }

      return {
        ok: true,
        subjectRef: created.member.id,
        productIdentifier: created.member.memberNumber || null,
        relationshipStatus: created.membership.membershipStatus,
        portalAccessStatus: created.member.portalAccessStatus,
        productRecord: {
          member: created.member,
          membership: created.membership,
        },
        location: {
          organizationId: ctx.trusted && ctx.trusted.organizationId,
          churchId: product.churchId,
          branchId: product.branchId,
        },
      };
    },
  };
}

const blessBoardStaffMemberAdapter = createBlessBoardStaffMemberAdapter();

module.exports = {
  createBlessBoardStaffMemberAdapter,
  blessBoardStaffMemberAdapter,
  PORTAL_ACCESS,
  MEMBERSHIP_STATUSES,
  normalizePortalAccessStatus,
};
