"use strict";

/**
 * V2.02 BlessBoard catalogue-only RBAC — login, authz, invites, personas.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  STATUS,
  establishBlessBoardSession,
  preferSessionRole,
} = require("../src/blessboard/services/establishBlessBoardSession");
const {
  normalizeToCatalogueRoleKey,
  preferCatalogueSessionRole,
  isCatalogueHqRole,
  portalKeyForCatalogueRole,
  LEGACY_TO_CATALOGUE_ROLE,
} = require("../src/blessboard/services/blessBoardCatalogueLogin");
const {
  resolveQaAssignmentPlan,
  LEGACY_PERSONA_TO_CATALOGUE,
} = require("../src/blessboard/services/blessBoardQaRoleUsersSpec");
const {
  filterValidStaffRolesForTenant,
  buildPortalOptions,
} = require("../src/blessboard/services/resolveTenantPortalAccess");
const {
  authorize,
  REASON,
} = require("../src/blessboard/services/blessBoardRbacAuthorizationService");
const {
  actorMayInvite,
  INVITE_ROLES,
} = require("../src/blessboard/services/inviteBlessBoardStaff");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHURCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ROLE_WE_ID = "11111111-1111-4111-8111-111111111111";
const ROLE_HQ_ID = "22222222-2222-4222-8222-222222222222";

describe("V2.02 BB catalogue-only — mapping", () => {
  it("maps legacy personas to catalogue without elevating blindly", () => {
    assert.equal(normalizeToCatalogueRoleKey("platform_admin"), "platform_administrator");
    assert.equal(normalizeToCatalogueRoleKey("church_hq_admin"), "organisation_administrator");
    assert.equal(normalizeToCatalogueRoleKey("branch_admin"), "branch_administrator");
    assert.equal(normalizeToCatalogueRoleKey("website_editor"), "website_editor");
    assert.deepEqual(LEGACY_TO_CATALOGUE_ROLE.branch_admin, "branch_administrator");
    assert.equal(
      LEGACY_PERSONA_TO_CATALOGUE.church_hq_admin.catalogueRoleKey,
      "organisation_administrator"
    );
  });

  it("QA plans no longer require legacy companions", () => {
    const plan = resolveQaAssignmentPlan("website_editor", "website");
    assert.equal(plan.legacyRoleKey, null);
    assert.equal(plan.catalogueScopeType, "church");
    const branch = resolveQaAssignmentPlan("branch_pastor", "branch");
    assert.equal(branch.legacyRoleKey, null);
    assert.equal(branch.catalogueScopeType, "branch");
  });
});

describe("V2.02 BB catalogue-only — session preference / portals", () => {
  it("prefers organisation administrator over website editor", () => {
    const preferred = preferCatalogueSessionRole(
      [
        {
          role_key: "website_editor",
          organization_id: ORG,
          church_id: CHURCH,
          branch_id: null,
        },
        {
          role_key: "organisation_administrator",
          organization_id: ORG,
          church_id: CHURCH,
          branch_id: null,
        },
      ],
      ORG
    );
    assert.equal(preferred.role_key, "organisation_administrator");
    assert.equal(preferSessionRole([preferred], ORG).role_key, "organisation_administrator");
  });

  it("builds portals for catalogue HQ / branch / website personas", () => {
    const staff = filterValidStaffRolesForTenant(
      [
        {
          role_key: "organisation_administrator",
          organization_id: ORG,
          church_id: CHURCH,
        },
        {
          role_key: "website_editor",
          organization_id: ORG,
          church_id: CHURCH,
        },
        {
          role_key: "branch_administrator",
          organization_id: ORG,
          church_id: CHURCH,
          branch_id: BRANCH,
        },
      ],
      { organizationId: ORG, churchId: CHURCH, branchId: BRANCH }
    );
    const portals = buildPortalOptions(staff, false);
    assert.ok(portals.some((p) => p.href === "/hq"));
    assert.ok(portals.some((p) => p.href === "/branch-admin"));
    assert.ok(portals.some((p) => p.key === "website_editor"));
    assert.equal(portalKeyForCatalogueRole("auditor"), "auditor");
    assert.equal(isCatalogueHqRole("church_system_administrator"), true);
  });
});

describe("V2.02 BB catalogue-only — invite actor gates", () => {
  it("allows HQ catalogue actor to invite website_editor", () => {
    const gate = actorMayInvite(
      [
        {
          role_key: "organisation_administrator",
          organization_id: ORG,
          church_id: CHURCH,
        },
      ],
      { organizationId: ORG, churchId: CHURCH, branchId: null, roleKey: "website_editor" }
    );
    assert.equal(gate.ok, true);
    assert.ok(INVITE_ROLES.includes("website_editor"));
  });

  it("prevents branch administrator from self-elevating to organisation admin", () => {
    const gate = actorMayInvite(
      [
        {
          role_key: "branch_administrator",
          organization_id: ORG,
          church_id: CHURCH,
          branch_id: BRANCH,
        },
      ],
      {
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH,
        roleKey: "organisation_administrator",
      }
    );
    assert.equal(gate.ok, false);
    assert.equal(gate.reason, "role_escalation");
  });
});

describe("V2.02 BB catalogue-only — login eligibility", () => {
  it("authenticates catalogue-only website_editor without user_roles", async () => {
    const queries = [];
    const client = {
      async query(sql, params) {
        const text = String(sql).replace(/\s+/g, " ");
        queries.push(text);
        if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
          return { rows: [] };
        }
        if (text.includes("FROM blessboard.users") && text.includes("WHERE id = $1")) {
          return {
            rows: [
              {
                id: USER,
                email_normalized: "qa.website_editor@demo-church.example.test",
                display_name: "QA Website Editor",
                status: "active",
              },
            ],
          };
        }
        if (text.includes("FROM blessboard.user_role_assignments")) {
          return {
            rows: [
              {
                id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
                user_id: USER,
                organization_id: ORG,
                church_id: CHURCH,
                role_id: ROLE_WE_ID,
                scope_type: "church",
                scope_id: CHURCH,
                status: "active",
                assigned_by_user_id: null,
                assignment_origin: "system",
                assignment_reason: "test",
                expires_at: null,
                revoked_at: null,
                revoked_by_user_id: null,
                revocation_reason: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                role_key: "website_editor",
                is_sensitive: false,
              },
            ],
          };
        }
        if (text.includes("FROM blessboard.churches")) {
          return { rows: [] };
        }
        if (text.includes("blessboard.user_roles")) {
          throw new Error("legacy user_roles must not be queried for login eligibility");
        }
        if (text.includes("UPDATE blessboard.users") && text.includes("last_login")) {
          return { rows: [] };
        }
        if (text.includes("FROM blessboard.members") || text.includes("member")) {
          return { rows: [] };
        }
        throw new Error(`unexpected sql: ${text.slice(0, 160)}`);
      },
      release() {},
    };

    const result = await establishBlessBoardSession(
      {
        connect: async () => client,
      },
      {
        userId: USER,
        deploymentCode: "moovex-platform-v8-testing",
        requireOrganizationId: ORG,
        createSession: async () => ({
          ok: true,
          rawToken: "tok",
          session: { id: "sess" },
        }),
      }
    );
    assert.equal(result.ok, true);
    assert.equal(result.status, STATUS.AUTHENTICATED);
    assert.ok(result.roles.some((r) => r.roleKey === "website_editor"));
    assert.ok(!queries.some((q) => q.includes("blessboard.user_roles")));
  });

  it("denies login when catalogue assignments are missing", async () => {
    const client = {
      async query(sql) {
        const text = String(sql).replace(/\s+/g, " ");
        if (text === "BEGIN" || text === "ROLLBACK") return { rows: [] };
        if (text.includes("FROM blessboard.users")) {
          return {
            rows: [
              {
                id: USER,
                email_normalized: "x@demo-church.example.test",
                display_name: "X",
                status: "active",
              },
            ],
          };
        }
        if (text.includes("user_role_assignments")) return { rows: [] };
        if (text.includes("FROM blessboard.churches")) return { rows: [] };
        throw new Error(text.slice(0, 120));
      },
      release() {},
    };
    const result = await establishBlessBoardSession(
      { connect: async () => client },
      {
        userId: USER,
        deploymentCode: "moovex-platform-v8-testing",
        requireOrganizationId: ORG,
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.NO_ACTIVE_ROLE);
  });
});

describe("V2.02 BB catalogue-only — authorization without legacy union", () => {
  it("allows catalogue permission and does not call legacy compatibility", async () => {
    const db = {
      async query(sql, params) {
        const text = String(sql).replace(/\s+/g, " ");
        if (text.includes("FROM blessboard.users") && text.includes("status")) {
          return { rows: [{ id: USER, status: "active" }] };
        }
        if (text.includes("FROM blessboard.permissions")) {
          return {
            rows: [
              {
                id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                permission_key: "website.edit",
                resource_key: "website",
                action_key: "edit",
                display_name: "Edit",
                description: null,
                sensitivity: "standard",
                is_system: true,
                is_active: true,
              },
            ],
          };
        }
        if (text.includes("user_role_assignments")) {
          return {
            rows: [
              {
                id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
                user_id: USER,
                organization_id: ORG,
                church_id: CHURCH,
                role_id: ROLE_WE_ID,
                scope_type: "church",
                scope_id: CHURCH,
                status: "active",
                assigned_by_user_id: null,
                assignment_origin: "system",
                assignment_reason: null,
                expires_at: null,
                revoked_at: null,
                revoked_by_user_id: null,
                revocation_reason: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                role_key: "website_editor",
                is_sensitive: false,
              },
            ],
          };
        }
        if (text.includes("role_permissions")) {
          return { rows: [{ permission_key: "website.edit" }] };
        }
        if (text.includes("user_roles") || text.includes("legacy")) {
          throw new Error("legacy path should not run");
        }
        if (text.includes("branches")) {
          return { rows: [{ ok: true }] };
        }
        throw new Error(text.slice(0, 140));
      },
    };

    const allowed = await authorize(db, {
      actor: { userId: USER },
      permission: "website.edit",
      tenantContext: {
        resolved: true,
        organization: { id: ORG },
        church: { id: CHURCH },
        primaryBranch: { id: BRANCH },
      },
      resourceContext: {
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH,
      },
    });
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.reasonCode, REASON.ALLOWED);
    assert.equal(allowed.matchedAssignments[0].source, "assignment");

    const deniedPublish = await authorize(db, {
      actor: { userId: USER },
      permission: "website.publish",
      tenantContext: {
        resolved: true,
        organization: { id: ORG },
        church: { id: CHURCH },
        primaryBranch: { id: BRANCH },
      },
      resourceContext: {
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH,
      },
    });
    // Permission unknown or denied — mock only returns website.edit for role_permissions
    // and website.publish lookup needs permissions row. Force via missing perm.
    assert.equal(deniedPublish.allowed, false);
  });
});
