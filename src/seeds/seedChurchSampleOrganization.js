"use strict";

const bcrypt = require("bcryptjs");
const organizationsRepo = require("../db/pg/church/organizationsRepo");
const branchesRepo = require("../db/pg/church/branchesRepo");
const branchAdminsRepo = require("../db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../db/pg/church/hqAdminsRepo");
const announcementsRepo = require("../db/pg/church/announcementsRepo");
const eventsRepo = require("../db/pg/church/eventsRepo");
const ministriesRepo = require("../db/pg/church/ministriesRepo");
const ministryLeadersRepo = require("../db/pg/church/ministryLeadersRepo");
const tenantsRepo = require("../db/pg/tenantsRepo");

const SAMPLE_ORG_SLUG = "kafuebaptist";
const SAMPLE_BRANCH_ADMIN_EMAIL = "pastor.kafue@example.com";
const SAMPLE_HQ_ADMIN_EMAIL = "hq.kafue@example.com";
const SAMPLE_MINISTRY_LEADER_EMAIL = "youth.leader@example.com";

async function seedChurchSampleHqAdminIfMissing(pool, org) {
  const existing = await hqAdminsRepo.findHqAdminByEmailForOrganization(pool, org.id, SAMPLE_HQ_ADMIN_EMAIL);
  if (existing) return existing;

  const passwordHash = await bcrypt.hash("testpass123", 12);
  return hqAdminsRepo.createHqAdmin(pool, {
    organization_id: org.id,
    full_name: "HQ Admin Mary Tembo",
    email: SAMPLE_HQ_ADMIN_EMAIL,
    phone: "0977000002",
    password_hash: passwordHash,
    role: "hq_admin",
    status: "active",
  });
}

async function seedChurchSampleMemberPortalContentIfMissing(pool, org, branch) {
  const existing = await announcementsRepo.listAnnouncementsForBranch(pool, branch.id, { status: "all" });
  if ((existing.rows || existing).length > 0) return;

  await announcementsRepo.createAnnouncementForBranch(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    title: "Welcome to the member portal",
    body: "Verified members can now view announcements, events, and submit prayer and service requests.",
    category: "General",
    audience: "members",
    status: "published",
    publish_at: new Date(),
    created_by_admin_id: null,
  });

  await announcementsRepo.createAnnouncementForBranch(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    title: "Join us this Sunday",
    body: "All are welcome to worship with us. Service times are listed on our homepage.",
    category: "Service",
    audience: "public",
    status: "published",
    publish_at: new Date(),
    created_by_admin_id: null,
  });

  const future = new Date();
  future.setDate(future.getDate() + 14);
  const eventDate = future.toISOString().slice(0, 10);
  await eventsRepo.createEventForBranch(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    title: "Community Fellowship Lunch",
    description: "Join us after second service for fellowship and refreshments.",
    event_date: eventDate,
    start_time: "12:30 PM",
    end_time: "2:00 PM",
    location: "Church hall",
    visibility: "members",
    status: "published",
    created_by_admin_id: null,
  });

  await eventsRepo.createEventForBranch(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    title: "Sunday Worship Service",
    description: "Weekly worship open to the community.",
    event_date: eventDate,
    start_time: "9:00 AM",
    end_time: "11:00 AM",
    location: "Main sanctuary",
    visibility: "public",
    status: "published",
    created_by_admin_id: null,
  });
}

async function seedChurchSampleMinistryLeaderIfMissing(pool, org, branch) {
  const existing = await ministryLeadersRepo.findLeaderByEmailForBranch(
    pool,
    branch.id,
    SAMPLE_MINISTRY_LEADER_EMAIL
  );
  if (existing) return existing;

  const ministries = await ministriesRepo.listMinistriesForBranch(pool, branch.id, { status: "all" });
  let youth = ministries.find((m) => m.slug === "youth-ministry" || /youth/i.test(m.name));

  if (!youth) {
    youth = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      name: "Youth Ministry",
      slug: "youth-ministry",
      description: "Engaging young people through worship, discipleship, and community outreach.",
      leader_name: "Grace Mwansa",
      leader_phone: "0977000003",
      meeting_day: "Saturday",
      meeting_time: "4:00 PM",
      location: "Youth hall",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });
  }

  const passwordHash = await bcrypt.hash("testpass123", 12);
  return ministryLeadersRepo.createMinistryLeader(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    ministry_id: youth.id,
    full_name: "Grace Mwansa",
    email: SAMPLE_MINISTRY_LEADER_EMAIL,
    phone: "0977000003",
    password_hash: passwordHash,
    role: "ministry_leader",
    status: "active",
    created_by_admin_id: null,
  });
}

async function seedChurchSampleBranchAdminIfMissing(pool, org, branch) {
  const existing = await branchAdminsRepo.findBranchAdminByEmailForBranch(pool, branch.id, SAMPLE_BRANCH_ADMIN_EMAIL);
  if (existing) return existing;

  const passwordHash = await bcrypt.hash("testpass123", 12);
  return branchAdminsRepo.createBranchAdmin(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    full_name: "Pastor John Banda",
    email: SAMPLE_BRANCH_ADMIN_EMAIL,
    phone: "0977000001",
    password_hash: passwordHash,
    role: "branch_admin",
    status: "active",
  });
}

/**
 * Dev/sample seed for kafuebaptist — NOT auto-run on server boot.
 * Prefer BlessBoard catalogue demos (demo / demo2) via seedChurchDemoOrganization.
 * Kept for explicit local/test use only; never treat as a real tenant seed.
 */
async function seedChurchSampleOrganizationIfMissing(pool) {
  let org = await organizationsRepo.findOrganizationBySlug(pool, SAMPLE_ORG_SLUG);

  if (!org) {
    const zmTenant = await tenantsRepo.getBySlug(pool, "zm");
    const platformTenantId = zmTenant && zmTenant.id ? zmTenant.id : 4;

    org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: platformTenantId,
      slug: SAMPLE_ORG_SLUG,
      name: "Kafue Baptist Church",
      status: "active",
      data_environment: "test",
    });

    await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      host_slug: SAMPLE_ORG_SLUG,
      name: "Kafue Baptist Church",
      welcome_message:
        "Welcome to Kafue Baptist Church — a Christ-centered community in Kafue, Zambia. We are glad you are here.",
      service_times: "Sunday Worship · 9:00 AM & 11:00 AM\nMidweek Prayer · Wednesday 6:30 PM",
      location_text: "Plot 12, Central Avenue, Kafue, Zambia",
    });
  }

  const branch = await branchesRepo.findBranchByHostSlug(pool, SAMPLE_ORG_SLUG);
  if (branch) {
    await seedChurchSampleBranchAdminIfMissing(pool, org, branch);
    await seedChurchSampleMemberPortalContentIfMissing(pool, org, branch);
    await seedChurchSampleMinistryLeaderIfMissing(pool, org, branch);
  }
  await seedChurchSampleHqAdminIfMissing(pool, org);

  return org;
}

module.exports = {
  seedChurchSampleOrganizationIfMissing,
  seedChurchSampleBranchAdminIfMissing,
  seedChurchSampleHqAdminIfMissing,
  seedChurchSampleMinistryLeaderIfMissing,
  SAMPLE_ORG_SLUG,
  SAMPLE_BRANCH_ADMIN_EMAIL,
  SAMPLE_HQ_ADMIN_EMAIL,
  SAMPLE_MINISTRY_LEADER_EMAIL,
};
