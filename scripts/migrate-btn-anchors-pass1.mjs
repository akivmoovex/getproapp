#!/usr/bin/env node
/**
 * Pass 1: Replace <a class="...btn...">plain text</a> with no EJS in href/inner.
 * Skips when class has no btn token (e.g. wf-home-nav-btn).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const viewsDir = path.join(repoRoot, "views");

function norm(p) {
  return p.split(path.sep).join("/");
}

function walkEjs(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkEjs(p));
    else if (ent.name.endsWith(".ejs")) out.push(p);
  }
  return out;
}

function classUsesBtnToken(classVal) {
  if (!classVal) return false;
  return classVal.split(/\s+/).some((t) => t === "btn" || t.startsWith("btn--"));
}

function variantFromClass(cls) {
  if (/\bbtn--primary\b/.test(cls)) return "primary";
  if (/\bbtn--secondary\b/.test(cls)) return "secondary";
  if (/\bbtn--outline\b/.test(cls)) return "outline";
  if (/\bbtn--text\b/.test(cls)) return "text";
  if (/\bbtn-footer-solid\b/.test(cls)) return "primary";
  return "default";
}

function extraClassName(cls) {
  return cls
    .split(/\s+/)
    .filter((c) => c && c !== "btn" && !c.startsWith("btn--"))
    .join(" ")
    .trim();
}

function includePathFor(file) {
  const rel = norm(path.relative(viewsDir, file));
  if (rel.startsWith("admin/")) return "../partials/components/button";
  if (rel.startsWith("partials/")) return "components/button";
  return "partials/components/button";
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function migrate(html, inc) {
  return html.replace(/<a\s+([^>]+)>([\s\S]*?)<\/a>/gi, (full, attrs, inner) => {
    const cm = attrs.match(/\bclass="([^"]*)"/i);
    if (!cm || !classUsesBtnToken(cm[1])) return full;
    if (inner.includes("<") && !/^\s*$/.test(inner)) {
      const t = inner.trim();
      if (t.startsWith("<%") && t.endsWith("%>") && !inner.includes("<", 2)) {
        /* allow <%= text %> only */
      } else if (inner.includes("<")) return full;
    }
    if (attrs.includes("<%") || inner.includes("<%")) return full;
    const hm = attrs.match(/\bhref="([^"]*)"/i);
    if (!hm) return full;

    const cls = cm[1];
    const variant = variantFromClass(cls);
    const className = extraClassName(cls);
    const href = hm[1];
    const label = decodeEntities(inner.replace(/^\s+|\s+$/g, ""));

    const targetM = attrs.match(/\btarget="([^"]*)"/i);
    const relM = attrs.match(/\brel="([^"]*)"/i);
    const roleM = attrs.match(/\brole="([^"]*)"/i);
    const ariaM = attrs.match(/\baria-label="([^"]*)"/i);
    const dirM = attrs.match(/\bdir="([^"]*)"/i);

    const parts = [`variant: '${variant}'`, `href: '${href.replace(/'/g, "\\'")}'`, `label: '${label.replace(/'/g, "\\'")}'`];
    if (className) parts.push(`className: '${className.replace(/'/g, "\\'")}'`);
    if (ariaM) parts.push(`ariaLabel: '${ariaM[1].replace(/'/g, "\\'")}'`);
    const extras = [];
    if (targetM) extras.push(`target="${targetM[1]}"`);
    if (relM) extras.push(`rel="${relM[1]}"`);
    if (roleM) extras.push(`role="${roleM[1]}"`);
    if (dirM) extras.push(`dir="${dirM[1]}"`);
    if (extras.length) parts.push(`extraAttrs: '${extras.join(" ").replace(/'/g, "\\'")}'`);

    return `<%- include('${inc}', { ${parts.join(", ")} }) %>`;
  });
}

let touched = 0;
for (const f of walkEjs(viewsDir)) {
  const raw = fs.readFileSync(f, "utf8");
  const inc = includePathFor(f);
  const next = migrate(raw, inc);
  if (next !== raw) {
    fs.writeFileSync(f, next, "utf8");
    touched++;
    console.log(norm(path.relative(repoRoot, f)));
  }
}
console.log("pass1 files touched:", touched);
