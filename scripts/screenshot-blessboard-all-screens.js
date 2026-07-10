/**
 * BlessBoard Stitch visual screenshots by batch.
 * Usage:
 *   node scripts/screenshot-blessboard-all-screens.js
 *   node scripts/screenshot-blessboard-all-screens.js --batch=A
 *   node scripts/screenshot-blessboard-all-screens.js --batch=B
 *   node scripts/screenshot-blessboard-all-screens.js --batch=C
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
  C: {
    outDir: "member",
    pages: [
      { path: "/member/dashboard", name: "dashboard", verifiedMemberSession: true },
      { path: "/member/profile", name: "profile", verifiedMemberSession: true },
      { path: "/member/announcements", name: "announcements", verifiedMemberSession: true },
      { path: "/member/events", name: "events", verifiedMemberSession: true },
      { path: "/member/my-ministries", name: "ministries", verifiedMemberSession: true },
      { path: "/member/resources", name: "resources", verifiedMemberSession: true },
      { path: "/member/forms", name: "forms", verifiedMemberSession: true },
      { path: "/member/requests/new", name: "requests-new", verifiedMemberSession: true },
      { path: "/member/requests", name: "requests-status", verifiedMemberSession: true },
      { path: "/member/prayer-request", name: "prayer", verifiedMemberSession: true },
      { path: "/member/giving", name: "giving", verifiedMemberSession: true },
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
    req.churchContext = options.churchContext || {
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
    if (options.verifiedMemberSession && options.memberSession) {
      req.session.churchMember = options.memberSession;
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

async function ensureScreenshotMember() {
  const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
  if (!isPgConfigured()) return null;

  const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
  const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
  const branchesRepo = require("../src/db/pg/church/branchesRepo");
  const membersRepo = require("../src/db/pg/church/membersRepo");
  const { ensureCanonicalTenantsForTests } = require("../tests/helpers/pgTestSeed");
  const { TENANT_ZM } = require("../src/tenants/tenantIds");
  const bcrypt = require("bcryptjs");

  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  await ensureChurchSchema(pool);

  const slug = "demo-screenshot-member";
  let org = await organizationsRepo.findOrganizationBySlug(pool, slug);
  if (!org) {
    org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug,
      name: "Kafue Baptist Church",
    });
  }

  let branch = await branchesRepo.findBranchBySlug(pool, org.id, "main");
  if (!branch) {
    branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: "Kafue Baptist Church",
      host_slug: "demo",
    });
  }

  const email = "screenshot.member@example.com";
  let member = await membersRepo.findMemberByEmailOrPhoneForBranch(pool, branch.id, email);
  if (!member) {
    const passwordHash = await bcrypt.hash("testpass123456", 12);
    member = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email,
      phone: "0977123456",
      full_name: "Mary Phiri",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "1-3 years",
    });
  }
  if (member.status !== "verified") {
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branch.id, "verified");
    member = await membersRepo.findMemberByIdForBranch(pool, member.id, branch.id);
  }

  return {
    churchContext: {
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    },
    memberSession: {
      member_id: member.id,
      organization_id: org.id,
      branch_id: branch.id,
      status: "verified",
      full_name: "Mary Phiri",
    },
  };
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--batch="));
  const batchKey = arg ? arg.split("=")[1].toUpperCase() : "A";
  const batch = BATCHES[batchKey];
  if (!batch) {
    console.error("Unknown batch. Use A, B, or C.");
    process.exit(1);
  }

  const outDir = path.join(ROOT, batch.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  let memberSeed = null;
  if (batchKey === "C") {
    try {
      memberSeed = await ensureScreenshotMember();
      if (!memberSeed) {
        console.warn("PG not configured — cannot capture authenticated Batch C screenshots.");
        fs.writeFileSync(
          path.join(outDir, "README.txt"),
          "Batch C requires Postgres so ensureMemberAccountActive can resolve the verified member.\n"
        );
        process.exit(0);
      }
    } catch (err) {
      console.error("Could not seed screenshot member:", err);
      process.exit(1);
    }
  }

  const browser = await chromium.launch();
  let port = PORT;

  try {
    for (const item of batch.pages) {
      const app = makeBranchApp({
        pendingMemberSession: !!item.pendingMemberSession,
        verifiedMemberSession: !!item.verifiedMemberSession,
        churchContext: memberSeed ? memberSeed.churchContext : undefined,
        memberSession: memberSeed ? memberSeed.memberSession : undefined,
      });
      const server = http.createServer(app);
      await new Promise((r) => server.listen(port, "127.0.0.1", r));
      const page = await browser.newPage();
      const base = `http://127.0.0.1:${port}`;
      try {
        await shot(page, `${base}${item.path}`, 390, 844, path.join(outDir, `${item.name}-mobile.png`));
        await shot(page, `${base}${item.path}`, 1440, 900, path.join(outDir, `${item.name}-desktop.png`));
      } catch (err) {
        console.error(`Failed ${item.name}:`, err.message);
        fs.writeFileSync(
          path.join(outDir, `${item.name}-ERROR.txt`),
          `${item.path}\n${err.stack || err.message}\n`
        );
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
