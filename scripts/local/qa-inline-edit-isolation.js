#!/usr/bin/env node
"use strict";

/**
 * Inline-edit isolation probe.
 *
 * `/c/:org/branches/:branch` is a PUBLIC page, so a 200 proves nothing. What
 * matters is whether the page hands the signed-in actor edit affordances. This
 * compares the Lusaka branch admin's own branch against a sibling branch and
 * the church-wide page. Read-only GETs, no secrets printed.
 */

const HOST = "https://blessboard.pronline.org";

const PERSONAS = {
  BB_BRANCH: "qa.branch_administrator@demo-church.example.test",
  BB_HQ: "qa.organisation_administrator@demo-church.example.test",
};

const TARGETS = [
  ["own branch (Lusaka)", "/c/demo-church/branches/demo-church-lusaka?website_edit=1"],
  ["sibling branch (Ndola)", "/c/demo-church/branches/demo-church-ndola?website_edit=1"],
  ["sibling branch (Mazabuka)", "/c/demo-church/branches/demo-mazabuka?website_edit=1"],
  ["church-wide", "/c/demo-church?website_edit=1"],
];

function jarFrom(res) {
  const jar = new Map();
  for (const line of res.headers.getSetCookie()) {
    const first = String(line).split(";")[0];
    const eq = first.indexOf("=");
    if (eq > 0) jar.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
  }
  return jar;
}
const hdr = (jar) => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

async function login(email, password) {
  const g = await fetch(`${HOST}/login`, { redirect: "manual", headers: { accept: "text/html" } });
  const html = await g.text();
  const jar = jarFrom(g);
  const csrf = html.match(/name="_csrf"[^>]*value="([^"]*)"/)[1];
  const post = await fetch(`${HOST}/login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: hdr(jar),
      origin: HOST,
      referer: `${HOST}/login`,
      accept: "text/html",
    },
    body: new URLSearchParams({ email, password, _csrf: csrf }),
  });
  if (post.status !== 303) throw new Error(`login failed for ${email}: HTTP ${post.status}`);
  return new Map([...jar, ...jarFrom(post)]);
}

/** Concrete edit affordances rendered by the BlessBoard template pack. */
function editSignals(html) {
  return {
    editToolbar: (html.match(/data-bb-edit-toolbar/gi) || []).length,
    editingFlag: (html.match(/data-bb-website-editing|bb-tp-body--editing/gi) || []).length,
    saveUrl: (html.match(/data-bb-save-url/gi) || []).length,
    publishUrl: (html.match(/data-bb-publish-url/gi) || []).length,
  };
}

/** The scope the editor believes it is editing, if it says so. */
function editScope(html) {
  const m = html.match(/data-bb-edit-scope="([^"]*)"/);
  return m ? m[1] : null;
}

async function main() {
  const password = require("fs")
    .readFileSync("docs/blessboard/BLESSBOARD_QA_ROLE_USERS.md", "utf8")
    .match(/--password=(\S+)/)[1];

  for (const [label, email] of Object.entries(PERSONAS)) {
    console.log(`\n== ${label} (${email}) ==`);
    const jar = await login(email, password);
    for (const [name, path] of TARGETS) {
      const res = await fetch(new URL(path, HOST), {
        redirect: "manual",
        headers: { cookie: hdr(jar), accept: "text/html" },
      });
      if (res.status !== 200) {
        console.log(`  ${name.padEnd(26)} HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      const sig = editSignals(html);
      const total = Object.values(sig).reduce((a, b) => a + b, 0);
      const scope = editScope(html);
      console.log(
        `  ${name.padEnd(26)} HTTP 200 editable=${total > 0 ? "YES" : "no "} ` +
          `(toolbar=${sig.editToolbar} editing=${sig.editingFlag} save=${sig.saveUrl} publish=${sig.publishUrl})` +
          `${scope ? " scope=" + scope : ""} bytes=${html.length}`
      );
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
