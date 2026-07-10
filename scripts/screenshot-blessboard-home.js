/**
 * Generate BlessBoard public homepage screenshots for visual QA.
 * Usage: node scripts/screenshot-blessboard-home.js
 */
"use strict";

const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const { chromium } = require("playwright");

const churchRoutes = require("../src/routes/church");

const OUT_DIR = path.join(__dirname, "../tmp/blessboard-home-screenshots");
const PORT = 4179;

function makeApp(kind) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use("/church", express.static(path.join(__dirname, "../public/church")));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    if (kind === "apex") {
      req.churchContext = { kind: "vertical-apex", host: "blessboard.com", organization: null, branch: null };
    } else {
      req.churchContext = {
        kind: "branch",
        orgSlug: "demo",
        organization: { id: 1, name: "Kafue Baptist Church", status: "active" },
        branch: {
          id: 1,
          name: "Kafue Baptist Church",
          status: "active",
          host_slug: "demo",
          welcome_message: "Experience grace, find community, and grow in faith with us in Kafue.",
          service_times:
            "Sunday Morning · 09:00 AM · Main Worship Service & Sunday School\nSunday Evening · 17:30 PM · Reflective Worship & Communion\nWednesday · 18:00 PM · Mid-week Bible Study & Prayer",
          location_text: "Plot 1245, Great North Road, Kafue, Zambia",
        },
      };
    }
    next();
  });
  app.use(churchRoutes());
  return app;
}

async function shot(page, url, width, height, file) {
  await page.setViewportSize({ width, height });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: file, fullPage: true });
  console.log("Wrote", file);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const apexApp = makeApp("apex");
  const branchApp = makeApp("branch");
  const apexServer = http.createServer(apexApp);
  const branchServer = http.createServer(branchApp);

  await new Promise((r) => apexServer.listen(PORT, "127.0.0.1", r));
  await new Promise((r) => branchServer.listen(PORT + 1, "127.0.0.1", r));

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await shot(
      page,
      `http://127.0.0.1:${PORT}/`,
      1440,
      900,
      path.join(OUT_DIR, "apex-desktop-1440.png")
    );
    await shot(
      page,
      `http://127.0.0.1:${PORT}/`,
      390,
      844,
      path.join(OUT_DIR, "apex-mobile-390.png")
    );
    await shot(
      page,
      `http://127.0.0.1:${PORT + 1}/`,
      390,
      844,
      path.join(OUT_DIR, "branch-mobile-390.png")
    );
    await shot(
      page,
      `http://127.0.0.1:${PORT + 1}/`,
      1440,
      900,
      path.join(OUT_DIR, "branch-desktop-1440.png")
    );
  } finally {
    await browser.close();
    apexServer.close();
    branchServer.close();
  }

  console.log("Screenshots in", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
