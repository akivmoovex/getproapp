"use strict";

/**
 * V7 QA hardening: shared website lifecycle operations authorize through the one
 * canonical combined entrypoint (tenancy + instance + permission).
 *
 * Each lifecycle service used to re-derive this decision itself, which is how six
 * route authorization gaps went unnoticed. These tests pin the combined contract
 * so a future service cannot quietly reintroduce its own weaker variant.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { authorizeWebsiteAction } = require("../src/platform/website/authorizeWebsite");
const { PERMISSIONS } = require("../src/platform/website/permissions");
const publicationService = require("../src/platform/website/publicationService");

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const INSTANCE = "33333333-3333-4333-8333-333333333333";

function instanceRow(overrides) {
  return {
    id: INSTANCE,
    organization_id: ORG_A,
    product_code: "activeclinic",
    template_version: 1,
    status: "active",
    publish_policy: "AUTO_PUBLISH",
    edit_locked: false,
    publish_locked: false,
    ...overrides,
  };
}

/** A db stub that returns one website_instances row for any lookup. */
function dbWith(row) {
  return { query: async () => ({ rows: row ? [row] : [] }) };
}

describe("V7 shared website authorization entrypoint", () => {
  describe("authorizeWebsiteAction", () => {
    it("allows an actor holding the required permission", async () => {
      const result = await authorizeWebsiteAction(dbWith(instanceRow()), {
        organizationId: ORG_A,
        instanceId: INSTANCE,
        grantedPermissions: [PERMISSIONS.PUBLISH],
        permission: PERMISSIONS.PUBLISH,
      });
      assert.equal(result.ok, true);
      assert.equal(result.instance.id, INSTANCE);
    });

    it("denies an actor missing the required permission", async () => {
      const result = await authorizeWebsiteAction(dbWith(instanceRow()), {
        organizationId: ORG_A,
        instanceId: INSTANCE,
        grantedPermissions: [PERMISSIONS.VIEW, PERMISSIONS.EDIT],
        permission: PERMISSIONS.PUBLISH,
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, "forbidden");
    });

    it("treats anyPermission as satisfied by a single matching grant", async () => {
      for (const grant of [PERMISSIONS.ROLLBACK, PERMISSIONS.RESTORE]) {
        const result = await authorizeWebsiteAction(dbWith(instanceRow()), {
          organizationId: ORG_A,
          instanceId: INSTANCE,
          grantedPermissions: [grant],
          anyPermission: [PERMISSIONS.ROLLBACK, PERMISSIONS.RESTORE],
        });
        assert.equal(result.ok, true, `grant ${grant} should authorize`);
      }

      const denied = await authorizeWebsiteAction(dbWith(instanceRow()), {
        organizationId: ORG_A,
        instanceId: INSTANCE,
        grantedPermissions: [PERMISSIONS.EDIT],
        anyPermission: [PERMISSIONS.ROLLBACK, PERMISSIONS.RESTORE],
      });
      assert.equal(denied.ok, false);
      assert.equal(denied.code, "forbidden");
    });

    it("checks permission only when the caller supplies grants", async () => {
      // Products whose authorization lives in route middleware (BlessBoard) call
      // these services without grants. Enforcing here would deny them outright, so
      // an omitted list must still yield tenancy and scope checking only.
      const result = await authorizeWebsiteAction(dbWith(instanceRow()), {
        organizationId: ORG_A,
        instanceId: INSTANCE,
      });
      assert.equal(result.ok, true);
    });

    it("rejects a cross-tenant instance before any permission check", async () => {
      const result = await authorizeWebsiteAction(dbWith(instanceRow({ organization_id: ORG_B })), {
        organizationId: ORG_A,
        instanceId: INSTANCE,
        grantedPermissions: [PERMISSIONS.PUBLISH],
        permission: PERMISSIONS.PUBLISH,
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, "tenant_mismatch");
      assert.equal(result.instance, null);
    });

    it("rejects an instance belonging to another product", async () => {
      const result = await authorizeWebsiteAction(dbWith(instanceRow()), {
        organizationId: ORG_A,
        instanceId: INSTANCE,
        expectedProductCode: "blessboard",
        grantedPermissions: [PERMISSIONS.PUBLISH],
        permission: PERMISSIONS.PUBLISH,
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, "tenant_mismatch");
    });

    it("reports a missing instance rather than authorizing", async () => {
      const result = await authorizeWebsiteAction(dbWith(null), {
        organizationId: ORG_A,
        instanceId: INSTANCE,
        grantedPermissions: [PERMISSIONS.PUBLISH],
        permission: PERMISSIONS.PUBLISH,
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, "website_instance_not_found");
    });
  });

  describe("lifecycle services enforce through the entrypoint", () => {
    it("publish denies an actor without website.publish", async () => {
      const result = await publicationService.publishWebsiteDraft(dbWith(instanceRow()), {
        organizationId: ORG_A,
        instanceId: INSTANCE,
        grantedPermissions: [PERMISSIONS.VIEW, PERMISSIONS.EDIT],
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, "forbidden");
    });

    it("publish keeps the review-before-publish policy lock above permission", async () => {
      // A publish grant must not convert a policy-locked site into direct publish.
      const result = await publicationService.publishWebsiteDraft(
        dbWith(instanceRow({ publish_policy: "REVIEW_BEFORE_PUBLISH" })),
        {
          organizationId: ORG_A,
          instanceId: INSTANCE,
          grantedPermissions: [PERMISSIONS.PUBLISH],
        }
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, "website_policy_locked");
    });

    it("publish still refuses a platform-locked site", async () => {
      const result = await publicationService.publishWebsiteDraft(
        dbWith(instanceRow({ publish_locked: true })),
        {
          organizationId: ORG_A,
          instanceId: INSTANCE,
          grantedPermissions: [PERMISSIONS.PUBLISH],
        }
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, "website_publish_locked");
    });

    it("restore-to-draft denies an actor without rollback or restore", async () => {
      const result = await publicationService.restoreWebsiteVersionToDraft(dbWith(instanceRow()), {
        organizationId: ORG_A,
        instanceId: INSTANCE,
        versionId: "44444444-4444-4444-8444-444444444444",
        grantedPermissions: [PERMISSIONS.VIEW, PERMISSIONS.EDIT, PERMISSIONS.PUBLISH],
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, "forbidden");
    });

    it("restore-live denies an actor without rollback or restore", async () => {
      const result = await publicationService.restoreWebsiteVersionLive(dbWith(instanceRow()), {
        organizationId: ORG_A,
        instanceId: INSTANCE,
        versionId: "44444444-4444-4444-8444-444444444444",
        grantedPermissions: [PERMISSIONS.EDIT],
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, "forbidden");
    });

    it("unpublish denies an actor holding neither publish nor take-offline", async () => {
      const result = await publicationService.unpublishWebsite(dbWith(instanceRow()), {
        organizationId: ORG_A,
        instanceId: INSTANCE,
        grantedPermissions: [PERMISSIONS.VIEW, PERMISSIONS.EDIT],
      });
      assert.equal(result.ok, false);
      assert.equal(result.code, "forbidden");
    });

    it("every lifecycle op rejects a cross-tenant instance", async () => {
      const crossTenant = dbWith(instanceRow({ organization_id: ORG_B }));
      const calls = [
        ["publishWebsiteDraft", { grantedPermissions: [PERMISSIONS.PUBLISH] }],
        ["unpublishWebsite", { grantedPermissions: [PERMISSIONS.PUBLISH] }],
        ["restoreWebsiteVersionLive", { grantedPermissions: [PERMISSIONS.ROLLBACK] }],
        ["restoreWebsiteVersionToDraft", { grantedPermissions: [PERMISSIONS.ROLLBACK] }],
      ];
      for (const [name, extra] of calls) {
        const result = await publicationService[name](crossTenant, {
          organizationId: ORG_A,
          instanceId: INSTANCE,
          versionId: "44444444-4444-4444-8444-444444444444",
          ...extra,
        });
        assert.equal(result.ok, false, `${name} must reject a cross-tenant instance`);
        assert.equal(result.code, "tenant_mismatch", `${name} code`);
      }
    });
  });
});
