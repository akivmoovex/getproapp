/**
 * Generate BlessBoard public Contact/Ministries/Events/Sermons screenshots.
 * Usage: node scripts/screenshot-blessboard-public-screens.js
 */
"use strict";

const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const { chromium } = require("playwright");

const churchRoutes = require("../src/routes/church");

const OUT_DIR = path.join(__dirname, "../test-results/blessboard-public-screens-visual");
const PORT = 4183;

function makeBranchApp() {
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
        name: "Kafue Baptist Church",
        status: "active",
        host_slug: "demo",
        welcome_message: "Experience grace, find community, and grow in faith with us in Kafue.",
        service_times:
          "Sunday Morning · 09:00 AM · Main Worship Service\nSunday Mid-day · 11:00 AM · Mid-day Service",
        location_text: "Plot 452, Main Street, Kafue, Zambia",
        address: "Plot 452, Main Street, Kafue, Zambia",
        contact_phone: "+260 211 456 7890",
        contact_email: "info@kafuebaptist.org",
        office_hours: "Mon - Fri: 08:00 - 17:00\nSaturday: 09:00 - 12:00\nSunday: Services Only",
      },
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

async function shot(page, url, width, height, file) {
  await page.setViewportSize({ width, height });
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: file, fullPage: true });
  console.log("Wrote", file);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const app = makeBranchApp();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const base = `http://127.0.0.1:${PORT}`;
  const pages = ["contact", "ministries", "events", "sermons"];

  try {
    for (const name of pages) {
      await shot(page, `${base}/${name}`, 390, 844, path.join(OUT_DIR, `${name}-mobile.png`));
      await shot(page, `${base}/${name}`, 1440, 900, path.join(OUT_DIR, `${name}-desktop.png`));
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log("Screenshots in", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
