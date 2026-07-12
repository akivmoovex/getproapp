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
const {
  BLESSBOARD_DEMO_PUBLIC_URL,
  BLESSBOARD_REGISTER_CHURCH_PATH,
} = require("../../church/platformPublicContent");
const { mergePlatformPublicSeo } = require("../../church/platformPublicSeo");
const { mergeChurchTenantPublicSeo } = require("../../church/churchTenantPublicSeo");
const { resolveRememberedChurch } = require("./publicChurchDirectory");
const { apexPageLocals } = require("./platformPublicPages");
const { contactPageLocals } = require("./platformPublicForms");

function formatPublicEventWhen(ev) {
  const date = ev.event_date instanceof Date ? ev.event_date : new Date(ev.event_date);
  const dateStr = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const start = ev.start_time || ev.event_time || "";
  const end = ev.end_time || "";
  const timeStr = start && end ? `${start} – ${end}` : start || end || "";
  const loc = ev.location || ev.location_text || "";
  return [dateStr, timeStr, loc].filter(Boolean).join(" · ");
}

function mapPublicEventCard(ev) {
  const date = ev.event_date instanceof Date ? ev.event_date : new Date(ev.event_date);
  const validDate = !Number.isNaN(date.getTime());
  const start = ev.start_time || ev.event_time || "";
  const end = ev.end_time || "";
  const timeStr = start && end ? `${start} – ${end}` : start || end || "";
  const loc = String(ev.location || ev.location_text || "").trim();
  const category = String(
    ev.ministry_or_department || ev.category || ev.ministry_name || ""
  ).trim();
  const image = String(ev.image_url || ev.imageUrl || ev.cover_image_url || "").trim();
  return {
    title: ev.title,
    when: formatPublicEventWhen(ev),
    description: String(ev.description || "").trim(),
    day: validDate ? String(date.getDate()).padStart(2, "0") : "",
    month: validDate ? date.toLocaleDateString("en-GB", { month: "short" }).toUpperCase() : "",
    time: timeStr,
    location: loc,
    category,
    image,
    status: ev.status || "",
  };
}

function youtubeEmbedFromUrl(raw) {
  const url = String(raw || "").trim();
  if (!url) return null;
  if (/youtube-nocookie\.com\/embed\//i.test(url) || /youtube\.com\/embed\//i.test(url)) {
    return url.replace("youtube.com/embed/", "youtube-nocookie.com/embed/");
  }
  let id = null;
  const watch = url.match(/[?&]v=([\w-]{6,})/);
  const short = url.match(/youtu\.be\/([\w-]{6,})/);
  const embed = url.match(/\/embed\/([\w-]{6,})/);
  if (watch) id = watch[1];
  else if (short) id = short[1];
  else if (embed) id = embed[1];
  if (!id) return null;
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

function enrichSermonMedia(item) {
  const mediaUrl = item.media_url || item.videoUrl || item.audioUrl || null;
  const videoEmbedUrl =
    youtubeEmbedFromUrl(item.video_url || item.videoUrl || mediaUrl) || null;
  const audioUrl = item.audio_url || item.audioUrl || null;
  const pdfUrl = item.pdf_url || item.pdfUrl || null;
  const mediaType =
    item.media_type ||
    item.mediaType ||
    (videoEmbedUrl ? "video" : audioUrl ? "audio" : pdfUrl ? "pdf" : null);
  return {
    ...item,
    videoUrl: videoEmbedUrl,
    videoEmbedUrl,
    audioUrl,
    pdfUrl,
    mediaType,
    downloadLabel: item.downloadLabel || (audioUrl ? "Download MP3" : "Download"),
    media_url: mediaUrl || videoEmbedUrl || audioUrl || pdfUrl || null,
  };
}

function sermonResourceCards(featured) {
  if (!featured) return [];
  const videoUrl = featured.videoEmbedUrl || null;
  const audioUrl = featured.audioUrl || null;
  const pdfUrl = featured.pdfUrl || null;
  const cards = [];
  if (videoUrl) {
    cards.push({
      title: "Video Sermon",
      mediaType: "Video",
      description: "Watch the featured message with an embedded player.",
      actionLabel: "Watch",
      href: "#sermon-video",
      icon: "play_circle",
      videoUrl,
    });
  }
  if (audioUrl) {
    cards.push({
      title: "Audio Sermon",
      mediaType: "Audio",
      description: "Listen on this page or download the MP3 for offline use.",
      actionLabel: "Listen",
      href: "#sermon-audio",
      icon: "headphones",
      audioUrl,
    });
  }
  if (pdfUrl) {
    cards.push({
      title: "PDF Study Notes",
      mediaType: "PDF",
      description: "Download printable notes with scripture and reflection prompts.",
      actionLabel: "Download",
      href: pdfUrl,
      download: true,
      icon: "picture_as_pdf",
      pdfUrl,
    });
  }
  return cards;
}

function branchPublicLocalsWithoutDb(org, branch, activePage) {
  const merged = buildBranchFallbacks(org, branch);
  const locals = preparePublicViewModel(org, branch, merged, { activePage });
  locals.publicAnnouncements = [];
  locals.featuredSermon = null;
  locals.hasDbSermons = false;
  locals.heroImageUrl = "";
  if (activePage === "events" || activePage === "home") {
    locals.upcomingEvents = [];
    locals.hasDbEvents = false;
  }
  if (activePage === "home") {
    locals.publicMinistries = [];
  }
  return locals;
}

function finalizeBranchPublicLocals(locals, req) {
  return mergeChurchTenantPublicSeo(locals, req);
}

function buildVerticalApexLocals(extra = {}, req = null) {
  const locals = {
    pageTitle: BLESSBOARD_NAME,
    churchName: BLESSBOARD_NAME,
    metaDescription: BLESSBOARD_TAGLINE,
    isVerticalApex: true,
    activePage: "home",
    heroTitle: "Find and connect with your church",
    heroSubtitle: "BlessBoard",
    welcomeMessage:
      "BlessBoard helps members find their church, open the right branch homepage, and sign in or register with their congregation.",
    serviceTimes: "",
    locationText: "",
    upcomingEvents: [],
    givingTeaser: "",
    footerMessage: "© BlessBoard. Powered by GetPro.",
    blessboardPublicUrl: BLESSBOARD_PUBLIC_URL,
    rememberedChurch: null,
    demoChurchUrl: BLESSBOARD_DEMO_PUBLIC_URL,
    registerChurchPath: BLESSBOARD_REGISTER_CHURCH_PATH,
    ...extra,
  };
  return mergePlatformPublicSeo(locals, req);
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
    return finalizeBranchPublicLocals(locals, req);
  }

  let published = null;
  try {
    published = await websiteContentRepo.getPublishedWebsiteContentForBranch(pool, branch.id);
  } catch {
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
    return finalizeBranchPublicLocals(locals, req);
  }

  const merged = published ? mergeWithFallbacks(published, org, branch) : buildBranchFallbacks(org, branch);

  const locals = preparePublicViewModel(org, branch, merged, { activePage });
  locals.publicAnnouncements = locals.publicAnnouncements || [];
  locals.featuredSermon = null;
  locals.hasDbSermons = false;
  locals.heroImageUrl = "";

  if (activePage === "home" || activePage === "events") {
    if (activePage === "home") {
      const [branchAnnouncements, hqBroadcasts, publicMinistries, publicSermons] = await Promise.all([
        announcementsRepo.listPublicAnnouncementsForBranch(pool, branch.id, { limit: 6 }),
        hqBroadcastsRepo.listVisibleBroadcastsForBranch(pool, org.id, branch.id, {
          audiences: PUBLIC_HQ_AUDIENCES,
          limit: 6,
        }),
        ministriesRepo.listPublishedMinistriesForBranch(pool, branch.id, {
          visibility: "public",
          limit: 4,
        }),
        sermonsRepo.listPublicSermonsForBranch(pool, branch.id, { limit: 1 }),
      ]);
      locals.publicAnnouncements = mergeAnnouncementFeed(branchAnnouncements, hqBroadcasts, 3);
      if (publicMinistries.length > 0) {
        locals.publicMinistries = publicMinistries;
      } else if ((locals.ministries || []).length > 0) {
        locals.publicMinistries = locals.ministries.slice(0, 4);
      } else {
        locals.publicMinistries = [];
      }
      if (publicSermons.length > 0) {
        locals.featuredSermon = publicSermons[0];
        locals.hasDbSermons = true;
      }
    }
    const publicEvents = await eventsRepo.listPublicEventsForBranch(pool, branch.id, {
      limit: activePage === "events" ? 24 : 6,
    });
    if (publicEvents.length > 0) {
      locals.upcomingEvents = publicEvents.map(mapPublicEventCard);
      locals.hasDbEvents = true;
    } else {
      locals.upcomingEvents = [];
      locals.hasDbEvents = false;
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

  return finalizeBranchPublicLocals(locals, req);
}

function registerPublicPagesRoutes(router) {
  router.get("/", async (req, res, next) => {
    try {
      const ctx = req.churchContext;
      if (ctx.kind === "vertical-apex") {
        const pool = getPgPool();
        const rememberedChurch = await resolveRememberedChurch(req, res, pool);
        return res.render("church/public/home", buildVerticalApexLocals({ rememberedChurch }, req));
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
        return res.render(
          "church/public/platform_about",
          apexPageLocals(
            {
              pageTitle: "About BlessBoard",
              activePage: "about",
            },
            req
          )
        );
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
        return res.render(
          "church/public/platform_contact",
          contactPageLocals(req)
        );
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
        return next("router");
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
      const samples = published.length > 0 ? published.map(enrichSermonMedia) : [];
      locals.sermonSamples = samples;
      locals.hasDbSermons = published.length > 0;
      locals.sermonDemoMedia = null;
      locals.sermonResourceCards = sermonResourceCards(samples[0] || null);
      return res.render("church/public/sermons", locals);
    } catch (e) {
      return next(e);
    }
  });
}

module.exports = registerPublicPagesRoutes;
