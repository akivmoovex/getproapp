/**
 * Writes public/apple-touch-icon.png from public/favicon.svg (180×180).
 * Runs on `npm install` via the `prepare` script so deploys get a valid path.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const svgPath = path.join(root, "public", "favicon.svg");
const outPath = path.join(root, "public", "apple-touch-icon.png");

async function main() {
  if (!fs.existsSync(svgPath)) {
    console.warn("ensure-apple-touch-icon: missing public/favicon.svg, skip");
    return;
  }
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    console.warn("ensure-apple-touch-icon: sharp not available, skip");
    return;
  }
  await sharp(svgPath).resize(180, 180).png().toFile(outPath);
  console.log("ensure-apple-touch-icon: wrote public/apple-touch-icon.png");
}

main().catch((err) => {
  console.warn("ensure-apple-touch-icon:", err.message || err);
  process.exitCode = 0;
});
