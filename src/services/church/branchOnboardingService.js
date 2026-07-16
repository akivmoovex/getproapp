"use strict";

const websiteContentRepo = require("../../db/pg/church/websiteContentRepo");
const eventsRepo = require("../../db/pg/church/eventsRepo");
const sermonsRepo = require("../../db/pg/church/sermonsRepo");
const { allowsFabricatedPublicContent, getDataEnvironment } = require("../../church/orgDataEnvironment");

/**
 * Minimal shell content for production/pilot — no fabricated mission, vision, or demo copy.
 */
function buildMinimalWebsiteShell(org, branch) {
  const churchName = branch.name || org.name || "Our Church";
  const address = branch.location_text || branch.city || org.city || "";
  return {
    organization_id: org.id,
    homepage_hero_title: churchName,
    homepage_hero_subtitle: "",
    welcome_message: branch.welcome_message || "",
    service_times: branch.service_times || "",
    location_text: branch.location_text || address,
    about_title: `About ${churchName}`,
    about_body: "",
    mission_text: "",
    vision_text: "",
    values_text: "",
    leadership_json: { pastor: { name: branch.pastor_name || "", title: "Senior Pastor", bio: "" }, elders: [] },
    ministries_json: [],
    contact_phone: branch.contact_phone || org.primary_contact_phone || null,
    contact_email: branch.contact_email || org.primary_contact_email || null,
    office_hours: "",
    address: address || null,
    map_embed_placeholder: "",
    giving_bank_details: "",
    giving_mobile_money: "",
    giving_categories: "",
    giving_instructions: "",
    giving_qr_placeholder: "",
    footer_message: "",
    updated_by_admin_id: null,
  };
}

/**
 * Starter template used only for demo/test environments (never production/pilot).
 */
function buildFabricatedStarterContent(org, branch) {
  const churchName = branch.name || org.name || "Our Church";
  const pastorName = branch.pastor_name || "Pastor";
  const address = branch.location_text || branch.city || org.city || "";
  const leadership = {
    pastor: {
      name: pastorName,
      title: "Senior Pastor",
      bio: `Welcome to ${churchName}. Update this biography from the branch website editor.`,
    },
    elders: [],
  };

  return {
    organization_id: org.id,
    homepage_hero_title: churchName,
    homepage_hero_subtitle: "Welcome home",
    welcome_message:
      branch.welcome_message ||
      `Welcome to ${churchName}. We are glad you are here. Update this message from the branch website editor.`,
    service_times:
      branch.service_times || "Sunday · Contact the church office for service times",
    location_text: branch.location_text || address,
    about_title: `About ${churchName}`,
    about_body: `${churchName} is part of the BlessBoard community. Update this story from the branch website editor under Site content.`,
    mission_text: "To make disciples of Jesus Christ who love God, love people, and serve the community.",
    vision_text: "A transformed community where every person experiences grace and fellowship.",
    values_text: "Faith · Community · Service",
    leadership_json: leadership,
    ministries_json: [],
    contact_phone: branch.contact_phone || org.primary_contact_phone || null,
    contact_email: branch.contact_email || org.primary_contact_email || null,
    office_hours: "Contact the church office for office hours.",
    address: address || null,
    map_embed_placeholder: "Map preview will appear when branch leadership adds location details.",
    giving_bank_details: "",
    giving_mobile_money: "",
    giving_categories: "Tithes, Offerings, Missions",
    giving_instructions:
      "Your generosity supports ministry and outreach. Giving details are managed by branch leadership.",
    giving_qr_placeholder: "",
    footer_message: "Member registration and login are available on your branch church site.",
    updated_by_admin_id: null,
  };
}

/**
 * Seed website content for a newly provisioned branch.
 * Production/pilot get an empty shell only — no fabricated public content.
 * Demo/test may receive starter templates.
 *
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {object} org
 * @param {object} branch
 * @param {{ publish?: boolean }} opts
 */
async function seedInitialWebsiteContentForBranch(db, org, branch, opts = {}) {
  const publish = opts.publish !== false;
  const content = allowsFabricatedPublicContent(org)
    ? buildFabricatedStarterContent(org, branch)
    : buildMinimalWebsiteShell(org, branch);

  await websiteContentRepo.upsertWebsiteDraftForBranch(db, branch.id, content);
  if (publish) {
    await websiteContentRepo.publishWebsiteContentForBranch(db, branch.id, null);
  }
  return content;
}

/**
 * Optional draft starter rows — only for demo/test environments.
 * Never fabricates public content for production or pilot churches.
 */
async function seedOptionalDraftStarterContent(db, org, branch) {
  if (!allowsFabricatedPublicContent(org)) {
    return { skipped: true, reason: "fabricated_content_not_allowed", dataEnvironment: getDataEnvironment(org) };
  }
  try {
    await eventsRepo.createEventForBranch(db, {
      organization_id: org.id,
      branch_id: branch.id,
      title: "Sunday Worship Service",
      description: "Draft event — publish from Events when ready.",
      event_date: new Date().toISOString().slice(0, 10),
      start_time: "09:00",
      end_time: "11:00",
      location: branch.location_text || branch.name,
      visibility: "public",
      status: "draft",
      created_by_admin_id: null,
    });
  } catch {
    /* optional starter content */
  }

  try {
    await sermonsRepo.createSermonForBranch(db, {
      organization_id: org.id,
      branch_id: branch.id,
      title: "Welcome Message",
      speaker: branch.pastor_name || branch.name,
      sermon_date: new Date().toISOString().slice(0, 10),
      description: "Draft sermon — publish from Sermons when ready.",
      category: "Sunday Sermon",
      status: "draft",
      sort_order: 0,
      created_by_admin_id: null,
    });
  } catch {
    /* optional starter content */
  }
  return { skipped: false };
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {object} org
 * @param {object} branch
 * @param {{ publishWebsite?: boolean, includeDraftStarters?: boolean }} opts
 */
async function onboardNewBranchContent(db, org, branch, opts = {}) {
  const website = await seedInitialWebsiteContentForBranch(db, org, branch, {
    publish: opts.publishWebsite !== false,
  });
  if (opts.includeDraftStarters !== false) {
    await seedOptionalDraftStarterContent(db, org, branch);
  }
  return { website };
}

module.exports = {
  seedInitialWebsiteContentForBranch,
  seedOptionalDraftStarterContent,
  onboardNewBranchContent,
  buildMinimalWebsiteShell,
  buildFabricatedStarterContent,
};
