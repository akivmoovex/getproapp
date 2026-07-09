"use strict";

const { getPgPool } = require("../../db/pg");
const announcementsRepo = require("../../db/pg/church/announcementsRepo");
const hqBroadcastsRepo = require("../../db/pg/church/hqBroadcastsRepo");
const { mergeAnnouncementFeed } = require("../../church/announcementFeed");
const { PUBLIC_HQ_AUDIENCES } = require("../../church/hqBroadcastValidation");
const eventsRepo = require("../../db/pg/church/eventsRepo");
const sermonsRepo = require("../../db/pg/church/sermonsRepo");
const websiteContentRepo = require("../../db/pg/church/websiteContentRepo");
const givingSettingsRepo = require("../../db/pg/church/givingSettingsRepo");
const ministriesRepo = require("../../db/pg/church/ministriesRepo");
const {
  buildBranchFallbacks,
  mergeWithFallbacks,
  preparePublicViewModel,
} = require("../../services/church/websiteContentService");
const { prepareGivingDisplay } = require("../../services/church/givingSettingsService");
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

function fallbackSermonSamples(churchName) {
  return [
    {
      title: "Sermons coming soon",
      speaker: churchName,
      date: "",
      category: "Announcement",
      icon: "info",
      description: "Published sermons will appear here when branch leadership adds them.",
      media_url: null,
    },
  ];
}

function applyDemoEventFallbacks(locals) {
  locals.upcomingEvents = [
    { title: "Sunday Worship Service", when: locals.serviceTimes.split("\n")[0] || "Sunday · 9:00 AM" },
    { title: "Mid-week Bible Study", when: "Wednesday · 6:00 PM", description: "Prayer and study in the main hall." },
    { title: "Community Fellowship", when: "First Friday monthly · 6:30 PM", description: "Food, fellowship, and connection." },
  ];
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
    heroTitle: BLESSBOARD_NAME,
    heroSubtitle: "A GetPro-powered platform",
    welcomeMessage:
      "BlessBoard helps churches engage members, manage branches, track attendance, summarize giving, and submit monthly reports — powered by GetPro.",
    serviceTimes: "Explore the live demo church at demo.blessboard.com",
    locationText: "Multi-tenant church platform at blessboard.com",
    upcomingEvents: [
      { title: "Community Welcome Day", when: "First Sunday monthly · 12:30 PM" },
      { title: "Leadership Training", when: "Quarterly · Saturday 2:00 PM" },
    ],
    givingTeaser:
      "Track giving summaries and monthly reports without online payment processing in the MVP phase.",
    footerMessage: "Member registration and login are available on your branch church site.",
    blessboardPublicUrl: BLESSBOARD_PUBLIC_URL,
  };
}

async function loadBranchPublicLocals(req, activePage) {
  const ctx = req.churchContext;
  const org = ctx.organization;
  const branch = ctx.branch;
  const pool = getPgPool();

  if (!pool) {
    return branchPublicLocalsWithoutDb(org, branch, activePage);
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
      locals.upcomingEvents = publicEvents.map((ev) => ({
        title: ev.title,
        when: formatPublicEventWhen(ev),
        description: ev.description,
      }));
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
      return res.render("church/public/contact", locals);
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
