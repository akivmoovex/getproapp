#!/usr/bin/env node
/**
 * One-off migrator (already applied in repo). Do not re-run blindly — it breaks
 * buttons with EJS inside the tag (e.g. `<% ... %>>Label`).
 * Replace simple <button class="...btn...">text</button> only.
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

function includePath(file) {
  const rel = norm(path.relative(viewsDir, file));
  if (rel.startsWith("admin/")) return "../partials/components/button";
  if (rel.startsWith("partials/")) return "components/button";
  return "partials/components/button";
}

function parseClass(attrs) {
  const m = attrs.match(/\bclass="([^"]*)"/);
  return m ? m[1] : "";
}

function variantFromClass(cls) {
  if (/\bbtn--danger-outline\b/.test(cls)) return "danger-outline";
  if (/\bbtn--primary\b/.test(cls)) return "primary";
  if (/\bbtn--secondary\b/.test(cls)) return "secondary";
  if (/\bbtn--outline\b/.test(cls)) return "outline";
  if (/\bbtn--text\b/.test(cls)) return "text";
  if (/\bbtn--icon\b/.test(cls)) return "icon";
  if (/\bbtn\b/.test(cls)) return "default";
  return "primary";
}

function sizeFromClass(cls) {
  if (/\bbtn--sm\b/.test(cls)) return "sm";
  if (/\bbtn--lg\b/.test(cls)) return "lg";
  if (/\bbtn--icon\b/.test(cls)) return "icon";
  return "";
}

function extractAttr(attrs, name) {
  const re = new RegExp(`\\b${name}="([^"]*)"`, "i");
  const m = attrs.match(re);
  return m ? m[1] : "";
}

function extraClassName(cls) {
  return cls
    .split(/\s+/)
    .filter(
      (c) =>
        c &&
        !/^btn(--|$)/.test(c)
    )
    .join(" ")
    .trim();
}

function migrateContent(s, inc) {
  const re = /<button(\s[^>]*)>([\s\S]*?)<\/button>/gi;
  return s.replace(re, (full, attrs, inner) => {
    if (!/\bclass="[^"]*\bbtn\b/.test(attrs)) return full;
    if (inner.includes("<%") || inner.includes("%>")) return full;
    const text = inner.replace(/^\s+|\s+$/g, "");
    if (!text || /<[^>]+>/.test(text)) return full;

    const cls = parseClass(attrs);
    const variant = variantFromClass(cls);
    const size = sizeFromClass(cls);
    const type = /\btype="submit"/i.test(attrs) ? "submit" : "button";
    const id = extractAttr(attrs, "id");
    const name = extractAttr(attrs, "name");
    const value = extractAttr(attrs, "value");
    const form = extractAttr(attrs, "form");
    const disabled = /\bdisabled\b/i.test(attrs);
    const hidden = /\bhidden\b/i.test(attrs);
    const ariaLabel = extractAttr(attrs, "aria-label");
    const className = extraClassName(cls);
    const fullWidth = /\bbtn-block\b/.test(cls);

    const props = [`variant: '${variant}'`, `type: '${type}'`, `label: '${text.replace(/'/g, "\\'")}'`];
    if (size) props.push(`size: '${size}'`);
    if (id) props.push(`id: '${id}'`);
    if (name) props.push(`name: '${name}'`);
    if (value) props.push(`value: '${value.replace(/'/g, "\\'")}'`);
    if (form) props.push(`form: '${form}'`);
    if (disabled) props.push(`disabled: true`);
    if (hidden) props.push(`hidden: true`);
    if (ariaLabel) props.push(`ariaLabel: '${ariaLabel.replace(/'/g, "\\'")}'`);
    if (className) props.push(`className: '${className.replace(/'/g, "\\'")}'`);
    if (fullWidth) props.push(`fullWidth: true`);

    return `<%- include('${inc}', { ${props.join(", ")} }) %>`;
  });
}

let changed = 0;
for (const f of walkEjs(viewsDir)) {
  if (norm(f).endsWith("/partials/components/button.ejs")) continue;
  const raw = fs.readFileSync(f, "utf8");
  const inc = includePath(f);
  const next = migrateContent(raw, inc);
  if (next !== raw) {
    fs.writeFileSync(f, next, "utf8");
    changed++;
    console.log("migrated:", norm(path.relative(repoRoot, f)));
  }
}
console.log("done, files touched:", changed);
