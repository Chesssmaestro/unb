/**
 * Verifies that no branding survived into the built decks.
 *
 * The Drone Service green is unlike anything else in these decks, so scanning
 * every rendered slide for clusters of it catches leftovers wherever they came
 * from — including logos baked into a background photo, which the object-level
 * removal in strip-marks.mjs cannot see.
 *
 * There is no equivalent scan for the UNB lockup: it is black ink on a light
 * background, which describes most of the text on most of these slides, and
 * every threshold that catches the mark catches headlines with it. So the UNB
 * side is verified by eye, off the contact sheet this writes.
 *
 * Colour alone is not proof for Drone Service either: one deck carried a
 * washed-out grey version of the mark that this scan reads as clean. The scan
 * is the quick regression guard, the sheet is what you actually look at after
 * changing anything.
 *
 * Usage: node tools/check-marks.mjs
 * Exits non-zero if the scan finds something unreviewed; either way
 * tools/.check/ gets sheet.html (all slides) and copies of anything flagged.
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DECKS = path.join(ROOT, 'assets', 'decks');
const REPORT = path.join(ROOT, 'tools', '.check');

/**
 * Slides looked at by eye and cleared: the green is their own content, not the
 * mark. Listed rather than tuned away because the thresholds that would drop
 * these are the same ones that would start missing small logos. Anything not
 * listed here still fails the run.
 */
const REVIEWED = {
  'group-ru/04': 'green arrow and the smart-city card in the infographic',
  'group-uz/04': 'green arrow and the smart-city card in the infographic',
  'solar-en/11': 'relief map of Russia',
  'solar-en/12': 'green frames and badges on the defect cards',
  'solar-ru/12': 'green frames and badges on the defect cards',
  'solar-ru/04': 'insolation heat map on the tablet',
  'solar-uz/04': 'insolation heat map on the tablet',
};

/** The Drone Service palette: mid-bright, strongly green-dominant. */
function isBrandGreen(r, g, b) {
  return g > 110 && g < 215 && r > 90 && r < 190 && b < 120 && g - b > 55 && g - r > 18;
}

/** Green pixels that sit together, not scattered noise from a photo. */
async function scan(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cell = 16;
  const cols = Math.ceil(info.width / cell);
  const grid = new Int32Array(cols * Math.ceil(info.height / cell));
  let total = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      if (data[i + 3] > 40 && isBrandGreen(data[i], data[i + 1], data[i + 2])) {
        grid[Math.floor(y / cell) * cols + Math.floor(x / cell)]++;
        total++;
      }
    }
  }
  // A logo fills many neighbouring cells densely; foliage and charts do not.
  const hot = [...grid].filter((n) => n > cell * cell * 0.25).length;
  return { total, hot, width: info.width, height: info.height };
}

const files = [];
for (const dir of fs.readdirSync(DECKS)) {
  const full = path.join(DECKS, dir);
  if (!fs.statSync(full).isDirectory()) continue;
  for (const f of fs.readdirSync(full)) if (f.endsWith('-800.webp')) files.push(path.join(full, f));
}
files.sort();

fs.rmSync(REPORT, { recursive: true, force: true });
fs.mkdirSync(REPORT, { recursive: true });
const flagged = [];
const reviewed = [];
for (const f of files) {
  const r = await scan(f);
  if (r.hot < 3) continue;
  const key = path.basename(path.dirname(f)) + '/' + path.basename(f).replace('-800.webp', '');
  const hit = { file: path.relative(ROOT, f), key, ...r };
  if (REVIEWED[key]) {
    reviewed.push(hit);
    continue;
  }
  flagged.push(hit);
  fs.copyFileSync(f, path.join(REPORT, path.basename(path.dirname(f)) + '-' + path.basename(f)));
}

// Contact sheet of everything, for the eyeball pass.
const cells = files.map((f) => {
  const rel = path.relative(REPORT, f).split(path.sep).join('/');
  const label = path.basename(path.dirname(f)) + ' · ' + path.basename(f).replace('-800.webp', '');
  const hit = flagged.some((x) => path.resolve(ROOT, x.file) === f);
  return `<figure${hit ? ' class="hit"' : ''}><img loading="lazy" src="${rel}"><figcaption>${label}</figcaption></figure>`;
});
fs.writeFileSync(path.join(REPORT, 'sheet.html'), `<!DOCTYPE html>
<meta charset="utf-8"><title>deck slides</title>
<style>
body{background:#6b6b6b;margin:0;padding:8px;display:flex;flex-wrap:wrap;gap:8px;font:11px ui-monospace,monospace}
figure{margin:0;width:300px}
img{width:300px;display:block;border:1px solid #000;background:#fff}
figcaption{background:#111;color:#9f9;padding:2px 4px}
.hit img{border:3px solid #e2963a}
.hit figcaption{background:#e2963a;color:#111}
</style>
${cells.join('\n')}
`, 'utf8');

console.log(`scanned ${files.length} slides — contact sheet: tools/.check/sheet.html`);
if (reviewed.length) {
  console.log(`\n${reviewed.length} known slide(s), cleared by eye:`);
  for (const f of reviewed) console.log(`  ${f.key} — ${REVIEWED[f.key]}`);
}
const stale = Object.keys(REVIEWED).filter((k) => !reviewed.some((f) => f.key === k));
if (stale.length) console.log(`\nno longer flagged, drop from REVIEWED: ${stale.join(', ')}`);
if (!flagged.length) {
  console.log('\nclean — no unreviewed Drone Service green found (UNB: check the sheet by eye)');
  process.exit(0);
}
console.log(`\n${flagged.length} slide(s) to review (copies in tools/.check/):`);
for (const f of flagged) console.log(`  ${f.file}  green=${f.total} hotCells=${f.hot}`);
process.exit(1);
