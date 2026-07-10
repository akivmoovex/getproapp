"use strict";

/**
 * Pure helpers for church attachment orphan detection (unit-testable).
 * Never returns absolute paths.
 */

const path = require("path");
const fs = require("fs");

const IGNORE_NAMES = new Set([".gitkeep", ".DS_Store"]);

function isIgnoredName(name) {
  const n = String(name || "");
  if (IGNORE_NAMES.has(n)) return true;
  if (n.startsWith(".")) return true;
  if (n.endsWith(".tmp") || n.endsWith(".partial") || n.endsWith(".upload")) return true;
  return false;
}

function resolveUnderRoot(rootDir, relPath) {
  const rel = String(relPath || "").replace(/^[/\\]+/, "");
  if (!rel || rel.includes("..")) return null;
  const abs = path.resolve(rootDir, rel);
  const root = path.resolve(rootDir);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

function walkRelativeFiles(rootDir) {
  const root = path.resolve(rootDir);
  const out = [];
  if (!fs.existsSync(root)) return out;

  function walk(absDir, relBase) {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (isIgnoredName(ent.name)) continue;
      const abs = path.join(absDir, ent.name);
      const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
      if (rel.includes("..")) continue;
      const resolved = resolveUnderRoot(root, rel);
      if (!resolved) continue;
      if (ent.isSymbolicLink && ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) {
        walk(abs, rel.replace(/\\/g, "/"));
      } else if (ent.isFile()) {
        out.push(rel.replace(/\\/g, "/"));
      }
    }
  }

  walk(root, "");
  return out;
}

/**
 * @param {string} rootDir
 * @param {Set<string>|string[]} referencedRelativePaths
 * @returns {{ filesOnDisk: string[], orphans: string[] }}
 */
function findOrphanRelativeFiles(rootDir, referencedRelativePaths) {
  const referenced = new Set(
    [...(referencedRelativePaths || [])].map((p) => String(p).replace(/\\/g, "/"))
  );
  const filesOnDisk = walkRelativeFiles(rootDir);
  const orphans = filesOnDisk.filter((f) => !referenced.has(f));
  return { filesOnDisk, orphans };
}

module.exports = {
  isIgnoredName,
  resolveUnderRoot,
  walkRelativeFiles,
  findOrphanRelativeFiles,
};
