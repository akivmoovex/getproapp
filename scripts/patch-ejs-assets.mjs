#!/usr/bin/env node
/**
 * One-off / repeatable: rewrite EJS asset tags to use res.locals.asset().
 * Run from repo root: node scripts/patch-ejs-assets.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viewsDir = path.join(__dirname, "..", "views");

const rules = [
  [/href="\/styles\.css\?v=<%= stylesVersion %>"/g, 'href="<%= asset(\'styles\') %>"'],
  [/src="\/scripts\.js\?v=<%= stylesVersion %>"/g, 'src="<%= asset(\'scripts\') %>"'],
  [
    /src="\/theme-prefs\.js\?v=<%= typeof stylesVersion !== 'undefined' \? stylesVersion : '1' %>"/g,
    'src="<%= asset(\'theme-prefs\') %>"',
  ],
  [/src="\/js\/ui-guard\.js\?v=<%= typeof stylesVersion !== 'undefined' \? stylesVersion : '1' %>"/g, 'src="<%= asset(\'ui-guard\') %>"'],
  [/src="\/company-portal\.js\?v=<%= stylesVersion %>"/g, 'src="<%= asset(\'company-portal\') %>"'],
  [/src="\/autocomplete\.js\?v=<%= stylesVersion %>"/g, 'src="<%= asset(\'autocomplete\') %>"'],
  [/src="\/join\.js\?v=<%= stylesVersion %>"/g, 'src="<%= asset(\'join\') %>"'],
  [/src="\/directory-empty-callback\.js\?v=<%= stylesVersion %>"/g, 'src="<%= asset(\'directory-empty-callback\') %>"'],
  [/src="\/company-profile\.js\?v=<%= stylesVersion %>"/g, 'src="<%= asset(\'company-profile\') %>"'],
  [/src="\/admin-dashboard\.js\?v=<%= stylesVersion %>"/g, 'src="<%= asset(\'admin-dashboard\') %>"'],
  [/src="\/admin-crm-kanban\.js\?v=<%= stylesVersion %>"/g, 'src="<%= asset(\'admin-crm-kanban\') %>"'],
  [/src="\/admin-company-workspace\.js\?v=<%= stylesVersion %>"/g, 'src="<%= asset(\'admin-company-workspace\') %>"'],
  [/src="\/admin-settings-hub\.js\?v=<%= stylesVersion %>"/g, 'src="<%= asset(\'admin-settings-hub\') %>"'],
  [/src="\/admin-form-edit-mode\.js\?v=<%= stylesVersion %>"/g, 'src="<%= asset(\'admin-form-edit-mode\') %>"'],
  [/src="\/admin-tenant-settings-list\.js\?v=<%= stylesVersion %>"/g, 'src="<%= asset(\'admin-tenant-settings-list\') %>"'],
];

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p, acc);
    else if (name.name.endsWith(".ejs")) acc.push(p);
  }
  return acc;
}

let changed = 0;
for (const file of walk(viewsDir)) {
  let s = fs.readFileSync(file, "utf8");
  const orig = s;
  for (const [re, rep] of rules) {
    s = s.replace(re, rep);
  }
  if (s.includes('s.src = "/autocomplete.js?v=<%= stylesVersion %>";')) {
    s = s.replace(
      's.src = "/autocomplete.js?v=<%= stylesVersion %>";',
      "s.src = \"<%= asset('autocomplete') %>\";"
    );
  }
  if (s !== orig) {
    fs.writeFileSync(file, s);
    changed++;
    console.log("updated", path.relative(path.join(__dirname, ".."), file));
  }
}
console.log("files changed:", changed);
