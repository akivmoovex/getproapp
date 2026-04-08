import { defineConfig } from "vite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.join(__dirname, "frontend");
const repoRoot = __dirname;

/** Logical bundle name -> absolute entry path (under frontend/). */
const entryInputs = {
  styles: path.join(frontendRoot, "css", "styles.entry.css"),
  scripts: path.join(frontendRoot, "entries", "scripts.js"),
  "theme-prefs": path.join(frontendRoot, "entries", "theme-prefs.js"),
  "ui-guard": path.join(frontendRoot, "entries", "ui-guard.js"),
  autocomplete: path.join(frontendRoot, "entries", "autocomplete.js"),
  join: path.join(frontendRoot, "entries", "join.js"),
  "directory-empty-callback": path.join(frontendRoot, "entries", "directory-empty-callback.js"),
  "company-profile": path.join(frontendRoot, "entries", "company-profile.js"),
  "company-portal": path.join(frontendRoot, "entries", "company-portal.js"),
  "admin-dashboard": path.join(frontendRoot, "entries", "admin-dashboard.js"),
  "admin-crm-kanban": path.join(frontendRoot, "entries", "admin-crm-kanban.js"),
  "admin-company-workspace": path.join(frontendRoot, "entries", "admin-company-workspace.js"),
  "admin-settings-hub": path.join(frontendRoot, "entries", "admin-settings-hub.js"),
  "admin-form-edit-mode": path.join(frontendRoot, "entries", "admin-form-edit-mode.js"),
  "admin-tenant-settings-list": path.join(frontendRoot, "entries", "admin-tenant-settings-list.js"),
  "field-agent-modal": path.join(frontendRoot, "entries", "field-agent-modal.js"),
  "field-agent-contact": path.join(frontendRoot, "entries", "field-agent-contact.js"),
};

function relToFrontend(abs) {
  return path.relative(frontendRoot, abs).split(path.sep).join("/");
}

export default defineConfig({
  root: frontendRoot,
  publicDir: false,
  server: {
    fs: { allow: [repoRoot] },
  },
  build: {
    outDir: path.join(repoRoot, "public", "build"),
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    minify: "esbuild",
    target: "es2018",
    rollupOptions: {
      treeshake: {
        moduleSideEffects: (id) => id.includes(`${path.sep}public${path.sep}`) && id.endsWith(".js"),
      },
      input: entryInputs,
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/chunk-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  plugins: [
    {
      name: "getpro-asset-map",
      closeBundle() {
        const manifestPath = path.join(repoRoot, "public", "build", ".vite", "manifest.json");
        if (!fs.existsSync(manifestPath)) return;
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        const map = {};
        for (const [logical, absPath] of Object.entries(entryInputs)) {
          const rel = relToFrontend(absPath);
          const meta = manifest[rel];
          if (!meta || !meta.isEntry) continue;
          const file = meta.file || meta.css?.[0];
          if (!file) continue;
          map[logical] = `/build/${file}`;
        }
        const outPath = path.join(repoRoot, "public", "build", "asset-map.json");
        fs.writeFileSync(outPath, `${JSON.stringify(map, null, 2)}\n`);
      },
    },
  ],
});
