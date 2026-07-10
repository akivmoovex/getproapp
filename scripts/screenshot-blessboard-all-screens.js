/**
 * BlessBoard Stitch visual screenshots by batch.
 * Usage:
 *   node scripts/screenshot-blessboard-all-screens.js
 *   node scripts/screenshot-blessboard-all-screens.js --batch=A
 *   node scripts/screenshot-blessboard-all-screens.js --batch=B
 */
"use strict";

const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const session = require("express-session");
const { chromium } = require("playwright");

const churchRoutes = require("../src/routes/church");

const PORT = 4185;
const ROOT = path.join(__dirname, "../test-results/blessboard-stitch-visual");

const BATCHES = {
  A: {
    outDir: "public-giving",
    pages: [{ path: "/giving", name: "giving" }],
  },
  B: {
    outDir: "auth",
    pages: [
      { path: "/login", name: "login" },
      { path: "/register", name: "register" },
      { path: "/registration-submitted", name: "registration-submitted" },
      { path: "/forgot-password", name: "forgot-password" },
      {
        path: "/waiting-verification",
        name: "waiting-verification",
        pendingMemberSession: true,
      },
    ],
  },
};

function makeBranchApp(options = {}) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use("/church", express.static(path.join(__dirname, "../public/church")));
  app.use(
    session({
      secret: "screenshot-blessboard-auth",
      resave: false,
      saveUninitialized: true,
    })
  );
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
        contact_phone: "+260 211 456 7890",
        contact_email: "info@kafuebaptist.org",
        location_text: "Plot 452, Main Street, Kafue, Zambia",
      },
    };
    if (options.pendingMemberSession) {
      req.session.churchMember = {
        member_id: 9001,
        organization_id: 1,
        branch_id: 1,
        status: "pending",
        full_name: "Demo Pending Member",
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
  await page.waitForTimeout(600);
  await page.screenshot({ path: file, fullPage: true });
  console.log("Wrote", file);
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--batch="));
  const batchKey = arg ? arg.split("=")[1].toUpperCase() : "A";
  const batch = BATCHES[batchKey];
  if (!batch) {
    console.error("Unknown batch. Use A or B (more batches added later).");
    process.exit(1);
  }

  const outDir = path.join(ROOT, batch.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  let port = PORT;

  try {
    for (const item of batch.pages) {
      const app = makeBranchApp({ pendingMemberSession: !!item.pendingMemberSession });
      const server = http.createServer(app);
      await new Promise((r) => server.listen(port, "127.0.0.1", r));
      const page = await browser.newPage();
      const base = `http://127.0.0.1:${port}`;
      try {
        await shot(page, `${base}${item.path}`, 390, 844, path.join(outDir, `${item.name}-mobile.png`));
        await shot(page, `${base}${item.path}`, 1440, 900, path.join(outDir, `${item.name}-desktop.png`));
      } finally {
        await page.close();
        await new Promise((r) => server.close(r));
        port += 1;
      }
    }
  } finally {
    await browser.close();
  }
  console.log("Screenshots in", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
