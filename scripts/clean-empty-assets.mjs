// Dev-only, ONE-TIME offline cleaner for the empty-state illustrations whose
// checkerboard background is baked into the pixels (RGB, no alpha). It removes
// ONLY the light background pixels that are connected to the outer edge (so
// interior white/cream artwork is preserved), feathers the edge, trims, and
// standardizes onto a 512x512 transparent canvas. Originals are backed up first.
// NOT imported by the Expo app.  Run:  node scripts/clean-empty-assets.mjs
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const dir = "assets/images/empty";
const backupDir = path.join(dir, "originals");
const CANVAS = 512;
const INNER = Math.round(CANVAS * 0.74); // illustration ~74% of canvas

const avg = (r, g, b) => (r + g + b) / 3;
const sat = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b);
const isLightBg = (r, g, b) => avg(r, g, b) >= 200 && sat(r, g, b) <= 30; // white + light-gray checker
const isLightFringe = (r, g, b) => avg(r, g, b) >= 178 && sat(r, g, b) <= 46; // soft AA edge

async function clean(file) {
  const full = path.join(dir, file);
  const { data, info } = await sharp(full).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels; // 4
  const N = w * h;
  const visited = new Uint8Array(N);
  const stack = [];

  const light = (idx) => {
    const i = idx * ch;
    return isLightBg(data[i], data[i + 1], data[i + 2]);
  };
  const clear = (idx) => {
    data[idx * ch + 3] = 0;
  };

  // Seed every light border pixel, then flood inward (4-connected).
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const idx = y * w + x;
      if (!visited[idx] && light(idx)) {
        visited[idx] = 1;
        clear(idx);
        stack.push(idx);
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) {
      const idx = y * w + x;
      if (!visited[idx] && light(idx)) {
        visited[idx] = 1;
        clear(idx);
        stack.push(idx);
      }
    }
  }
  while (stack.length) {
    const idx = stack.pop();
    const x = idx % w, y = (idx - x) / w;
    const nb = [];
    if (x > 0) nb.push(idx - 1);
    if (x < w - 1) nb.push(idx + 1);
    if (y > 0) nb.push(idx - w);
    if (y < h - 1) nb.push(idx + w);
    for (const n of nb) {
      if (!visited[n] && light(n)) {
        visited[n] = 1;
        clear(n);
        stack.push(n);
      }
    }
  }

  // Feather: two passes eating soft light fringe adjacent to transparency.
  for (let pass = 0; pass < 2; pass++) {
    const toClear = [];
    for (let idx = 0; idx < N; idx++) {
      if (data[idx * ch + 3] === 0) continue;
      const x = idx % w, y = (idx - x) / w;
      const neigh = [
        x > 0 ? idx - 1 : -1,
        x < w - 1 ? idx + 1 : -1,
        y > 0 ? idx - w : -1,
        y < h - 1 ? idx + w : -1,
      ];
      const touchesTransparent = neigh.some((n) => n >= 0 && data[n * ch + 3] === 0);
      if (touchesTransparent) {
        const i = idx * ch;
        if (isLightFringe(data[i], data[i + 1], data[i + 2])) toClear.push(idx);
      }
    }
    for (const idx of toClear) data[idx * ch + 3] = 0;
  }

  // Bounding box of remaining opaque content.
  let minX = w, minY = h, maxX = -1, maxY = -1, opaque = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * ch + 3] > 8) {
        opaque++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (opaque < 1000 || maxX < 0) {
    console.log(`  ✗ ${file}: cleaning removed too much — SKIPPED (kept original)`);
    return { file, ok: false };
  }
  const bw = maxX - minX + 1, bh = maxY - minY + 1;

  // Trimmed illustration → fit inside INNER → center on transparent canvas.
  const trimmed = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: minX, top: minY, width: bw, height: bh })
    .resize({ width: INNER, height: INNER, fit: "inside" })
    .png()
    .toBuffer({ resolveWithObject: true });
  const rw = trimmed.info.width, rh = trimmed.info.height;
  const out = await sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: trimmed.data, left: Math.floor((CANVAS - rw) / 2), top: Math.floor((CANVAS - rh) / 2) },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();

  // Verify the output actually has transparency.
  const check = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let trans = 0;
  for (let i = 3; i < check.data.length; i += check.info.channels) if (check.data[i] < 250) trans++;
  if (trans === 0) {
    console.log(`  ✗ ${file}: output had no transparency — SKIPPED`);
    return { file, ok: false };
  }

  fs.mkdirSync(backupDir, { recursive: true });
  if (!fs.existsSync(path.join(backupDir, file))) fs.copyFileSync(full, path.join(backupDir, file));
  fs.writeFileSync(full, out);
  console.log(
    `  ✓ ${file}: ${w}x${h} → ${CANVAS}x${CANVAS}, transPx=${trans}, ${(out.length / 1024).toFixed(0)}KB`,
  );
  return { file, ok: true };
}

const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png"));
console.log(`Cleaning ${files.length} empty-state PNG(s)…\n`);
const results = [];
for (const f of files) results.push(await clean(f));
const failed = results.filter((r) => !r.ok).map((r) => r.file);
console.log(`\nDone. Cleaned: ${results.filter((r) => r.ok).length}/${files.length}`);
if (failed.length) console.log(`Needs manual regeneration: ${failed.join(", ")}`);
