// Dev-only image audit. Reports transparency + baked-checkerboard detection for
// PNGs in a folder (default: assets/images/empty). NOT imported by the Expo app.
//   node scripts/audit-image-assets.mjs [dir]
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] || "assets/images/empty";

function isLightBg(r, g, b) {
  const avg = (r + g + b) / 3;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  return avg >= 200 && sat <= 30;
}

async function audit(file) {
  const full = path.join(dir, file);
  const img = sharp(full);
  const meta = await img.metadata();
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;

  let transparent = 0;
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * ch + 3];
      if (a < 250) transparent++;
      else {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Checkerboard heuristic: sample an 8x8 grid in the top-left 64px corner and
  // see if it alternates between two light, low-saturation colors.
  const tones = new Set();
  let lightCorner = 0;
  for (let y = 0; y < 64; y += 8) {
    for (let x = 0; x < 64; x += 8) {
      const i = (y * w + x) * ch;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (isLightBg(r, g, b)) {
        lightCorner++;
        tones.add(`${Math.round(r / 12)}-${Math.round(g / 12)}-${Math.round(b / 12)}`);
      }
    }
  }
  const checker = lightCorner >= 50 && tones.size >= 2 && tones.size <= 6;

  const kb = (fs.statSync(full).size / 1024).toFixed(0);
  console.log(
    file.padEnd(26),
    `${meta.width}x${meta.height}`.padEnd(11),
    `alpha=${meta.hasAlpha ? "Y" : "N"}`,
    `transPx=${transparent}`.padEnd(14),
    `bbox=${minX},${minY},${maxX},${maxY}`.padEnd(26),
    `checker=${checker ? "YES" : "no"}`,
    `${kb}KB`,
  );
  return { file, hasAlpha: meta.hasAlpha, transparent, checker };
}

const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png"));
console.log(`Auditing ${files.length} PNG(s) in ${dir}\n`);
const results = [];
for (const f of files) results.push(await audit(f));
const baked = results.filter((r) => !r.hasAlpha || (r.checker && r.transparent === 0));
console.log(
  `\nBaked-background / no-alpha: ${baked.length ? baked.map((r) => r.file).join(", ") : "none"}`,
);
