"use strict";

const organizationsRepo = require("../db/pg/church/organizationsRepo");
const branchesRepo = require("../db/pg/church/branchesRepo");
const branchAdminsRepo = require("../db/pg/church/branchAdminsRepo");
const announcementsRepo = require("../db/pg/church/announcementsRepo");
const eventsRepo = require("../db/pg/church/eventsRepo");
const ministriesRepo = require("../db/pg/church/ministriesRepo");
const websiteContentRepo = require("../db/pg/church/websiteContentRepo");
const sermonsRepo = require("../db/pg/church/sermonsRepo");
const resourcesRepo = require("../db/pg/church/resourcesRepo");
const tenantsRepo = require("../db/pg/tenantsRepo");
const { hashBranchAdminPassword } = require("../church/branchAdminAuth");
const { getChurchHostDomain, isTestingDeployment } = require("../church/blessBoardEnv");
const {
  DEMO_TENANT_CATALOGUE,
  findDemoTenantBySlug,
} = require("../church/demoTenantCatalogue");

const DEMO_ORG_SLUG = "demo";
const DEMO_HOST_SLUG = "demo";

function demoContactEmail(hostSlug) {
  const domain = getChurchHostDomain() || "blessboard.com";
  return `hello@${hostSlug}.${domain}`;
}

function demoBranchAdminEmail(hostSlug) {
  const domain = getChurchHostDomain() || "blessboard.com";
  return `admin@${hostSlug}.${domain}`;
}

const DEMO_BRANCH_ADMIN_EMAIL = demoBranchAdminEmail(DEMO_HOST_SLUG);
const DEMO_BRANCH_ADMIN_NAME = "Demo Church Admin";
/** Temporary demo password — prefer `npm run church:demo-admin` to reset/update. */
const DEMO_BRANCH_ADMIN_PASSWORD = process.env.DEMO_CHURCH_ADMIN_PASSWORD || "DemoAdmin@2026!";

async function seedDemoBranchAdminIfMissing(pool, org, branch, hostSlug = DEMO_HOST_SLUG) {
  const adminEmail = demoBranchAdminEmail(hostSlug);
  const existing = await branchAdminsRepo.findBranchAdminByEmailForBranch(pool, branch.id, adminEmail);
  if (existing) return existing;

  const username = adminEmail.toLowerCase();
  const byUsername = await pool.query(
    `SELECT * FROM public.church_branch_admins
     WHERE branch_id = $1 AND lower(trim(username)) = $2
     LIMIT 1`,
    [branch.id, username]
  );
  if (byUsername.rows[0]) return byUsername.rows[0];

  const passwordHash = await hashBranchAdminPassword(DEMO_BRANCH_ADMIN_PASSWORD);
  try {
    return await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: DEMO_BRANCH_ADMIN_NAME,
      email: adminEmail,
      phone: "0977111222",
      password_hash: passwordHash,
      role: "branch_admin",
      status: "active",
    });
  } catch (err) {
    if (/church_branch_admins_branch_username_unique|duplicate key value/i.test(String(err.message))) {
      const retry = await branchAdminsRepo.findBranchAdminByEmailForBranch(pool, branch.id, adminEmail);
      if (retry) return retry;
      const retryUsername = await pool.query(
        `SELECT * FROM public.church_branch_admins
         WHERE branch_id = $1 AND lower(trim(username)) = $2
         LIMIT 1`,
        [branch.id, username]
      );
      if (retryUsername.rows[0]) return retryUsername.rows[0];
    }
    throw err;
  }
}

async function seedDemoWebsiteContentIfMissing(pool, org, branch) {
  const existing = await websiteContentRepo.getPublishedWebsiteContentForBranch(pool, branch.id);
  if (existing) return existing;

  const draft = await websiteContentRepo.getWebsiteContentForBranch(pool, branch.id);
  if (draft && draft.status === "published") return draft;

  const leadership = {
    pastor: {
      name: branch.pastor_name || "Rev. Demo Pastor",
      title: "Senior Pastor",
      bio: "Serving BlessBoard Demo Church with a heart for discipleship, community, and faithful teaching.",
    },
    assistant_pastor: { name: "Sarah Chilufya" },
    elders: ["Mark Banda", "Grace Mumba"],
  };

  const content = {
    organization_id: org.id,
    homepage_hero_title: branch.name || "BlessBoard Demo Church",
    homepage_hero_subtitle: "Welcome home",
    welcome_message: branch.welcome_message,
    service_times: branch.service_times,
    location_text: branch.location_text,
    about_title: `About ${branch.name}`,
    about_body:
      "BlessBoard Demo Church is a Christ-centered community demonstrating the BlessBoard platform. We welcome visitors, members, and branch admins exploring the public site and member portal.",
    mission_text: "To make disciples of Jesus Christ who love God, love people, and serve the community.",
    vision_text: "A transformed community where every person experiences grace and fellowship.",
    values_text:
      "Structured Compassion | We combine reliable organization with pastoral warmth.\nCommunity First | We believe in being a hub for local connection.\nBiblical Integrity | Our foundation is built on Scripture.",
    leadership_json: leadership,
    ministries_json: [],
    contact_phone: branch.contact_phone || "+260 97 000 0000",
    contact_email: branch.contact_email || demoContactEmail(branch.host_slug || DEMO_HOST_SLUG),
    office_hours: "Mon–Fri · 08:00 – 17:00\nSaturday · 09:00 – 13:00\nSunday · Service times",
    address: branch.location_text || "123 BlessBoard Avenue, Demo City",
    map_embed_placeholder: `Map preview for ${branch.name || "BlessBoard Demo Church"}.`,
    giving_bank_details: "",
    giving_mobile_money: "",
    giving_categories: "Tithes, Offerings, Missions",
    giving_instructions:
      "Your generosity supports ministry and outreach. Giving details are managed by branch leadership.",
    giving_qr_placeholder: "",
    footer_message: "Member registration and login are available on your branch church site.",
    updated_by_admin_id: null,
  };

  await websiteContentRepo.upsertWebsiteDraftForBranch(pool, branch.id, content);
  return websiteContentRepo.publishWebsiteContentForBranch(pool, branch.id, null);
}

async function seedDemoSermonsIfMissing(pool, org, branch) {
  const count = await sermonsRepo.countSermonsForBranch(pool, branch.id);
  if (count > 0) return;

  const samples = [
    {
      title: "Walking by Faith in Uncertain Times",
      speaker: "Rev. Demo Pastor",
      category: "Sunday Sermon",
      description: "A message on trusting God through change and challenge.",
      scripture: "Hebrews 11:1",
    },
    {
      title: "Foundations: Grace and Community",
      speaker: "BlessBoard Teaching Team",
      category: "Bible Study",
      description: "Study notes from our foundations series.",
      scripture: "Ephesians 2:8",
    },
    {
      title: "Prayer and Purpose",
      speaker: "Mid-week teaching",
      category: "Devotional",
      description: "A devotional on prayerful living.",
      scripture: "Philippians 4:6",
    },
  ];

  for (const [idx, sample] of samples.entries()) {
    await sermonsRepo.createSermonForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      ...sample,
      sermon_date: new Date().toISOString().slice(0, 10),
      status: "published",
      sort_order: idx,
      created_by_admin_id: null,
    });
  }
}

async function seedDemoResourcesIfMissing(pool, org, branch) {
  const studyCount = await resourcesRepo.countResourcesForBranch(pool, branch.id, { resource_type: "study" });
  if (studyCount === 0) {
    await resourcesRepo.createResourceForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      title: "Weekly Bible Study Notes",
      description: "PDF · Updated weekly",
      resource_type: "study",
      visibility: "members",
      status: "published",
      sort_order: 1,
      created_by_admin_id: null,
    });
    await resourcesRepo.createResourceForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      title: "Devotional Series",
      description: "Reading plan · 30 days",
      resource_type: "study",
      visibility: "members",
      status: "published",
      sort_order: 2,
      created_by_admin_id: null,
    });
  }

  const docCount = await resourcesRepo.countResourcesForBranch(pool, branch.id, { resource_type: "document" });
  if (docCount === 0) {
    await resourcesRepo.createResourceForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      title: "Church Policies & Guidelines",
      description: "PDF · Leadership approved",
      resource_type: "document",
      visibility: "members",
      status: "published",
      sort_order: 1,
      created_by_admin_id: null,
    });
  }

  const formCount = await resourcesRepo.countResourcesForBranch(pool, branch.id, { resource_type: "form" });
  if (formCount === 0) {
    await resourcesRepo.createResourceForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      title: "Membership Information Form",
      description: "PDF · Church office",
      resource_type: "form",
      visibility: "members",
      status: "published",
      sort_order: 1,
      created_by_admin_id: null,
    });
    await resourcesRepo.createResourceForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      title: "Ministry Volunteer Application",
      description: "DOCX · Ministries team",
      resource_type: "form",
      visibility: "members",
      status: "published",
      sort_order: 2,
      created_by_admin_id: null,
    });
  }
}

async function seedDemoPublicContentIfMissing(pool, org, branch) {
  const existingAnnouncements = await announcementsRepo.listAnnouncementsForBranch(pool, branch.id, {
    status: "all",
  });
  if ((existingAnnouncements.rows || existingAnnouncements).length > 0) return;

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
 * Idempotent seed for one catalogue demo tenant (demo or demo2).
 * @param {import("pg").Pool} pool
 * @param {string} [slug] catalogue slug (default: demo)
 */
async function seedChurchDemoOrganizationIfMissing(pool, slug = DEMO_ORG_SLUG) {
  const entry = findDemoTenantBySlug(slug) || findDemoTenantBySlug(DEMO_ORG_SLUG);
  if (!entry) {
    throw new Error(`Unknown demo tenant slug: ${slug}`);
  }

  let org = await organizationsRepo.findOrganizationBySlug(pool, entry.slug);

  if (!org) {
    const demoTenant = await tenantsRepo.getBySlug(pool, "demo");
    const globalTenant = await tenantsRepo.getBySlug(pool, "global");
    const platformTenantId =
      (demoTenant && demoTenant.id) || (globalTenant && globalTenant.id) || 1;

    org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: platformTenantId,
      slug: entry.slug,
      name: entry.name,
      status: "active",
      data_environment: entry.dataEnvironment,
    });
  } else if (String(org.data_environment || "") !== entry.dataEnvironment) {
    await pool.query(
      `UPDATE public.church_organizations
       SET data_environment = $2, updated_at = now()
       WHERE id = $1`,
      [org.id, entry.dataEnvironment]
    );
    org = await organizationsRepo.findOrganizationById(pool, org.id);
  }

  let branch = await branchesRepo.findBranchByHostSlug(pool, entry.hostSlug);
  if (!branch) {
    branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: entry.branchSlug,
      host_slug: entry.hostSlug,
      name: entry.branchName,
      status: "active",
      city: "Lusaka",
      country: "Zambia",
      pastor_name: "Rev. Demo Pastor",
      contact_email: demoContactEmail(entry.hostSlug),
      contact_phone: "+260 97 000 0000",
      welcome_message: `Welcome to ${entry.name} — a sample church site powered by BlessBoard. Explore our public pages and register as a member to try the portal.`,
      service_times: "Sunday Worship · 10:00 AM\nMidweek Prayer · Wednesday 6:30 PM",
      location_text: "123 BlessBoard Avenue, Demo City",
    });
  }

  await seedDemoPublicContentIfMissing(pool, org, branch);
  await seedDemoWebsiteContentIfMissing(pool, org, branch);
  await seedDemoSermonsIfMissing(pool, org, branch);
  await seedDemoResourcesIfMissing(pool, org, branch);
  await seedDemoBranchAdminIfMissing(pool, org, branch, entry.hostSlug);

  return { organization: org, branch };
}

/**
 * Idempotent seed of every catalogue demo tenant (demo + demo2).
 * Intended for explicit CLI / testing deployments — not production auto-boot.
 * @param {import("pg").Pool} pool
 */
async function seedAllCatalogueDemoOrganizationsIfMissing(pool) {
  const results = [];
  for (const entry of DEMO_TENANT_CATALOGUE) {
    results.push(await seedChurchDemoOrganizationIfMissing(pool, entry.slug));
  }
  return results;
}

/**
 * Boot-time demo seed: only when DEPLOYMENT_ENV=testing.
 * Production never auto-seeds demo tenants.
 * @param {import("pg").Pool} pool
 */
async function seedChurchDemoOrganizationsForDeploymentIfAllowed(pool) {
  if (!isTestingDeployment()) {
    return { skipped: true, reason: "DEPLOYMENT_ENV is not testing" };
  }
  const results = await seedAllCatalogueDemoOrganizationsIfMissing(pool);
  return { skipped: false, results };
}

module.exports = {
  seedChurchDemoOrganizationIfMissing,
  seedAllCatalogueDemoOrganizationsIfMissing,
  seedChurchDemoOrganizationsForDeploymentIfAllowed,
  DEMO_ORG_SLUG,
  DEMO_HOST_SLUG,
  DEMO_BRANCH_ADMIN_EMAIL,
};
