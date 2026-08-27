/**
 * Finds brand marks that were flattened into a slide picture.
 *
 * The marks that sit in the PDF as their own image are handled by hash in
 * strip-marks.mjs. The rest were exported as part of a single flat picture of
 * the whole slide, so there is no object to switch off and the only way to
 * find them is to look at the pixels.
 *
 * One template per mark lives in tools/marks/ — the Drone Service quadcopter
 * and wordmark, and the UNB stacked lockup. Matching is done on gradient
 * magnitude rather than colour: the same mark appears green on white, dark
 * navy on pale grey and white on a photo, and all three have the same edges.
 * Scores are normalised cross-correlation, searched coarse-to-fine over a
 * range of sizes.
 *
 * Output is the table that goes into FLATTENED_PATCHES: image hash, rectangle
 * in that image's own pixels, and — where the mark sits on a flat background —
 * the colour to paint over it, sampled from the ring around the mark.
 *
 * Usage: node tools/find-marks.mjs [deck ...]
 */
import * as mupdf from 'mupdf';
import sharp from 'sharp';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRESENTATIONS = path.join(ROOT, 'assets', 'presentations');
const TEMPLATES = path.join(ROOT, 'tools', 'marks');

const COARSE_W = 400;   // width the first pass works at
const FINE_W = 900;     // width the second pass works at
const MIN_REL = 0.06;   // narrowest mark to look for, as a share of slide width
const MAX_REL = 0.32;
const SCORE_MIN = 0.42; // below this the best match is background noise

/** Grayscale gradient magnitude, as floats, at the given width. */
async function gradient(input, width) {
  const img = sharp(input).flatten({ background: '#ffffff' }).greyscale();
  const { data, info } = await img.resize({ width, fastShrinkOnLoad: false })
    .raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const g = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = data[i + 1] - data[i - 1];
      const gy = data[i + w] - data[i - w];
      g[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return { g, w, h };
}

/** Zero-mean template plus its norm, ready for correlation. */
function normalise(g) {
  const mean = g.reduce((a, b) => a + b, 0) / g.length;
  const out = new Float32Array(g.length);
  let norm = 0;
  for (let i = 0; i < g.length; i++) { out[i] = g[i] - mean; norm += out[i] * out[i]; }
  return { data: out, norm: Math.sqrt(norm) || 1 };
}

/** Running sums so each window's mean and spread cost the same as one lookup. */
function integrals(g, w, h) {
  const s = new Float64Array((w + 1) * (h + 1));
  const s2 = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = g[y * w + x];
      const i = (y + 1) * (w + 1) + (x + 1);
      s[i] = v + s[i - 1] + s[i - (w + 1)] - s[i - (w + 1) - 1];
      s2[i] = v * v + s2[i - 1] + s2[i - (w + 1)] - s2[i - (w + 1) - 1];
    }
  }
  const box = (t, x0, y0, bw, bh) => {
    const a = (y0 + bh) * (w + 1) + x0 + bw, b = y0 * (w + 1) + x0 + bw;
    const c = (y0 + bh) * (w + 1) + x0, d = y0 * (w + 1) + x0;
    return t[a] - t[b] - t[c] + t[d];
  };
  return { sum: (...a) => box(s, ...a), sqsum: (...a) => box(s2, ...a) };
}

/** Best normalised cross-correlation of one template size over the target. */
function match(target, tw, th, tpl, step = 1) {
  const { g, w, h } = target;
  const { sum, sqsum } = target.int;
  const n = tw * th;
  let best = { score: -1 };
  for (let y = 0; y + th <= h; y += step) {
    for (let x = 0; x + tw <= w; x += step) {
      const s = sum(x, y, tw, th);
      const ss = sqsum(x, y, tw, th);
      const varSum = ss - (s * s) / n;
      if (varSum <= 1) continue;
      let dot = 0;
      for (let ty = 0; ty < th; ty++) {
        const row = (y + ty) * w + x, trow = ty * tw;
        for (let tx = 0; tx < tw; tx++) dot += g[row + tx] * tpl.data[trow + tx];
      }
      const score = dot / (Math.sqrt(varSum) * tpl.norm);
      if (score > best.score) best = { score, x, y, tw, th };
    }
  }
  return best;
}

/** Template gradients are rebuilt per size; keep the ones already made. */
const tplCache = new Map();
async function templateAt(file, tw, th) {
  const key = `${file}@${tw}x${th}`;
  if (!tplCache.has(key)) {
    const buf = await sharp(file).flatten({ background: '#ffffff' }).greyscale()
      .resize({ width: tw, height: th, fit: 'fill' }).png().toBuffer();
    const { g } = await gradient(buf, tw);
    tplCache.set(key, normalise(g));
  }
  return tplCache.get(key);
}

/** Locates the mark in one picture, or returns null. */
export async function findMark(input, templates) {
  const meta = await sharp(input).metadata();
  if (meta.width < 500) return null;

  const coarse = await gradient(input, COARSE_W);
  coarse.int = integrals(coarse.g, coarse.w, coarse.h);

  // One candidate per template and size. The mark is not always the strongest
  // edge pattern on a busy slide, so the runner-up sizes are kept too and the
  // second pass decides between them.
  const candidates = [];
  for (const t of templates) {
    for (let rel = MIN_REL; rel <= MAX_REL; rel *= 1.15) {
      const tw = Math.round(rel * coarse.w);
      const th = Math.round(tw / t.aspect);
      if (th < 4 || tw >= coarse.w || th >= coarse.h) continue;
      const tpl = await templateAt(t.file, tw, th);
      const hit = match(coarse, tw, th, tpl);
      if (hit.score > 0) candidates.push({ ...hit, template: t });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length || candidates[0].score < SCORE_MIN * 0.6) return null;

  // Second pass: same neighbourhoods, finer sizes, more pixels to judge by.
  const scale = FINE_W / coarse.w;
  const fine = await gradient(input, FINE_W);
  fine.int = integrals(fine.g, fine.w, fine.h);
  const pad = Math.round(3 * scale);
  let refined = { score: -1 };
  for (const cand of candidates.slice(0, 16)) {
    for (const mul of [0.88, 0.94, 1, 1.06, 1.13]) {
      const tw = Math.round(cand.tw * scale * mul);
      const th = Math.round(tw / cand.template.aspect);
      if (tw < 8 || th < 4 || tw >= fine.w || th >= fine.h) continue;
      const x0 = Math.max(0, Math.round(cand.x * scale) - pad);
      const y0 = Math.max(0, Math.round(cand.y * scale) - pad);
      const tpl = await templateAt(cand.template.file, tw, th);
      const hit = matchWindow(fine, tw, th, tpl, x0, y0, 2 * pad);
      if (hit.score > refined.score) refined = { ...hit, template: cand.template };
    }
  }
  if (refined.score < SCORE_MIN) return null;

  const k = meta.width / FINE_W;
  return {
    score: refined.score,
    rect: [
      Math.round(refined.x * k), Math.round(refined.y * k),
      Math.round((refined.x + refined.tw) * k), Math.round((refined.y + refined.th) * k),
    ],
    width: meta.width,
    height: meta.height,
  };
}

/** Same as match(), restricted to a neighbourhood. */
function matchWindow(target, tw, th, tpl, x0, y0, span) {
  const { g, w, h, int } = target;
  const n = tw * th;
  let best = { score: -1 };
  for (let y = y0; y <= Math.min(h - th, y0 + span); y++) {
    for (let x = x0; x <= Math.min(w - tw, x0 + span); x++) {
      const s = int.sum(x, y, tw, th);
      const varSum = int.sqsum(x, y, tw, th) - (s * s) / n;
      if (varSum <= 1) continue;
      let dot = 0;
      for (let ty = 0; ty < th; ty++) {
        const row = (y + ty) * w + x, trow = ty * tw;
        for (let tx = 0; tx < tw; tx++) dot += g[row + tx] * tpl.data[trow + tx];
      }
      const score = dot / (Math.sqrt(varSum) * tpl.norm);
      if (score > best.score) best = { score, x, y, tw, th };
    }
  }
  return best;
}

/**
 * The colour to paint over the mark, or null if the background is not flat
 * enough for a fill to be invisible.
 */
export async function ringColour(input, rect, width) {
  const band = Math.max(3, Math.round(width * 0.006));
  const [x0, y0, x1, y1] = rect;
  const meta = await sharp(input).metadata();
  const box = {
    left: Math.max(0, x0 - band), top: Math.max(0, y0 - band),
    width: Math.min(meta.width, x1 + band) - Math.max(0, x0 - band),
    height: Math.min(meta.height, y1 + band) - Math.max(0, y0 - band),
  };
  const { data, info } = await sharp(input).flatten({ background: '#ffffff' })
    .extract(box).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const px = [];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const inner = x >= band && x < info.width - band && y >= band && y < info.height - band;
      if (inner) continue;
      const i = (y * info.width + x) * ch;
      px.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  if (!px.length) return null;

  // The ring often clips a headline or a rule running past the mark, so the
  // average of it is not the background. The most common colour is, and how
  // much of the ring shares it says whether a flat fill will show.
  const bucket = new Map();
  for (const p of px) {
    const key = (p[0] >> 4) * 4096 + (p[1] >> 4) * 64 + (p[2] >> 4);
    const b = bucket.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++; b.r += p[0]; b.g += p[1]; b.b += p[2];
    bucket.set(key, b);
  }
  const top = [...bucket.values()].sort((a, b) => b.n - a.n)[0];
  return {
    fill: { r: Math.round(top.r / top.n), g: Math.round(top.g / top.n), b: Math.round(top.b / top.n) },
    coverage: +(top.n / px.length).toFixed(2),
  };
}

// ---------------------------------------------------------------- main

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const templates = fs.readdirSync(TEMPLATES).filter((f) => f.endsWith('.png')).map((f) => ({
    file: path.join(TEMPLATES, f), name: f,
  }));
  for (const t of templates) {
    const m = await sharp(t.file).metadata();
    t.aspect = m.width / m.height;
  }

  const only = process.argv.slice(2);
  const files = [];
  for (const f of fs.readdirSync(PRESENTATIONS)) {
    const full = path.join(PRESENTATIONS, f);
    if (fs.statSync(full).isDirectory()) {
      for (const g of fs.readdirSync(full)) if (g.endsWith('.pdf')) files.push(path.join(full, g));
    } else if (f.endsWith('.pdf')) files.push(full);
  }
  files.sort();

  const seen = new Set();
  for (const file of files) {
    const deck = path.basename(file, '.pdf');
    if (only.length && !only.includes(deck)) continue;
    const doc = mupdf.PDFDocument.openDocument(fs.readFileSync(file), 'application/pdf');
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.loadPage(i);
      const pictures = [];
      page.toStructuredText('preserve-images').walk({
        onImageBlock(bbox, ctm, image) {
          let png;
          try { png = Buffer.from(image.toPixmap().asPNG()); } catch { return; }
          if (image.getWidth() < 500) return;
          pictures.push({ png, hash: crypto.createHash('sha1').update(png).digest('hex').slice(0, 12) });
        },
      });
      for (const p of pictures) {
        if (seen.has(p.hash)) continue;
        seen.add(p.hash);
        const hit = await findMark(p.png, templates);
        if (!hit) continue;
        const ring = await ringColour(p.png, hit.rect, hit.width);
        console.log(JSON.stringify({
          hash: p.hash, deck, page: i + 1, score: +hit.score.toFixed(3),
          size: `${hit.width}x${hit.height}`, rect: hit.rect,
          fill: ring?.fill, coverage: ring?.coverage,
        }));
      }
      page.destroy?.();
    }
    doc.destroy?.();
    process.stderr.write(`${deck} done\n`);
  }
}
