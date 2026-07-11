/**
 * Generate BlessBoard Events + Sermons screenshots for visual QA.
 * Usage: node scripts/screenshot-blessboard-events-sermons.js
 */
"use strict";

const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const { chromium } = require("playwright");

const churchRoutes = require("../src/routes/church");
const websiteContentService = require("../src/services/church/websiteContentService");

const OUT_DIR = path.join(__dirname, "../test-results/blessboard-events-sermons-visual");
const PORT = 4183;

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

function makeBranchApp({ populated } = {}) {
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
        name: "Kafue Main Campus",
        status: "active",
        host_slug: "demo",
        welcome_message: "Experience grace, find community, and grow in faith with us in Kafue.",
        location_text: "Plot 452, Lusaka Road, Kafue, Zambia",
      },
    };
    next();
  });

  if (populated) {
    app.use((req, res, next) => {
      const render = res.render.bind(res);
      res.render = (view, locals, cb) => {
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        if (String(view).includes("church/public/events")) {
          const nextLocals = {
            ...(locals || {}),
            ...websiteContentService.preparePublicViewModel(org, branch, {}, { activePage: "events" }),
            activePage: "events",
            isVerticalApex: false,
            upcomingEvents: [
              {
                title: "Echoes of Grace Worship Night",
                day: "24",
                month: "OCT",
                time: "18:00 – 20:00",
                location: "Main Sanctuary",
                category: "Worship",
                description: "An evening of praise and prayer.",
                image: "",
              },
              {
                title: "Servant Leaders Workshop",
                day: "28",
                month: "OCT",
                time: "09:00 – 12:00",
                location: "Fellowship Hall",
                category: "Leadership",
                description: "",
                image: "",
              },
              {
                title: "Awaken Youth Rally",
                day: "02",
                month: "NOV",
                time: "15:00",
                location: "Community Park",
                category: "Youth",
                description: "Youth gathering with worship and teaching.",
                image: "",
              },
            ],
          };
          return render(view, nextLocals, cb);
        }
        if (String(view).includes("church/public/sermons")) {
          const nextLocals = {
            ...(locals || {}),
            ...websiteContentService.preparePublicViewModel(org, branch, {}, { activePage: "sermons" }),
            activePage: "sermons",
            isVerticalApex: false,
            sermonSamples: [
              {
                title: "The Audacity of Grace",
                speaker: "Pastor David Mwamba",
                date: "27 Oct 2024",
                scripture: "Ephesians 2:1-10",
                description: "Exploring the transforming power of grace.",
                media_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                videoEmbedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
                videoUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
                audioUrl: null,
                pdfUrl: null,
                mediaType: "video",
                category: "Sunday Sermon",
                icon: "play_circle",
              },
              {
                title: "Finding Peace in Chaos",
                speaker: "Pastor Sarah Johnson",
                date: "3 Nov 2024",
                scripture: "John 14:27",
                description: "",
                media_url: "https://example.com/peace.mp3",
                videoEmbedUrl: null,
                videoUrl: null,
                audioUrl: null,
                pdfUrl: null,
                mediaType: "audio",
                category: "Standalone Sermon",
                icon: "headphones",
              },
              {
                title: "Faith in Uncertain Times",
                speaker: "Elder Levi Phiri",
                date: "12 Nov 2024",
                scripture: "",
                description: "",
                media_url: "",
                videoEmbedUrl: null,
                videoUrl: null,
                audioUrl: null,
                pdfUrl: null,
                mediaType: null,
                category: "Midweek",
                icon: "menu_book",
              },
            ],
            sermonResourceCards: [],
          };
          return render(view, nextLocals, cb);
        }
        return render(view, locals, cb);
      };
      next();
    });
  }

  app.use(churchRoutes());
  return app;
}

async function shot(page, url, width, height, file) {
  await page.setViewportSize({ width, height });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(400);
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const widest = Math.max(
      ...Array.from(document.querySelectorAll("body *")).map((el) => {
        const r = el.getBoundingClientRect();
        return r.right;
      }),
      doc.scrollWidth
    );
    return {
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
      overflowX: doc.scrollWidth > window.innerWidth + 1,
      widest,
    };
  });
  await page.screenshot({ path: file, fullPage: true });
  console.log(
    "Wrote",
    path.basename(file),
    metrics.overflowX ? `OVERFLOW sw=${metrics.scrollWidth} iw=${metrics.innerWidth}` : "ok"
  );
  return metrics;
}

async function captureSuite(label, populated) {
  const app = makeBranchApp({ populated });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const base = `http://127.0.0.1:${PORT}`;
  const results = [];
  try {
    for (const route of ["events", "sermons"]) {
      for (const vp of VIEWPORTS) {
        const file = path.join(OUT_DIR, `${label}-${route}-${vp.name}.png`);
        const metrics = await shot(page, `${base}/${route}`, vp.width, vp.height, file);
        results.push({ label, route, vp: vp.name, ...metrics });
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  return results;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const empty = await captureSuite("empty", false);
  const populated = await captureSuite("populated", true);
  const bad = [...empty, ...populated].filter((r) => r.overflowX);
  if (bad.length) {
    console.error("Horizontal overflow detected:", bad);
    process.exitCode = 1;
  } else {
    console.log("No horizontal overflow across all viewports.");
  }
  console.log("Screenshots in", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
