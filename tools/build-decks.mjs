/**
 * Renders every PDF in assets/presentations/ into a web deck:
 * one WebP per slide (three widths) plus a deck.js data file.
 *
 * The PDFs are ~930 MB in total, which is far too heavy to hand to a
 * visitor — especially on mobile. Rendering each page once and shipping
 * WebP instead brings a deck down to a couple of megabytes while looking
 * identical, and it removes the browser's PDF viewer (which mobile Chrome
 * refuses to run inline) from the picture entirely.
 *
 * Usage:  node tools/build-decks.mjs [slug-lang ...]
 *         node tools/build-decks.mjs            # everything
 *         node tools/build-decks.mjs solar-ru   # one deck
 *
 * Requires: npm i mupdf sharp   (dev-only, not shipped to the site)
 */
import * as mupdf from 'mupdf';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripMarks } from './strip-marks.mjs';
import { patchSlide } from './mark-patches.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRES = path.join(ROOT, 'assets', 'presentations');
const OUT = path.join(ROOT, 'assets', 'decks');

// Slide widths we emit. 1600 is the full-screen image, 800 covers phones and
// small laptops via srcset, 240 feeds the thumbnail strip.
const WIDTHS = [
  { w: 1600, quality: 82 },
  { w: 800, quality: 78 },
  { w: 240, quality: 70 },
];
const RENDER_WIDTH = 1600;

const LANGS = ['ru', 'en', 'uz', 'ch'];
const PRODUCTS = ['solar', 'power', 'city', 'roads', 'construction'];

// slug -> where the source PDF lives, per language
function sourcePdf(slug, lang) {
  if (slug === 'group') {
    return path.join(PRES, `UNB_Group_${lang.toUpperCase()}.pdf`);
  }
  return path.join(PRES, 'products', `${slug}-${lang}.pdf`);
}

const TITLES = {
  group: {
    ru: 'UNB Group — платформа мониторинга инфраструктуры',
    en: 'UNB Group — infrastructure monitoring platform',
    uz: 'UNB Group — infratuzilma monitoringi platformasi',
    ch: 'UNB Group — 基础设施监测平台',
  },
  solar: {
    ru: 'Солнечные станции — AI-инспекция',
    en: 'Solar plants — AI inspection',
    uz: 'Quyosh stansiyalari — AI-inspeksiya',
    ch: '太阳能电站 — AI巡检',
  },
  power: {
    ru: 'ЛЭП — интеллектуальная инспекция',
    en: 'Power lines — intelligent inspection',
    uz: 'EUT — intellektual inspeksiya',
    ch: '输电线路 — 智能巡检',
  },
  city: {
    ru: 'Смарт-сити — цифровой двойник города',
    en: 'Smart city — digital twin',
    uz: 'Aqlli shahar — raqamli egizak',
    ch: '智慧城市 — 城市数字孪生',
  },
  roads: {
    ru: 'Дороги — AI-аналитика дорожной сети',
    en: 'Roads — AI road-network analytics',
    uz: "Yo'llar — yo'l tarmog'ining AI-tahlili",
    ch: '道路 — 道路网AI分析',
  },
  construction: {
    ru: 'Стройка — цифровой контроль строительства',
    en: 'Construction — digital site control',
    uz: 'Qurilish — raqamli nazorat',
    ch: '建筑工地 — 数字化施工管控',
  },
};

// The current decks were exported from slides as flat images, so they carry
// no text layer at all and this comes back empty. It stays in because a
// future deck exported properly will produce real alt text for free.
/** Collapses the raw text layer of a page into a short, usable caption. */
function pageText(page) {
  let raw = '';
  try {
    raw = page.toStructuredText('preserve-whitespace').asText();
  } catch {
    return '';
  }
  return raw.replace(/\s+/g, ' ').trim();
}

/** First line of a page — used as the slide's alt text and thumbnail label. */
function pageHeadline(text, fallback) {
  if (!text) return fallback;
  const head = text.slice(0, 120).trim();
  return head.length < text.length ? head + '…' : head;
}

async function buildDeck(slug, lang) {
  const src = sourcePdf(slug, lang);
  if (!fs.existsSync(src)) return null;

  const dir = path.join(OUT, `${slug}-${lang}`);
  fs.mkdirSync(dir, { recursive: true });

  // Branding comes off before anything is rendered, so the slides that reach
  // the site never carry it.
  const stripped = await stripMarks(fs.readFileSync(src));
  const doc = stripped.doc;
  const count = doc.countPages();
  const title = (TITLES[slug] && TITLES[slug][lang]) || `${slug} ${lang}`;
  const slides = [];
  let bytes = 0;
  let painted = 0;

  for (let i = 0; i < count; i++) {
    const page = doc.loadPage(i);
    const b = page.getBounds();
    const scale = RENDER_WIDTH / (b[2] - b[0]);
    const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
    const num = String(i + 1).padStart(2, '0');

    // Marks printed into the slide artwork survive the object-level strip, so
    // they come off here, once, before the three sizes are made from the same
    // rendered page.
    const patched = await patchSlide(Buffer.from(pix.asPNG()), `${slug}-${lang}`, i + 1, RENDER_WIDTH);
    const png = patched.png;
    painted += patched.painted;

    const base = sharp(png);
    for (const { w, quality } of WIDTHS) {
      const file = path.join(dir, `${num}-${w}.webp`);
      const info = await base
        .clone()
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality, effort: 5 })
        .toFile(file);
      bytes += info.size;
    }

    const text = pageText(page);
    slides.push({ n: i + 1, text, alt: pageHeadline(text, `${title} — ${i + 1}/${count}`) });
    pix.destroy?.();
    page.destroy?.();
    process.stdout.write(`  ${slug}-${lang} ${i + 1}/${count}\r`);
  }

  const deck = {
    slug,
    lang,
    title,
    pages: count,
    width: RENDER_WIDTH,
    height: Math.round((RENDER_WIDTH * 9) / 16),
    slides,
  };

  // Shipped as a <script>, not JSON: a plain script tag works over file://
  // and behind dev servers that mishandle fetch(), which the site has been
  // bitten by before (see js/script.js).
  fs.writeFileSync(
    path.join(dir, 'deck.js'),
    `window.UNB_DECK && window.UNB_DECK.register(${JSON.stringify(deck)});\n`,
    'utf8'
  );

  const srcMb = fs.statSync(src).size / 1048576;
  console.log(
    `  ${`${slug}-${lang}`.padEnd(20)} ${String(count).padStart(2)} slides  ` +
      `${srcMb.toFixed(1)}MB PDF -> ${(bytes / 1048576).toFixed(1)}MB web  ` +
      `[marks: ${stripped.images} hidden, ${stripped.plates} plates, ` +
      `${stripped.repainted} repainted, ${painted} painted out]`
  );
  return deck;
}

async function main() {
  const only = process.argv.slice(2);
  fs.mkdirSync(OUT, { recursive: true });

  const index = {};
  const wanted = [];
  for (const slug of ['group', ...PRODUCTS]) {
    for (const lang of LANGS) {
      if (only.length && !only.includes(`${slug}-${lang}`)) continue;
      wanted.push([slug, lang]);
    }
  }

  for (const [slug, lang] of wanted) {
    const deck = await buildDeck(slug, lang);
    if (!deck) continue;
    (index[slug] ||= {})[lang] = { pages: deck.pages, title: deck.title };
  }

  // Merge with anything already built, so a single-deck rebuild does not
  // wipe the availability map for the other decks.
  const indexFile = path.join(ROOT, 'js', 'decks-index.js');
  if (only.length && fs.existsSync(indexFile)) {
    const prev = fs.readFileSync(indexFile, 'utf8').match(/=\s*(\{[\s\S]*\});/);
    if (prev) {
      const old = JSON.parse(prev[1]);
      for (const slug of Object.keys(old)) {
        index[slug] = Object.assign({}, old[slug], index[slug]);
      }
    }
  }

  const ordered = {};
  for (const slug of ['group', ...PRODUCTS]) if (index[slug]) ordered[slug] = index[slug];

  fs.writeFileSync(
    indexFile,
    '/* Generated by tools/build-decks.mjs — do not edit by hand. */\n' +
      `const DECKS_INDEX = ${JSON.stringify(ordered, null, 2)};\n`,
    'utf8'
  );
  console.log(`\nWrote ${path.relative(ROOT, indexFile)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
