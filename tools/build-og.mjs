/**
 * Собирает assets/og-cover.png — картинку превью для соцсетей и мессенджеров.
 *
 * Без неё ссылка на сайт разворачивается пустой карточкой: логотип 5270×940
 * в квадратную рамку превью не годится, а фотографии 1200×630 у нас нет.
 * Поэтому картинка собирается из того, что уже лежит в assets/, в палитре
 * сайта — цвета продублированы из css/style.css.
 *
 * Usage:  node tools/build-og.mjs
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');

const W = 1200;
const H = 630;
const PAPER = '#BAE1FF';
const INK = '#00579A';
const ACCENT = '#086EBC';

const TAGLINE = 'Drone AI · Mapping · Infrastructure Intelligence';

/**
 * Подложка: сетка и рамка визора — те же, что в герое на главной, чтобы
 * превью читалось как продолжение сайта, а не как отдельная картинка.
 */
const backdrop = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <pattern id="g" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="${INK}" stroke-opacity="0.07" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <g fill="none" stroke="${INK}" stroke-opacity="0.35" stroke-width="2">
    <path d="M 48 96 L 48 48 L 96 48"/>
    <path d="M ${W - 96} 48 L ${W - 48} 48 L ${W - 48} 96"/>
    <path d="M ${W - 48} ${H - 96} L ${W - 48} ${H - 48} L ${W - 96} ${H - 48}"/>
    <path d="M 96 ${H - 48} L 48 ${H - 48} L 48 ${H - 96}"/>
  </g>
  <rect x="80" y="330" width="64" height="4" fill="${ACCENT}"/>
</svg>`);

/** Текст рисуем в SVG: своих шрифтов у сборки нет, берём системный гротеск. */
const caption = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="620" height="200">
  <style>
    text { font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; }
  </style>
  <text x="0" y="34" fill="${INK}" fill-opacity="0.6" font-size="21" letter-spacing="2.4">${TAGLINE}</text>
  <text x="0" y="92" fill="${INK}" font-size="40" font-weight="600">Infrastructure monitoring</text>
  <text x="0" y="140" fill="${INK}" font-size="40" font-weight="600">platform · Uzbekistan</text>
</svg>`);

const out = path.join(ASSETS, 'og-cover.png');

const logo = await sharp(path.join(ASSETS, 'logo.png')).resize({ width: 420 }).toBuffer();
const drone = await sharp(path.join(ASSETS, 'matrice_400_l3.webp'))
  .resize({ width: 520, height: 520, fit: 'inside' })
  // Фон фотографии белый, подложка — бумажная: умножением белое исчезает.
  .toBuffer();

await sharp(backdrop)
  .composite([
    { input: drone, left: 640, top: 60, blend: 'multiply' },
    { input: logo, left: 80, top: 190 },
    { input: caption, left: 80, top: 356 },
  ])
  .png()
  .toFile(out);

const { size } = fs.statSync(out);
console.log(`assets/og-cover.png — ${W}×${H}, ${Math.round(size / 1024)} КБ`);
