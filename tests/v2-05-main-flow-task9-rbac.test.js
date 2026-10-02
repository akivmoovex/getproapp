"use strict";

/**
 * V2.05 Task 9 — Main Flow RBAC.
 * Authorization for dashboard / website / content / publish across AC + BB roles.
 * Server gates remain authoritative; UI must not offer Publish without canPublish.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { PRODUCT_CODE } = require("../src/platform/website/publicWebsiteUrl");
const {
  PRODUCT_ROLE_GRANTS,
  grantsForProductRole,
  assertWebsiteAction,
  canPublishWebsite,
  canEditWebsite,
  PERMISSIONS,
} = require("../src/platform/website-engine/permissionHooks");
const {
  buildWebsiteManagementHub,
  defaultAcWebsiteHubPaths,
  defaultBbWebsiteHubPaths,
} = require("../src/platform/website/websiteManagementHub");
const {
  buildPublishWorkflowPaths,
  attachPublishWorkflowToHub,
  safePublishReturnTo,
  ENTRY,
} = require("../src/platform/website/publishWorkflow");
const {
  assertWebsiteInstanceScope,
} = require("../src/platform/website/authorizeWebsite");
const {
  buildActiveClinicNavigation,
} = require("../src/activeclinic/services/activeClinicNavigation");
const { HQ_ADMIN_NAV } = require("../src/blessboard/http/hqAdminNav");
const {
  validateAdminConsoleNavOrder,
} = require("../src/platform/admin-console/adminConsoleShell");
const {
  BB_PERMISSION_MATRIX,
  AC_PERMISSION_MATRIX,
  forgeTenantBody,
} = require("./helpers/authzNegativeHelpers");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function hubFor(productCode, caps, extra) {
  const paths =
    productCode === PRODUCT_CODE.ACTIVECLINIC
      ? defaultAcWebsiteHubPaths({
          clinicKey: "demo-clinic",
          actions: {
            editWebsite: "/clinics/demo-clinic?website_edit=1",
            preview: "/clinics/demo-clinic?website_mode=draft",
            history: "/clinics/demo-clinic/website/history",
          },
        })
      : defaultBbWebsiteHubPaths({
          organizationKey: "demo-church",
          branchKey: extra && extra.branchKey,
          actions: {
            editWebsite: "/c/demo-church?website_edit=1",
            preview: "/hq/content/preview/home",
            history: "/hq/website/publishing-history",
          },
        });
  return buildWebsiteManagementHub({
    productCode,
    paths,
    capabilities: caps,
    draftChangesCount: 5,
    liveAvailable: true,
    exists: true,
    publicUrl:
      productCode === PRODUCT_CODE.ACTIVECLINIC
        ? "/clinics/demo-clinic"
        : "/c/demo-church",
    clinicKey: "demo-clinic",
    organizationKey:
      productCode === PRODUCT_CODE.ACTIVECLINIC ? "demo-clinic" : "demo-church",
    branchKey: extra && extra.branchKey,
    ...(extra || {}),
  });
}

describe("V2.05 Main Flow RBAC Task9", () => {
  it("FINAL=V205_MAIN_FLOW_RBAC_DONE", () => {
    assert.ok(PRODUCT_ROLE_GRANTS.activeclinic);
    assert.ok(PRODUCT_ROLE_GRANTS.blessboard);
    assert.equal(PERMISSIONS.PUBLISH, "website.publish");
    assert.equal(PERMISSIONS.EDIT, "website.edit");
  });

  it("role grants — AC org admin / editor / BB HQ / branch / publisher / restricted", () => {
    const acOrg = grantsForProductRole(
      PRODUCT_CODE.ACTIVECLINIC,
      "activeclinic_organization_admin"
    );
    assert.equal(canEditWebsite(acOrg), true);
    assert.equal(canPublishWebsite(acOrg), true);
    assert.equal(assertWebsiteAction(acOrg, "publish").ok, true);

    const acEditor = grantsForProductRole(
      PRODUCT_CODE.ACTIVECLINIC,
      "activeclinic_website_editor"
    );
    assert.equal(canEditWebsite(acEditor), true);
    assert.equal(canPublishWebsite(acEditor), false);
    assert.equal(assertWebsiteAction(acEditor, "publish").ok, false);
    assert.equal(assertWebsiteAction(acEditor, "edit").ok, true);

    const bbHq = grantsForProductRole(PRODUCT_CODE.BLESSBOARD, "church_hq_admin");
    assert.equal(canPublishWebsite(bbHq), true);
    assert.equal(canEditWebsite(bbHq), true);

    const bbBranch = grantsForProductRole(PRODUCT_CODE.BLESSBOARD, "branch_admin");
    assert.equal(canEditWebsite(bbBranch), true);
    // Engine role map: branch_admin edits/submits; publish requires website.publish grant.
    assert.equal(canPublishWebsite(bbBranch), false);
    assert.equal(assertWebsiteAction(bbBranch, "publish").ok, false);

    const publisher = grantsForProductRole(
      PRODUCT_CODE.BLESSBOARD,
      "website_publisher"
    );
    assert.equal(canPublishWebsite(publisher), true);
    assert.equal(canEditWebsite(publisher), false);

    const restricted = grantsForProductRole(
      PRODUCT_CODE.ACTIVECLINIC,
      "activeclinic_receptionist"
    );
    assert.deepEqual(restricted, []);
    assert.equal(canEditWebsite(restricted), false);
    assert.equal(canPublishWebsite(restricted), false);

    // Location/facility admin is not a website publisher via engine role map.
    const facility = grantsForProductRole(
      PRODUCT_CODE.ACTIVECLINIC,
      "activeclinic_facility_admin"
    );
    assert.deepEqual(facility, []);
    assert.equal(canPublishWebsite(facility), false);

    assert.equal(AC_PERMISSION_MATRIX["website.publish"].activeclinic_organization_admin, true);
    assert.equal(AC_PERMISSION_MATRIX["website.publish"].activeclinic_website_editor, false);
    assert.equal(BB_PERMISSION_MATRIX["website.publish"].church_hq_admin, true);
    assert.equal(BB_PERMISSION_MATRIX["website.publish"].website_editor, false);
  });

  it("dashboard + website + content scope — nav RBAC and Dashboard/Website order", () => {
    const acAdmin = buildActiveClinicNavigation([
      "website.view",
      "website.edit",
      "website.publish",
      "activeclinic.access",
    ]);
    assert.equal(acAdmin.items[0].key, "home");
    assert.ok(acAdmin.items.find((i) => i.key === "website"));
    const acOrder = validateAdminConsoleNavOrder(
      acAdmin.items.map((i) => ({
        slot: i.slot || (i.key === "home" ? "dashboard" : i.key),
        href: i.href,
      }))
    );
    assert.equal(acOrder.dashboardFirst, true);

    const restricted = buildActiveClinicNavigation(["activeclinic.access"]);
    assert.equal(restricted.items[0].key, "home");
    assert.ok(!restricted.items.find((i) => i.key === "website"));

    const bbNav = HQ_ADMIN_NAV.filter((i) => i.nav !== false && i.enabled !== false);
    const bbSlots = bbNav.map((i) => ({ slot: i.slot, href: i.href }));
    const bbOrder = validateAdminConsoleNavOrder(bbSlots);
    assert.equal(bbOrder.ok, true);
    assert.equal(bbOrder.dashboardFirst, true);
    assert.equal(bbOrder.websiteSecond, true);
  });

  it("publish authorization — editor denied; publisher/org/HQ allowed in hub UI", () => {
    const editorHub = hubFor(PRODUCT_CODE.ACTIVECLINIC, {
      canEdit: true,
      canPublish: false,
    });
    assert.ok(editorHub.modules.some((m) => m.key === "edit"));
    assert.ok(!editorHub.modules.some((m) => m.key === "publish"));
    assert.equal(editorHub.publishNudge.actions.publish.available, false);
    assert.equal(editorHub.publishNudge.actions.publish.href, null);
    assert.equal(editorHub.publishWorkflow.confirmPath, null);
    assert.equal(editorHub.publishWorkflow.reviewPath, null);

    const publisherHub = hubFor(PRODUCT_CODE.ACTIVECLINIC, {
      canEdit: false,
      canPublish: true,
    });
    assert.ok(!publisherHub.modules.some((m) => m.key === "edit"));
    assert.ok(publisherHub.modules.some((m) => m.key === "publish"));
    assert.equal(publisherHub.publishWorkflow.reviewPath, "/app/settings/website/publish");

    const hqHub = hubFor(PRODUCT_CODE.BLESSBOARD, {
      canEdit: true,
      canPublish: true,
    });
    assert.ok(hqHub.modules.some((m) => m.key === "publish"));
    assert.equal(hqHub.publishWorkflow.reviewPath, "/hq/website/publish/review");

    const branchEditorHub = hubFor(
      PRODUCT_CODE.BLESSBOARD,
      { canEdit: true, canPublish: false },
      { branchKey: "north" }
    );
    assert.ok(!branchEditorHub.modules.some((m) => m.key === "publish"));
    assert.equal(branchEditorHub.publishWorkflow.confirmPath, null);

    const stripped = attachPublishWorkflowToHub(
      {
        productCode: PRODUCT_CODE.BLESSBOARD,
        modules: [
          { key: "edit", href: "/edit" },
          { key: "publish", href: "/hq/website/publish/review" },
        ],
      },
      { canPublish: false, organizationKey: "demo-church" }
    );
    assert.ok(!stripped.modules.some((m) => m.key === "publish"));
    assert.equal(stripped.publishWorkflow.confirmPath, null);
  });

  it("direct URL denial — publish workflow omits mutation paths without canPublish", () => {
    for (const productCode of [PRODUCT_CODE.ACTIVECLINIC, PRODUCT_CODE.BLESSBOARD]) {
      const denied = buildPublishWorkflowPaths({
        productCode,
        organizationKey: "demo",
        canPublish: false,
        canEdit: true,
        entry: ENTRY.ADMIN_CONSOLE,
      });
      assert.equal(denied.canPublish, false);
      assert.equal(denied.reviewPath, null);
      assert.equal(denied.confirmPath, null);
      assert.equal(denied.publishPath, null);
      assert.equal(denied.editorPublishPath, null);
      assert.equal(denied.unpublishPath, null);
    }

    const acRoutes = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    assert.match(acRoutes, /canPublishClinicWebsite\(req, clinic\)/);
    assert.match(acRoutes, /return json\(res, 403, \{ ok: false, code: \"forbidden\" \}/);

    const bbRoutes = read("src/blessboard/http/churchWebsiteAdminRoutes.js");
    assert.match(bbRoutes, /createRequireBlessBoardPermission\(\"website\.publish\"/);
    assert.match(bbRoutes, /router\.post\(\"\/hq\/website\/publish\"/);

    const bbEditor = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    assert.match(bbEditor, /permission: \"website\.publish\"/);
    assert.match(bbEditor, /requireEditor\(req, res, \"website\.publish\"\)/);

    const contentAdmin = read("views/blessboard/v5/content-admin/page.ejs");
    assert.match(contentAdmin, /canPublishWebsite !== 'undefined' \? Boolean\(canPublishWebsite\) : false/);
  });

  it("tenant isolation + branch/location scope", () => {
    const ok = assertWebsiteInstanceScope(
      { organizationId: "11111111-1111-4111-8111-111111111111", productCode: "activeclinic" },
      {
        organizationId: "11111111-1111-4111-8111-111111111111",
        expectedProductCode: "activeclinic",
      }
    );
    assert.equal(ok.ok, true);

    const cross = assertWebsiteInstanceScope(
      { organizationId: "11111111-1111-4111-8111-111111111111", productCode: "activeclinic" },
      {
        organizationId: "22222222-2222-4222-8222-222222222222",
        expectedProductCode: "activeclinic",
      }
    );
    assert.equal(cross.ok, false);
    assert.equal(cross.code, "tenant_mismatch");

    const forged = forgeTenantBody();
    assert.ok(forged.organizationId);
    assert.ok(forged.branchId);
    assert.ok(forged.facilityId);

    assert.equal(
      safePublishReturnTo("/clinics/other/website", {
        productCode: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: "demo-clinic",
      }),
      null
    );
    assert.equal(
      safePublishReturnTo("/app/settings/website", {
        productCode: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: "demo-clinic",
      }),
      "/app/settings/website"
    );
    assert.equal(
      safePublishReturnTo("/clinics/demo-clinic?website_edit=1", {
        productCode: PRODUCT_CODE.ACTIVECLINIC,
        organizationKey: "demo-clinic",
      }),
      "/clinics/demo-clinic?website_edit=1"
    );
    assert.equal(
      safePublishReturnTo("/hq/website/publish/success", {
        productCode: PRODUCT_CODE.BLESSBOARD,
        organizationKey: "demo-church",
      }),
      "/hq/website/publish/success"
    );

    const bbBranchPaths = buildPublishWorkflowPaths({
      productCode: PRODUCT_CODE.BLESSBOARD,
      organizationKey: "demo-church",
      branchKey: "north-campus",
      canPublish: true,
      entry: ENTRY.ADMIN_CONSOLE,
    });
    assert.match(bbBranchPaths.reviewPath, /\/hq\/website\/branches\/north-campus\/publish\/review/);
    assert.match(bbBranchPaths.confirmPath, /\/hq\/website\/branches\/north-campus\/publish$/);

    const chrome = read("src/activeclinic/http/attachActiveClinicWebsiteChrome.js");
    assert.match(chrome, /function sameClinicOrganization/);
    assert.match(chrome, /auth\.organization && auth\.organization\.id === clinic\.organizationId/);

    const bbChrome = read("src/blessboard/http/attachWebsiteAdminChrome.js");
    assert.match(bbChrome, /permission: \"website\.publish\"/);
    assert.match(bbChrome, /BB-BUG-001|website\.edit alone/);
  });
});
