/**
 * Home + Ministries regression screenshots vs newest Stitch.
 * Usage: node scripts/screenshot-blessboard-home-ministries-regression.js
 */
"use strict";

const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const { chromium } = require("playwright");

const churchRoutes = require("../src/routes/church");
const websiteContentService = require("../src/services/church/websiteContentService");

const OUT_DIR = path.join(__dirname, "../test-results/blessboard-home-ministries-regression");
const PORT = 4192;

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1024", width: 1024, height: 768 },
  { name: "900", width: 900, height: 800 },
  { name: "768", width: 768, height: 1024 },
  { name: "430", width: 430, height: 932 },
  { name: "390", width: 390, height: 844 },
  { name: "360", width: 360, height: 800 },
];

function makeApp({ mode } = {}) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use("/church", express.static(path.join(__dirname, "../public/church")));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      orgSlug: "demo",
      organization: { id: 1, name: "Kafue Baptist Church", status: "active" },
      branch: {
        id: 1,
        name: "Main Campus",
        status: "active",
        host_slug: "demo",
        welcome_message: "Connecting the community through faith, fellowship, and purposeful action.",
        service_times:
          mode === "empty"
            ? ""
            : "Sunday Morning · 09:00 AM — 11:30 AM\nMid-Week Bible Study · Wed 05:30 PM",
        location_text: mode === "empty" ? "" : "Plot 1245, Great North Road, Kafue, Zambia",
        contact_phone: mode === "empty" ? "" : "+260 97 123 4567",
        contact_email: mode === "empty" ? "" : "hello@example.com",
      },
    };
    next();
  });

  app.use((req, res, next) => {
    const render = res.render.bind(res);
    res.render = (view, locals, cb) => {
      const org = req.churchContext.organization;
      const branch = req.churchContext.branch;
      const isMin = String(view).includes("ministries");
      const base = websiteContentService.preparePublicViewModel(org, branch, {}, {
        activePage: isMin ? "ministries" : "home",
      });
      const extra = { ...base, ...(locals || {}), isVerticalApex: false };
      if (mode === "populated" || mode === "one-ministry" || mode === "several") {
        extra.publicAnnouncements = [
          { title: "Annual Youth Summit 2024", body: "Join us for worship and fellowship.", category: "General", published_at: "Sept 12, 2024" },
        ];
        extra.upcomingEvents = [
          { title: "Community Prayer Night", day: "24", month: "OCT", time: "18:00", location: "Main Sanctuary", description: "Prayer evening." },
        ];
        extra.hasDbEvents = true;
        extra.featuredSermon = { title: "Faith That Moves Mountains", speaker: "Pastor Lee", date: "Last Sunday", description: "A message on trusting God." };
        extra.hasDbSermons = true;
        extra.givingTeaser = "Support our mission safely and securely.";
        const ministries =
          mode === "one-ministry"
            ? [{ name: "Youth Ministry", description: "Empowering the next generation.", meeting_day: "Friday", meeting_time: "16:00" }]
            : [
                { name: "Youth Ministry", description: "Empowering the next generation through fellowship.", meeting_day: "Friday", meeting_time: "16:00" },
                { name: "Children's Ministry", description: "A safe nurturing environment for kids.", meeting_day: "Sunday", meeting_time: "09:00" },
                { name: "Women's Fellowship", description: "Growing together in faith.", meeting_day: "Tuesday", meeting_time: "10:00" },
                { name: "Men's Ministry", description: "Brotherhood and discipleship.", meeting_day: "Saturday", meeting_time: "07:00" },
                { name: "Music & Worship", description: "Leading the congregation in praise.", meeting_day: "Thursday", meeting_time: "18:00" },
              ];
        extra.publicMinistries = ministries.slice(0, 4);
        extra.ministries = ministries;
        if (mode !== "one-ministry") {
          extra.ministryFilters = [
            { key: "all", label: "All Ministries" },
            { key: "friday", label: "Friday" },
            { key: "sunday", label: "Sunday" },
          ];
        }
      }
      return render(view, extra, cb);
    };
    next();
  });

  app.use(churchRoutes());
  return app;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  for (const mode of ["populated", "empty", "one-ministry", "several"]) {
    const app = makeApp({ mode });
    const server = http.createServer(app);
    await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
    try {
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        page.on("pageerror", (err) => results.push({ mode, vp: vp.name, error: String(err) }));
        for (const route of ["/", "/ministries"]) {
          const label = route === "/" ? "home" : "ministries";
          await page.goto(`http://127.0.0.1:${PORT}${route}`, { waitUntil: "networkidle" });
          const overflow = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
          }));
          const file = path.join(OUT_DIR, `${mode}-${label}-${vp.name}.png`);
          await page.screenshot({ path: file, fullPage: true });
          results.push({ mode, route: label, vp: vp.name, ...overflow });
        }
        await page.close();
      }
    } finally {
      await new Promise((r) => server.close(r));
    }
  }

  await browser.close();
  const summary = {
    outDir: OUT_DIR,
    checked: results.length,
    overflows: results.filter((r) => r.scrollWidth > r.innerWidth),
    errors: results.filter((r) => r.error),
  };
  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (summary.overflows.length || summary.errors.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
