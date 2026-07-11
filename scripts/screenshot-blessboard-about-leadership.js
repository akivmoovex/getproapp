/**
 * Generate BlessBoard About + Leadership screenshots for visual QA.
 * Usage: node scripts/screenshot-blessboard-about-leadership.js
 */
"use strict";

const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const { chromium } = require("playwright");

const churchRoutes = require("../src/routes/church");
const websiteContentService = require("../src/services/church/websiteContentService");

const OUT_DIR = path.join(__dirname, "../test-results/blessboard-about-leadership-visual");
const PORT = 4181;

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
        service_times: "Sunday Morning · 09:00 AM",
        location_text: "Plot 452, Lusaka Road, Kafue, Zambia",
        address: "Plot 452, Lusaka Road, Kafue, Zambia",
      },
    };
    next();
  });

  if (populated) {
    app.use((req, res, next) => {
      const render = res.render.bind(res);
      res.render = (view, locals, cb) => {
        if (String(view).includes("church/public/about") || String(view).includes("church/public/leadership")) {
          const org = req.churchContext.organization;
          const branch = req.churchContext.branch;
          const content = {
            about_title: "About Our Church",
            about_body:
              "What began as a small gathering of faithful individuals has grown into a cornerstone of the Kafue community. We create space where stories intertwine with faith and hope.",
            mission_text:
              "To glorify God by making disciples of Jesus Christ, fostering genuine love, and serving our neighbors with structured compassion.",
            vision_text:
              "To see Kafue transformed by the love of Christ, where every individual finds hope, purpose, and a home.",
            values_text:
              "Spiritual Excellence|Honoring God in all we do.\nCommunity Care|Supporting each other through all seasons.\nBiblical Integrity|Guided by the unchanging Word.",
            address: branch.address,
            location_text: branch.location_text,
            welcome_message: branch.welcome_message,
            leadership_json: {
              pastor: {
                name: "Rev. Dr. Samuel Musonda",
                title: "Senior Lead Pastor",
                bio: "With over 25 years of ministry experience, Pastor Samuel leads with a vision for transformative faith and community empowerment.",
              },
              assistant_pastor: { name: "Pastor Sarah Phiri", title: "Associate Pastor" },
              elders: ["Elder Joseph Banda", "Elder Mark Musonda"],
            },
          };
          const activePage = String(view).includes("leadership") ? "leadership" : "about";
          const nextLocals = {
            ...(locals || {}),
            ...websiteContentService.preparePublicViewModel(org, branch, content, { activePage }),
            activePage,
            isVerticalApex: false,
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
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflowX: doc.scrollWidth > doc.clientWidth + 1,
    };
  });
  await page.screenshot({ path: file, fullPage: true });
  console.log("Wrote", file, overflow.overflowX ? `OVERFLOW x=${overflow.scrollWidth}` : "ok");
  return overflow;
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
    for (const route of ["about", "leadership"]) {
      for (const vp of VIEWPORTS) {
        const file = path.join(OUT_DIR, `${label}-${route}-${vp.name}.png`);
        const overflow = await shot(page, `${base}/${route}`, vp.width, vp.height, file);
        results.push({ label, route, vp: vp.name, overflowX: overflow.overflowX });
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
  }
  console.log("Screenshots in", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
