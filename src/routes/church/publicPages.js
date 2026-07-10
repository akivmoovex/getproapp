"use strict";

const { getPgPool } = require("../../db/pg");
const announcementsRepo = require("../../db/pg/church/announcementsRepo");
const hqBroadcastsRepo = require("../../db/pg/church/hqBroadcastsRepo");
const { mergeAnnouncementFeed } = require("../../church/announcementFeed");
const { PUBLIC_HQ_AUDIENCES } = require("../../church/hqBroadcastValidation");
const eventsRepo = require("../../db/pg/church/eventsRepo");
const sermonsRepo = require("../../db/pg/church/sermonsRepo");
const contactSubmissionsRepo = require("../../db/pg/church/contactSubmissionsRepo");
const websiteContentRepo = require("../../db/pg/church/websiteContentRepo");
const givingSettingsRepo = require("../../db/pg/church/givingSettingsRepo");
const ministriesRepo = require("../../db/pg/church/ministriesRepo");
const {
  buildBranchFallbacks,
  mergeWithFallbacks,
  preparePublicViewModel,
} = require("../../services/church/websiteContentService");
const { prepareGivingDisplay } = require("../../services/church/givingSettingsService");
const { validatePublicContactBody } = require("../../church/contactSubmissionValidation");
const {
  BLESSBOARD_NAME,
  BLESSBOARD_TAGLINE,
  BLESSBOARD_PUBLIC_URL,
} = require("../../church/branding");

function formatPublicEventWhen(ev) {
  const date = ev.event_date instanceof Date ? ev.event_date : new Date(ev.event_date);
  const dateStr = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const start = ev.start_time || ev.event_time || "";
  const end = ev.end_time || "";
  const timeStr = start && end ? `${start} – ${end}` : start || end || "";
  const loc = ev.location || ev.location_text || "";
  return [dateStr, timeStr, loc].filter(Boolean).join(" · ");
}

function mapPublicEventCard(ev, index) {
  const date = ev.event_date instanceof Date ? ev.event_date : new Date(ev.event_date);
  const validDate = !Number.isNaN(date.getTime());
  const start = ev.start_time || ev.event_time || "";
  const end = ev.end_time || "";
  const timeStr = start && end ? `${start} – ${end}` : start || end || "";
  const loc = ev.location || ev.location_text || "";
  const category = String(ev.category || ev.ministry_name || "Community").trim() || "Community";
  return {
    title: ev.title,
    when: formatPublicEventWhen(ev),
    description: ev.description,
    day: validDate ? String(date.getDate()).padStart(2, "0") : "—",
    month: validDate ? date.toLocaleDateString("en-GB", { month: "short" }).toUpperCase() : "SOON",
    time: timeStr || "See details",
    location: loc || "Church campus",
    category,
    image: `/church/images/events/event-${(index % 4) + 1}.jpg`,
    featured: index === 0,
  };
}

function mapDemoEventCard(item, index) {
  const parts = String(item.when || "").split("·").map((p) => p.trim());
  const datePart = parts[0] || "";
  const dayMatch = datePart.match(/(\d{1,2})/);
  const monthMatch = datePart.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
  return {
    title: item.title,
    when: item.when,
    description: item.description || "",
    day: dayMatch ? dayMatch[1].padStart(2, "0") : String(index + 1).padStart(2, "0"),
    month: monthMatch ? monthMatch[1].toUpperCase() : "SOON",
    time: parts[1] || "See details",
    location: parts[2] || "Church campus",
    category: index === 0 ? "Worship" : index === 1 ? "Community" : "Youth",
    image: `/church/images/events/event-${(index % 4) + 1}.jpg`,
    featured: index === 0,
  };
}

function fallbackSermonSamples(churchName) {
  return [
    {
      title: "The Sovereign Grace of God",
      speaker: "Pastor John Phiri",
      date: "Oct 27, 2024",
      category: "Faith Foundations",
      icon: "menu_book",
      description: "Understanding our divine calling in a modern world and how to remain steadfast in faith.",
      media_url: null,
    },
    {
      title: "Foundations of Community",
      speaker: "Elder Mutale",
      date: "Oct 20, 2024",
      category: "Community Life",
      icon: "groups",
      description: "Building a church family that loves, serves, and grows together.",
      media_url: null,
    },
    {
      title: "Walking in Purpose",
      speaker: churchName,
      date: "Oct 13, 2024",
      category: "The Book of Romans",
      icon: "auto_stories",
      description: "Living out the gospel with clarity and courage.",
      media_url: null,
    },
  ];
}

function applyDemoEventFallbacks(locals) {
  const demo = [
    { title: "Annual Praise Night", when: "Nov 24 · 18:00 · Main Hall" },
    { title: "Community Food Drive", when: "Dec 02 · 09:00 · Outreach Center" },
    { title: "Mid-week Bible Study", when: "Wednesday · 18:00 · Main Hall", description: "Prayer and study." },
  ];
  locals.upcomingEvents = demo.map(mapDemoEventCard);
  locals.hasDbEvents = false;
}

function branchPublicLocalsWithoutDb(org, branch, activePage) {
  const merged = buildBranchFallbacks(org, branch);
  const locals = preparePublicViewModel(org, branch, merged, { activePage });
  if (activePage === "home" || activePage === "events") {
    applyDemoEventFallbacks(locals);
  }
  return locals;
}

function buildVerticalApexLocals() {
  return {
    pageTitle: BLESSBOARD_NAME,
    churchName: BLESSBOARD_NAME,
    metaDescription: BLESSBOARD_TAGLINE,
    isVerticalApex: true,
    activePage: "home",
    heroTitle: "Empower Your Church with BlessBoard",
    heroSubtitle: "Next Generation CMS",
    welcomeMessage:
      "A modern, all-in-one management platform designed to help your ministry thrive. Manage members, coordinate activities, and track growth with structured compassion.",
    serviceTimes: "Explore the live demo church at demo.blessboard.com",
    locationText: "Multi-tenant church platform at blessboard.com",
    upcomingEvents: [],
    givingTeaser: "",
    footerMessage: "© BlessBoard. Powered by GetPro.",
    blessboardPublicUrl: BLESSBOARD_PUBLIC_URL,
  };
}

async function loadBranchPublicLocals(req, activePage) {
  const ctx = req.churchContext;
  const org = ctx.organization;
  const branch = ctx.branch;
  const pool = getPgPool();

  if (!pool) {
    const locals = branchPublicLocalsWithoutDb(org, branch, activePage);
    if (activePage === "giving") {
      locals.givingDisplay = prepareGivingDisplay(
        null,
        {
          givingInstructions: locals.givingInstructions,
          givingBankDetails: locals.givingBankDetails,
          givingMobileMoney: locals.givingMobileMoney,
          givingCategories: locals.givingCategories,
          givingQrPlaceholder: locals.givingQrPlaceholder,
        },
        { audience: "public", churchName: locals.churchName }
      );
    }
    return locals;
  }

  let published = null;
  try {
    published = await websiteContentRepo.getPublishedWebsiteContentForBranch(pool, branch.id);
  } catch {
    return branchPublicLocalsWithoutDb(org, branch, activePage);
  }

  const merged = published ? mergeWithFallbacks(published, org, branch) : buildBranchFallbacks(org, branch);

  const locals = preparePublicViewModel(org, branch, merged, { activePage });

  if (activePage === "home" || activePage === "events") {
    if (activePage === "home") {
      const [branchAnnouncements, hqBroadcasts] = await Promise.all([
        announcementsRepo.listPublicAnnouncementsForBranch(pool, branch.id, { limit: 6 }),
        hqBroadcastsRepo.listVisibleBroadcastsForBranch(pool, org.id, branch.id, {
          audiences: PUBLIC_HQ_AUDIENCES,
          limit: 6,
        }),
      ]);
      locals.publicAnnouncements = mergeAnnouncementFeed(branchAnnouncements, hqBroadcasts, 3);
    }
    const publicEvents = await eventsRepo.listPublicEventsForBranch(pool, branch.id, {
      limit: activePage === "events" ? 24 : 6,
    });
    if (publicEvents.length > 0) {
      locals.upcomingEvents = publicEvents.map(mapPublicEventCard);
      locals.hasDbEvents = true;
    } else {
      applyDemoEventFallbacks(locals);
    }
    if (activePage === "home") {
      const publicMinistries = await ministriesRepo.listPublishedMinistriesForBranch(pool, branch.id, {
        visibility: "public",
        limit: 3,
      });
      if (publicMinistries.length > 0) {
        locals.publicMinistries = publicMinistries;
      } else if ((locals.ministries || []).length > 0) {
        locals.publicMinistries = locals.ministries.slice(0, 3);
      }
    }
  }

  if (activePage === "ministries") {
    const dbMinistries = await ministriesRepo.listPublishedMinistriesForBranch(pool, branch.id, {
      visibility: "public",
    });
    locals.ministries =
      dbMinistries.length > 0
        ? dbMinistries
        : (locals.ministries || []).map((m) => ({
            name: m.name,
            description: m.description,
            meeting_day: null,
            meeting_time: m.meeting_time,
            location: null,
            leader_name: null,
          }));
  }

  if (activePage === "giving") {
    const publishedGiving = await givingSettingsRepo.getPublishedGivingSettingsForBranch(pool, branch.id);
    locals.givingDisplay = prepareGivingDisplay(
      publishedGiving,
      {
        givingInstructions: locals.givingInstructions,
        givingBankDetails: locals.givingBankDetails,
        givingMobileMoney: locals.givingMobileMoney,
        givingCategories: locals.givingCategories,
        givingQrPlaceholder: locals.givingQrPlaceholder,
      },
      { audience: "public", churchName: locals.churchName }
    );
  }

  return locals;
}

function registerPublicPagesRoutes(router) {
  router.get("/", async (req, res, next) => {
    try {
      const ctx = req.churchContext;
      if (ctx.kind === "vertical-apex") {
        return res.render("church/public/home", buildVerticalApexLocals());
      }
      if (ctx.kind !== "branch" || !ctx.branch || !ctx.organization) {
        if (ctx.kind === "branch") {
          const { renderChurchNotFound } = require("../../church/churchStatusAccess");
          return renderChurchNotFound(req, res);
        }
        return next();
      }
      const locals = await loadBranchPublicLocals(req, "home");
      return res.render("church/public/home", locals);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/about", async (req, res, next) => {
    try {
      const ctx = req.churchContext;
      if (ctx.kind === "vertical-apex") {
        return res.redirect("/");
      }
      if (ctx.kind !== "branch" || !ctx.branch) {
        return res.status(404).type("text").send("Not found.");
      }
      const locals = await loadBranchPublicLocals(req, "about");
      return res.render("church/public/about", locals);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/leadership", async (req, res, next) => {
    try {
      const ctx = req.churchContext;
      if (ctx.kind === "vertical-apex") {
        return res.redirect("/");
      }
      if (ctx.kind !== "branch" || !ctx.branch) {
        return res.status(404).type("text").send("Not found.");
      }
      const locals = await loadBranchPublicLocals(req, "leadership");
      return res.render("church/public/leadership", locals);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/ministries", async (req, res, next) => {
    try {
      const ctx = req.churchContext;
      if (ctx.kind === "vertical-apex") {
        return res.redirect("/");
      }
      if (ctx.kind !== "branch" || !ctx.branch) {
        return res.status(404).type("text").send("Not found.");
      }
      const locals = await loadBranchPublicLocals(req, "ministries");
      const filters = [{ key: "all", label: "All" }];
      const seen = new Set();
      for (const m of locals.ministries || []) {
        const day = String(m.meeting_day || "").trim();
        if (!day) continue;
        const key = day.toLowerCase().replace(/\s+/g, "-");
        if (seen.has(key)) continue;
        seen.add(key);
        filters.push({ key, label: day });
      }
      locals.ministryFilters = filters;
      return res.render("church/public/ministries", locals);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/giving", async (req, res, next) => {
    try {
      const ctx = req.churchContext;
      if (ctx.kind === "vertical-apex") {
        return res.redirect("/");
      }
      if (ctx.kind !== "branch" || !ctx.branch) {
        return res.status(404).type("text").send("Not found.");
      }
      const locals = await loadBranchPublicLocals(req, "giving");
      return res.render("church/public/giving", locals);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/contact", async (req, res, next) => {
    try {
      const ctx = req.churchContext;
      if (ctx.kind === "vertical-apex") {
        return res.redirect("/");
      }
      if (ctx.kind !== "branch" || !ctx.branch) {
        return res.status(404).type("text").send("Not found.");
      }
      const locals = await loadBranchPublicLocals(req, "contact");
      locals.contactSubmitted = String(req.query.submitted || "") === "1";
      locals.contactError = null;
      locals.contactForm = {};
      return res.render("church/public/contact", locals);
    } catch (e) {
      return next(e);
    }
  });

  router.post("/contact", async (req, res, next) => {
    try {
      const ctx = req.churchContext;
      if (ctx.kind === "vertical-apex") {
        return res.redirect("/");
      }
      if (ctx.kind !== "branch" || !ctx.branch || !ctx.organization) {
        return res.status(404).type("text").send("Not found.");
      }
      const validation = validatePublicContactBody(req.body);
      const locals = await loadBranchPublicLocals(req, "contact");
      locals.contactSubmitted = false;
      locals.contactForm = {
        full_name: String(req.body?.full_name || req.body?.contact_name || ""),
        email: String(req.body?.email || req.body?.contact_email || ""),
        phone: String(req.body?.phone || req.body?.contact_phone || ""),
        message: String(req.body?.message || req.body?.contact_message || ""),
      };
      if (!validation.ok) {
        locals.contactError = validation.error;
        return res.status(400).render("church/public/contact", locals);
      }
      const pool = getPgPool();
      if (!pool) {
        locals.contactError = "We could not send your message right now. Please call or email the church directly.";
        return res.status(503).render("church/public/contact", locals);
      }
      await contactSubmissionsRepo.createContactSubmissionForBranch(pool, {
        organization_id: ctx.organization.id,
        branch_id: ctx.branch.id,
        ...validation.data,
      });
      return res.redirect(303, "/contact?submitted=1");
    } catch (e) {
      return next(e);
    }
  });

  router.get("/events", async (req, res, next) => {
    try {
      const ctx = req.churchContext;
      if (ctx.kind === "vertical-apex") {
        return res.redirect("/");
      }
      if (ctx.kind !== "branch" || !ctx.branch) {
        return res.status(404).type("text").send("Not found.");
      }
      const locals = await loadBranchPublicLocals(req, "events");
      return res.render("church/public/events", locals);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/sermons", async (req, res, next) => {
    try {
      const ctx = req.churchContext;
      if (ctx.kind === "vertical-apex") {
        return res.redirect("/");
      }
      if (ctx.kind !== "branch" || !ctx.branch || !ctx.organization) {
        return res.status(404).type("text").send("Not found.");
      }
      const locals = await loadBranchPublicLocals(req, "sermons");
      const pool = getPgPool();
      let published = [];
      if (pool) {
        try {
          published = await sermonsRepo.listPublicSermonsForBranch(pool, ctx.branch.id, { limit: 24 });
        } catch {
          published = [];
        }
      }
      locals.sermonSamples = published.length > 0 ? published : fallbackSermonSamples(locals.churchName);
      locals.hasDbSermons = published.length > 0;
      return res.render("church/public/sermons", locals);
    } catch (e) {
      return next(e);
    }
  });
}

module.exports = registerPublicPagesRoutes;
