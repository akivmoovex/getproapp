#!/usr/bin/env node
"use strict";

/**
 * Hosted TESTING login readiness check.
 *
 * Performs a real sign-in against the hosted testing app for each persona and
 * reports only status codes, redirect targets and cookie names. Passwords are
 * read from argv/stdin or the documented testing default and are never printed
 * or logged. Refuses any host that is not a known testing host.
 *
 * Usage:
 *   node scripts/local/qa-hosted-login-check.js --password-stdin < secret
 *   node scripts/local/qa-hosted-login-check.js            # documented default
 */

const ALLOWED_HOSTS = Object.freeze([
  "blessboard.pronline.org",
  "activeclinic.pronline.org",
]);

function assertTestingHost(url) {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error(`refusing non-https url: ${url}`);
  if (!ALLOWED_HOSTS.includes(u.hostname)) {
    throw new Error(`refusing non-testing host: ${u.hostname}`);
  }
  return u;
}

function cookieJarFrom(setCookie) {
  const jar = new Map();
  for (const line of [].concat(setCookie || [])) {
    const first = String(line).split(";")[0];
    const eq = first.indexOf("=");
    if (eq > 0) jar.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
  }
  return jar;
}

function jarHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function extractCsrf(html) {
  const m = html.match(/name="_csrf"[^>]*value="([^"]*)"/) || html.match(/value="([^"]*)"[^>]*name="_csrf"/);
  return m ? m[1] : null;
}

async function attemptLogin(loginUrl, fields, password, opts) {
  const u = assertTestingHost(loginUrl);
  const getRes = await fetch(u, { redirect: "manual", headers: { accept: "text/html" } });
  const html = await getRes.text();
  const jar = cookieJarFrom(getRes.headers.getSetCookie ? getRes.headers.getSetCookie() : getRes.headers.raw?.()["set-cookie"]);
  const csrf = extractCsrf(html);

  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  body.set("password", password);
  if (csrf) body.set("_csrf", csrf);

  const postRes = await fetch(u, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: jarHeader(jar),
      accept: "text/html",
      origin: u.origin,
      referer: u.toString(),
    },
    body,
  });
  const postJar = cookieJarFrom(postRes.headers.getSetCookie ? postRes.headers.getSetCookie() : postRes.headers.raw?.()["set-cookie"]);
  const location = postRes.headers.get("location");

  let landed = null;
  const sessionCookieNames = [...postJar.keys()].filter((n) => /_sid$/.test(n));
  if (location && sessionCookieNames.length) {
    const merged = new Map([...jar, ...postJar]);
    const target = new URL(location, u.origin);
    if (ALLOWED_HOSTS.includes(target.hostname)) {
      const followed = await fetch(target, {
        redirect: "manual",
        headers: { cookie: jarHeader(merged), accept: "text/html" },
      });
      landed = { url: target.pathname, status: followed.status, location: followed.headers.get("location") };
    }
  }

  return {
    jar: new Map([...jar, ...postJar]),
    origin: u.origin,
    getStatus: getRes.status,
    csrfPresent: Boolean(csrf),
    csrfCookies: [...jar.keys()],
    postStatus: postRes.status,
    redirect: location,
    sessionCookieSet: sessionCookieNames,
    landed,
    // A failed sign-in re-renders the form; detect without echoing credentials.
    postLooksLikeError: postRes.status === 200 && /Sign in|invalid|not available/i.test(await postRes.clone().text()),
  };
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.some((a) => a.startsWith("--password="))) {
    console.error("refusing --password on argv; use --password-stdin");
    process.exit(2);
  }
  let password = null;
  if (argv.includes("--password-stdin")) {
    password = await readStdin();
  } else {
    // Documented shared testing password for the demo-church QA role users.
    password = require("fs")
      .readFileSync("docs/blessboard/BLESSBOARD_QA_ROLE_USERS.md", "utf8")
      .match(/--password=(\S+)/)[1];
  }
  if (!password) {
    console.error("no password available");
    process.exit(2);
  }

  const targets = [
    {
      label: "BB_HQ",
      url: "https://blessboard.pronline.org/login",
      fields: { email: "qa.organisation_administrator@demo-church.example.test" },
      expectRedirect: "/hq",
      surfaces: [
        ["website admin (edit)", "/hq/website"],
        ["publish review", "/hq/website/publish/review"],
        ["version history", "/hq/website/version-history"],
        ["church public page", "/c/demo-church"],
        ["content admin", "/hq/content"],
        ["media library", "/hq/content/media"],
      ],
    },
    {
      label: "BB_BRANCH",
      url: "https://blessboard.pronline.org/login",
      fields: { email: "qa.branch_administrator@demo-church.example.test" },
      expectRedirect: "/branch-admin",
      surfaces: [
        [
          "branch website entry",
          "/branch-admin/website",
          303,
          "KNOWN ISSUE: redirects to church-wide /c/demo-church (not branch-scoped); use the branch editor URL below",
        ],
        [
          "branch website editor",
          "/c/demo-church/branches/demo-church-lusaka?website_edit=1",
        ],
        ["branch public page", "/c/demo-church/branches/demo-church-lusaka"],
        ["branch content admin", "/branch-admin/content"],
        ["branch service times", "/branch-admin/website/service-times"],
        ["branch media library", "/branch-admin/content/media"],
      ],
      // Only admin surfaces belong here. /c/... is the PUBLIC site and correctly
      // returns 200 to anyone; branch isolation there is proven by the absence of
      // edit affordances, which qa-inline-edit-isolation.js measures.
      denied: [
        ["hq website editor", "/hq/website"],
        ["hq publish review", "/hq/website/publish/review"],
        ["hq version history", "/hq/website/version-history"],
      ],
    },
    {
      label: "AC_ADMIN",
      url: "https://activeclinic.pronline.org/login",
      fields: { identifier: "qa.fullproduct.260817235630@example.test" },
      expectRedirect: "/app",
      surfaces: [
        ["website CMS (edit)", "/app/settings/website"],
        ["website pages", "/app/settings/website/pages"],
        ["website media", "/app/settings/website/media"],
      ],
    },
  ];

  let failures = 0;
  for (const t of targets) {
    process.stdout.write(`\n== ${t.label} @ ${t.url} ==\n`);
    try {
      const r = await attemptLogin(t.url, t.fields, password);
      console.log(`  GET login          : HTTP ${r.getStatus}, csrf token ${r.csrfPresent ? "present" : "MISSING"}, cookies=[${r.csrfCookies.join(", ")}]`);
      console.log(`  POST login         : HTTP ${r.postStatus}${r.redirect ? " -> " + r.redirect : ""}`);
      console.log(`  session cookie set : ${r.sessionCookieSet.length ? r.sessionCookieSet.join(", ") : "NONE"}`);
      if (r.landed) console.log(`  followed ${r.landed.url}: HTTP ${r.landed.status}${r.landed.location ? " -> " + r.landed.location : ""}`);
      const ok = r.postStatus === 303 && r.sessionCookieSet.length > 0;
      console.log(`  RESULT             : ${ok ? "LOGIN OK" : "LOGIN FAILED"}${ok && t.expectRedirect && r.redirect !== t.expectRedirect ? ` (note: redirect ${r.redirect}, expected ${t.expectRedirect})` : ""}`);
      if (!ok) failures += 1;

      if (ok && Array.isArray(t.denied)) {
        const cookie = jarHeader(r.jar);
        for (const [name, path] of t.denied) {
          const res = await fetch(new URL(path, r.origin), {
            redirect: "manual",
            headers: { cookie, accept: "text/html" },
          });
          const loc = res.headers.get("location");
          // Isolation holds as long as the surface is not served.
          const good = res.status !== 200;
          console.log(
            `    [${good ? "OK " : "!! "}] DENY ${name.padEnd(21)} ${path} -> HTTP ${res.status}${loc ? " -> " + loc : ""}`
          );
          if (!good) failures += 1;
        }
      }

      if (ok && Array.isArray(t.surfaces)) {
        const cookie = jarHeader(r.jar);
        for (const entry of t.surfaces) {
          const [name, path, expected, note] = entry;
          const want = expected || 200;
          const res = await fetch(new URL(path, r.origin), {
            redirect: "manual",
            headers: { cookie, accept: "text/html" },
          });
          const loc = res.headers.get("location");
          const good = res.status === want;
          console.log(
            `    [${good ? "OK " : "!! "}] ${name.padEnd(26)} ${path} -> HTTP ${res.status}${loc ? " -> " + loc : ""}${note ? "  # " + note : ""}`
          );
          if (!good) failures += 1;
        }
      }
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      failures += 1;
    }
  }
  console.log(`\nlogin failures: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
