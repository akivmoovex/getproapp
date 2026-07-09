"use strict";

const bcrypt = require("bcryptjs");
const organizationsRepo = require("../db/pg/church/organizationsRepo");
const branchesRepo = require("../db/pg/church/branchesRepo");
const branchAdminsRepo = require("../db/pg/church/branchAdminsRepo");
const announcementsRepo = require("../db/pg/church/announcementsRepo");
const eventsRepo = require("../db/pg/church/eventsRepo");
const ministriesRepo = require("../db/pg/church/ministriesRepo");
const tenantsRepo = require("../db/pg/tenantsRepo");

const DEMO_ORG_SLUG = "demo";
const DEMO_HOST_SLUG = "demo";
const DEMO_BRANCH_ADMIN_EMAIL = "admin@demo.blessboard.com";

async function seedDemoBranchAdminIfMissing(pool, org, branch) {
  const existing = await branchAdminsRepo.findBranchAdminByEmailForBranch(pool, branch.id, DEMO_BRANCH_ADMIN_EMAIL);
  if (existing) return existing;

  const passwordHash = await bcrypt.hash("testpass123", 12);
  return branchAdminsRepo.createBranchAdmin(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    full_name: "Demo Branch Admin",
    email: DEMO_BRANCH_ADMIN_EMAIL,
    phone: "0977111222",
    password_hash: passwordHash,
    role: "branch_admin",
    status: "active",
  });
}

async function seedDemoPublicContentIfMissing(pool, org, branch) {
  const existingAnnouncements = await announcementsRepo.listAnnouncementsForBranch(pool, branch.id, {
    status: "all",
  });
  if (existingAnnouncements.length > 0) return;

  await announcementsRepo.createAnnouncementForBranch(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    title: "Welcome to BlessBoard Demo Church",
    body: "This is a live demo site for BlessBoard — explore the public website and register as a member to try the portal.",
    category: "General",
    audience: "public",
    status: "published",
    publish_at: new Date(),
    created_by_admin_id: null,
  });

  await announcementsRepo.createAnnouncementForBranch(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    title: "Member registration is open",
    body: "Use the Register link to create a demo member account. Branch admins can verify registrations in the branch admin portal.",
    category: "Membership",
    audience: "public",
    status: "published",
    publish_at: new Date(),
    created_by_admin_id: null,
  });

  const future = new Date();
  future.setDate(future.getDate() + 7);
  const eventDate = future.toISOString().slice(0, 10);

  await eventsRepo.createEventForBranch(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    title: "Sunday Worship Service",
    description: "Weekly worship open to the community. Join us in person or follow announcements in the member portal.",
    event_date: eventDate,
    start_time: "10:00 AM",
    end_time: "12:00 PM",
    location: "Main sanctuary",
    visibility: "public",
    status: "published",
    created_by_admin_id: null,
  });

  await eventsRepo.createEventForBranch(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    title: "BlessBoard Demo Fellowship",
    description: "A sample fellowship event for the BlessBoard demo church site.",
    event_date: eventDate,
    start_time: "1:00 PM",
    end_time: "2:30 PM",
    location: "Fellowship hall",
    visibility: "public",
    status: "published",
    created_by_admin_id: null,
  });

  const ministries = await ministriesRepo.listMinistriesForBranch(pool, branch.id, { status: "all" });
  if (ministries.length === 0) {
    await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      name: "Worship Team",
      slug: "worship-team",
      description: "Leading music and worship during services.",
      leader_name: "Alex Demo",
      meeting_day: "Saturday",
      meeting_time: "3:00 PM",
      location: "Sanctuary",
      visibility: "public",
      status: "published",
      created_by_admin_id: null,
    });
    await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      name: "Youth Ministry",
      slug: "youth-ministry",
      description: "Discipleship and community for young people.",
      leader_name: "Jordan Demo",
      meeting_day: "Friday",
      meeting_time: "5:00 PM",
      location: "Youth hall",
      visibility: "public",
      status: "published",
      created_by_admin_id: null,
    });
  }
}

/**
 * Idempotent production-safe seed for demo.blessboard.com (BlessBoard demo church).
 * @param {import("pg").Pool} pool
 */
async function seedChurchDemoOrganizationIfMissing(pool) {
  let org = await organizationsRepo.findOrganizationBySlug(pool, DEMO_ORG_SLUG);

  if (!org) {
    const demoTenant = await tenantsRepo.getBySlug(pool, "demo");
    const globalTenant = await tenantsRepo.getBySlug(pool, "global");
    const platformTenantId =
      (demoTenant && demoTenant.id) || (globalTenant && globalTenant.id) || 1;

    org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: platformTenantId,
      slug: DEMO_ORG_SLUG,
      name: "BlessBoard Demo Church",
      status: "active",
    });
  }

  let branch = await branchesRepo.findBranchByHostSlug(pool, DEMO_HOST_SLUG);
  if (!branch) {
    branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      host_slug: DEMO_HOST_SLUG,
      name: "BlessBoard Demo Church",
      status: "active",
      city: "Lusaka",
      country: "Zambia",
      pastor_name: "Rev. Demo Pastor",
      contact_email: "hello@demo.blessboard.com",
      contact_phone: "+260 97 000 0000",
      welcome_message:
        "Welcome to BlessBoard Demo Church — a sample church site powered by BlessBoard. Explore our public pages and register as a member to try the portal.",
      service_times: "Sunday Worship · 10:00 AM\nMidweek Prayer · Wednesday 6:30 PM",
      location_text: "123 BlessBoard Avenue, Demo City",
    });
  }

  await seedDemoPublicContentIfMissing(pool, org, branch);
  await seedDemoBranchAdminIfMissing(pool, org, branch);

  return { organization: org, branch };
}

module.exports = {
  seedChurchDemoOrganizationIfMissing,
  DEMO_ORG_SLUG,
  DEMO_HOST_SLUG,
  DEMO_BRANCH_ADMIN_EMAIL,
};
