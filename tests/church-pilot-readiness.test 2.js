"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const websiteContentRepo = require("../src/db/pg/church/websiteContentRepo");
const blessboardAdminRoutes = require("../src/routes/blessboardAdmin");
const { ROLES } = require("../src/auth/roles");
const {
  CHECKLIST_ITEMS,
  CHECKLIST_ITEM_KEYS,
  looksLikePlaceholderText,
  isPlaceholderServiceTimes,
  isDemoLikeOrganisation,
  isReservedDemoHostSlug,
} = require("../src/church/pilotReadinessCatalogue");
const pilotReadinessService = require("../src/services/church/pilotReadinessService");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makePlatformApp(role) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-pilot-readiness",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isBlessBoardApexHost = true;
    if (role) {
      req.session.adminUser = {
        id: 55,
        username: "super@example.com",
        email: "super@example.com",
        display_name: "Super Admin",
        role,
      };
    }
    next();
  });
  app.use("/admin", blessboardAdminRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

function byKey(readiness) {
  const map = {};
  for (const item of readiness.items || []) map[item.key] = item;
  return map;
}

async function cleanup(pool, orgIds) {
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_pilot_readiness_approvals WHERE organization_id = $1`, [
      orgId,
    ]);
    await pool.query(`DELETE FROM public.church_pilot_readiness_item_notes WHERE organization_id = $1`, [
      orgId,
    ]);
    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_attendance_records WHERE organization_id = $1`, [orgId]).catch(
      () => {}
    );
    await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branch_website_content WHERE organization_id = $1`, [
      orgId,
    ]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("catalogue covers all required checklist items", () => {
  const expected = [
    "organisation_identity",
    "package_assigned",
    "primary_subdomain",
    "branch_configured",
    "branch_administrator",
    "service_schedule",
    "branding_uploaded",
    "public_contact",
    "public_pages_reviewed",
    "member_registration_tested",
    "attendance_tested",
    "safeguarding_roles",
    "finance_roles",
    "backup_status",
    "support_contact",
    "privacy_consent",
  ];
  assert.deepEqual(CHECKLIST_ITEM_KEYS, expected);
  assert.equal(CHECKLIST_ITEMS.length, 16);
  for (const item of CHECKLIST_ITEMS) {
    assert.ok(item.responsibleRole);
    assert.ok(item.label);
  }
});

test("placeholder-content detection", () => {
  assert.equal(isPlaceholderServiceTimes("Sunday · Contact the church office for service times"), true);
  assert.equal(isPlaceholderServiceTimes("Sundays 09:00 and 11:00"), false);
  assert.equal(looksLikePlaceholderText("Welcome home"), true);
  assert.equal(looksLikePlaceholderText("Update this story from the branch website editor"), true);
  assert.equal(looksLikePlaceholderText("Kafue Baptist gathers every Sunday at 09:00"), false);
  assert.equal(isReservedDemoHostSlug("demo"), true);
  assert.equal(isReservedDemoHostSlug("kafuebaptist"), false);
  assert.equal(
    isDemoLikeOrganisation({ slug: "demo", name: "Demo" }, { host_slug: "demo" }),
    true
  );
  assert.equal(
    isDemoLikeOrganisation({ slug: "kafuebaptist", name: "Kafue Baptist" }, { host_slug: "kafuebaptist" }),
    false
  );
});

test(
  "new, partial, complete, inactive branch, auth, isolation, placeholders",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("pilot");
    const passwordHash = await bcrypt.hash("testpass123456", 12);
    const orgIds = [];

    try {
      // --- New organisation (minimal) ---
      const fresh = await organizationsRepo.createOrganization(pool, {
        platform_tenant_id: TENANT_ZM,
        slug: `fresh_${suffix}`.slice(0, 40),
        name: `Fresh Org ${suffix}`,
      });
      orgIds.push(fresh.id);
      const freshReadiness = await pilotReadinessService.getOrganisationPilotReadiness(pool, fresh.id);
      const freshMap = byKey(freshReadiness);
      assert.equal(freshMap.organisation_identity.status, "incomplete");
      assert.equal(freshMap.branch_configured.status, "incomplete");
      assert.equal(freshMap.branch_administrator.status, "incomplete");
      assert.equal(freshMap.safeguarding_roles.status, "needs_review");
      assert.equal(freshReadiness.readyForApproval, false);

      // --- Partially configured (placeholder service times + inactive not used yet) ---
      const partial = await organizationsRepo.createOrganization(pool, {
        platform_tenant_id: TENANT_ZM,
        slug: `part_${suffix}`.slice(0, 40),
        name: `Partial Church ${suffix}`,
      });
      orgIds.push(partial.id);
      await organizationsRepo.updateOrganizationMetadataForPlatform(pool, partial.id, {
        name: `Partial Church ${suffix}`,
        slug: partial.slug,
        country: "ZM",
        city: "Lusaka",
        primary_contact_name: "Pastor Jane",
        primary_contact_email: `pastor_${suffix}@example.com`,
        primary_contact_phone: null,
      }, null);
      await organizationsRepo.updateOrganizationPlan(
        pool,
        partial.id,
        { plan_code: "foundation", plan_status: "active", plan_notes: null },
        null
      );
      const partialBranch = await branchesRepo.createBranch(pool, {
        organization_id: partial.id,
        slug: `partb_${suffix}`.slice(0, 30),
        host_slug: `partb_${suffix}`.slice(0, 30),
        name: "Main",
        status: "active",
        service_times: "Sunday · Contact the church office for service times",
        contact_phone: "0977000111",
        contact_email: `branch_${suffix}@example.com`,
        location_text: "Lusaka",
      });
      await branchAdminsRepo.createBranchAdmin(pool, {
        organization_id: partial.id,
        branch_id: partialBranch.id,
        full_name: "Branch Admin",
        email: `ba_${suffix}@example.com`,
        phone: "0977000222",
        password_hash: passwordHash,
        role: "branch_admin",
        status: "active",
      });
      await websiteContentRepo.upsertWebsiteDraftForBranch(pool, partialBranch.id, {
        organization_id: partial.id,
        homepage_hero_title: "Welcome",
        homepage_hero_subtitle: "Welcome home",
        welcome_message: `Welcome to Partial. Update this message from the branch website editor.`,
        service_times: "Sunday · Contact the church office for service times",
        location_text: "Lusaka",
        about_title: "About",
        about_body: "Part of the BlessBoard community. Update this story.",
        mission_text: "",
        vision_text: "",
        values_text: "",
        contact_phone: "0977000111",
        contact_email: `branch_${suffix}@example.com`,
        office_hours: "",
        address: "Lusaka",
        map_embed_placeholder: "",
        giving_bank_details: "",
        giving_mobile_money: "",
        giving_categories: "",
        giving_instructions: "",
        giving_qr_placeholder: "",
        footer_message: "",
      });
      await websiteContentRepo.publishWebsiteContentForBranch(pool, partialBranch.id, null);

      const partialReadiness = await pilotReadinessService.getOrganisationPilotReadiness(pool, partial.id);
      const partialMap = byKey(partialReadiness);
      assert.equal(partialMap.organisation_identity.status, "complete");
      assert.equal(partialMap.package_assigned.status, "complete");
      assert.equal(partialMap.branch_configured.status, "complete");
      assert.equal(partialMap.branch_administrator.status, "complete");
      assert.ok(["needs_review", "incomplete"].includes(partialMap.service_schedule.status));
      assert.equal(partialMap.service_schedule.placeholderDetected, true);
      assert.equal(partialMap.branding_uploaded.status, "needs_review");
      assert.equal(partialMap.branding_uploaded.placeholderDetected, true);
      assert.equal(partialMap.public_contact.status, "complete");
      assert.equal(partialReadiness.readyForApproval, false);

      // --- Inactive branch only ---
      const inactiveOrg = await organizationsRepo.createOrganization(pool, {
        platform_tenant_id: TENANT_ZM,
        slug: `inact_${suffix}`.slice(0, 40),
        name: `Inactive Org ${suffix}`,
      });
      orgIds.push(inactiveOrg.id);
      await organizationsRepo.updateOrganizationMetadataForPlatform(pool, inactiveOrg.id, {
        name: inactiveOrg.name,
        slug: inactiveOrg.slug,
        country: "ZM",
        city: "Lusaka",
        primary_contact_name: "Ops",
        primary_contact_email: `ops_${suffix}@example.com`,
      }, null);
      await organizationsRepo.updateOrganizationPlan(
        pool,
        inactiveOrg.id,
        { plan_code: "foundation", plan_status: "active", plan_notes: null },
        null
      );
      await branchesRepo.createBranch(pool, {
        organization_id: inactiveOrg.id,
        slug: `inb_${suffix}`.slice(0, 30),
        host_slug: `inb_${suffix}`.slice(0, 30),
        name: "Dormant Campus",
        status: "suspended",
        lifecycle_phase: "temporarily_inactive",
      });
      const inactiveReadiness = await pilotReadinessService.getOrganisationPilotReadiness(
        pool,
        inactiveOrg.id
      );
      const inactiveMap = byKey(inactiveReadiness);
      assert.equal(inactiveMap.branch_configured.status, "incomplete");
      assert.equal(inactiveMap.branch_administrator.status, "incomplete");
      assert.equal(inactiveMap.primary_subdomain.status, "incomplete");

      // --- Complete organisation path ---
      const completeOrg = await organizationsRepo.createOrganization(pool, {
        platform_tenant_id: TENANT_ZM,
        slug: `done_${suffix}`.slice(0, 40),
        name: `Ready Church ${suffix}`,
      });
      orgIds.push(completeOrg.id);
      await organizationsRepo.updateOrganizationMetadataForPlatform(pool, completeOrg.id, {
        name: completeOrg.name,
        slug: completeOrg.slug,
        country: "ZM",
        city: "Kafue",
        primary_contact_name: "Lead Pastor",
        primary_contact_email: `lead_${suffix}@example.com`,
        primary_contact_phone: "0977111222",
      }, null);
      await organizationsRepo.updateOrganizationPlan(
        pool,
        completeOrg.id,
        { plan_code: "growth", plan_status: "active", plan_notes: null },
        null
      );
      const completeBranch = await branchesRepo.createBranch(pool, {
        organization_id: completeOrg.id,
        slug: `doneb_${suffix}`.slice(0, 30),
        host_slug: `doneb_${suffix}`.slice(0, 30),
        name: "Main Campus",
        status: "active",
        service_times: "Sundays 09:00 and 11:00",
        contact_phone: "0977111222",
        contact_email: `office_${suffix}@example.com`,
        location_text: "Kafue Road",
        member_registration_enabled: true,
      });
      await branchAdminsRepo.createBranchAdmin(pool, {
        organization_id: completeOrg.id,
        branch_id: completeBranch.id,
        full_name: "Branch Admin Ready",
        email: `readyba_${suffix}@example.com`,
        phone: "0977333444",
        password_hash: passwordHash,
        role: "branch_admin",
        status: "active",
      });
      await websiteContentRepo.upsertWebsiteDraftForBranch(pool, completeBranch.id, {
        organization_id: completeOrg.id,
        homepage_hero_title: "Welcome to Ready Church",
        homepage_hero_subtitle: "A Christ-centered family in Kafue",
        welcome_message: "Join us for worship and community this week.",
        service_times: "Sundays 09:00 and 11:00",
        location_text: "Kafue Road",
        about_title: "About Ready Church",
        about_body: "Ready Church has served Kafue families for years with weekly worship and outreach.",
        mission_text: "Make disciples",
        vision_text: "A flourishing church",
        values_text: "Faith, hope, love",
        contact_phone: "0977111222",
        contact_email: `office_${suffix}@example.com`,
        office_hours: "Mon–Fri 09:00–16:00",
        address: "Kafue Road",
        map_embed_placeholder: "",
        giving_bank_details: "",
        giving_mobile_money: "",
        giving_categories: "",
        giving_instructions: "",
        giving_qr_placeholder: "",
        footer_message: "Visit us this Sunday.",
      });
      await websiteContentRepo.publishWebsiteContentForBranch(pool, completeBranch.id, null);
      await pool.query(
        `INSERT INTO public.church_members (
           organization_id, branch_id, platform_tenant_id,
           full_name, email, phone, phone_normalized, password_hash, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'verified')`,
        [
          completeOrg.id,
          completeBranch.id,
          TENANT_ZM,
          "Test Member",
          `member_${suffix}@example.com`,
          "",
          "",
          "hash",
        ]
      );
      await pool.query(
        `INSERT INTO public.church_attendance_records (
           organization_id, branch_id, service_date, adults_count, children_count, status
         ) VALUES ($1,$2, CURRENT_DATE, 12, 3, 'submitted')`,
        [completeOrg.id, completeBranch.id]
      ).catch(async () => {
        await pool.query(
          `INSERT INTO public.church_attendance_records (
             organization_id, branch_id, service_date, total_count
           ) VALUES ($1,$2, CURRENT_DATE, 15)`,
          [completeOrg.id, completeBranch.id]
        );
      });

      let completeReadiness = await pilotReadinessService.getOrganisationPilotReadiness(
        pool,
        completeOrg.id
      );
      let completeMap = byKey(completeReadiness);
      assert.equal(completeMap.organisation_identity.status, "complete");
      assert.equal(completeMap.package_assigned.status, "complete");
      assert.equal(completeMap.primary_subdomain.status, "complete");
      assert.equal(completeMap.branch_configured.status, "complete");
      assert.equal(completeMap.branch_administrator.status, "complete");
      assert.equal(completeMap.service_schedule.status, "complete");
      assert.equal(completeMap.branding_uploaded.status, "complete");
      assert.equal(completeMap.public_contact.status, "complete");
      assert.equal(completeMap.attendance_tested.status, "complete");
      assert.equal(completeMap.member_registration_tested.status, "complete");
      assert.ok(completeMap.public_pages_reviewed.status === "needs_review");

      // Mark remaining manual / needs_review items complete
      for (const key of CHECKLIST_ITEM_KEYS) {
        const item = completeMap[key];
        if (item.status !== "complete") {
          await pilotReadinessService.upsertItemNote(pool, {
            organizationId: completeOrg.id,
            itemKey: key,
            note: "Reviewed for pilot",
            manualStatus: "complete",
            actorType: "platform_admin",
            actorId: 55,
          });
        }
      }

      completeReadiness = await pilotReadinessService.getOrganisationPilotReadiness(pool, completeOrg.id);
      assert.equal(completeReadiness.readyForApproval, true);
      assert.equal(completeReadiness.counts.incomplete, 0);
      assert.equal(completeReadiness.counts.needs_review, 0);

      const approved = await pilotReadinessService.recordPilotApproval(pool, {
        organizationId: completeOrg.id,
        note: "Pilot ready",
        actorType: "platform_admin",
        actorId: 55,
        actorLabel: "Super Admin",
      });
      assert.ok(approved.approval.approved_at);
      assert.equal(approved.readiness.approval.approvedByLabel, "Super Admin");

      // Tenant isolation: note on complete org does not appear on partial
      await pilotReadinessService.upsertItemNote(pool, {
        organizationId: completeOrg.id,
        itemKey: "backup_status",
        note: "SECRET_NOTE_ORG_COMPLETE",
        manualStatus: "complete",
        actorType: "platform_admin",
        actorId: 55,
      });
      const other = await pilotReadinessService.getOrganisationPilotReadiness(pool, partial.id);
      const otherNotes = JSON.stringify(other.items);
      assert.doesNotMatch(otherNotes, /SECRET_NOTE_ORG_COMPLETE/);

      // Unauthorised access
      const denied = await request(makePlatformApp(null))
        .get(`/admin/church/organizations/${completeOrg.id}/pilot-readiness`)
        .set("Host", "blessboard.com");
      assert.ok([302, 401, 403].includes(denied.status));

      const tenantManager = await request(makePlatformApp(ROLES.TENANT_MANAGER))
        .get(`/admin/church/organizations/${completeOrg.id}/pilot-readiness`)
        .set("Host", "blessboard.com");
      assert.ok([302, 401, 403].includes(tenantManager.status));

      const allowed = await request(makePlatformApp(ROLES.SUPER_ADMIN))
        .get(`/admin/church/organizations/${completeOrg.id}/pilot-readiness`)
        .set("Host", "blessboard.com");
      assert.equal(allowed.status, 200);
      assert.match(allowed.text, /Pilot readiness/);
      assert.match(allowed.text, /Ready Church/);
      assert.match(allowed.text, /Pilot approved|Super Admin/);

      // Demo / placeholder organisation detection (name-based; reserved slug covered in unit tests)
      const demoOrg = await organizationsRepo.createOrganization(pool, {
        platform_tenant_id: TENANT_ZM,
        slug: `demox_${suffix}`.slice(0, 40),
        name: `BlessBoard Demo ${suffix}`,
      });
      orgIds.push(demoOrg.id);
      await organizationsRepo.updateOrganizationMetadataForPlatform(pool, demoOrg.id, {
        name: demoOrg.name,
        slug: demoOrg.slug,
        country: "ZM",
        city: "Lusaka",
        primary_contact_name: "Demo",
        primary_contact_email: `demo_${suffix}@example.com`,
      }, null);
      await organizationsRepo.updateOrganizationPlan(
        pool,
        demoOrg.id,
        { plan_code: "foundation", plan_status: "active", plan_notes: null },
        null
      );
      await branchesRepo.createBranch(pool, {
        organization_id: demoOrg.id,
        slug: `demob_${suffix}`.slice(0, 30),
        host_slug: `demob_${suffix}`.slice(0, 30),
        name: "Demo Branch",
        status: "active",
      });
      const demoReadiness = await pilotReadinessService.getOrganisationPilotReadiness(pool, demoOrg.id);
      const demoMap = byKey(demoReadiness);
      assert.equal(demoReadiness.demoLike, true);
      assert.equal(demoMap.organisation_identity.status, "needs_review");
      assert.equal(demoMap.organisation_identity.placeholderDetected, true);
    } finally {
      await cleanup(pool, orgIds);
    }
  }
);
