/**
 * Собирает мобильную вёрстку презентаций: css/deck-mobile/<slug>.css.
 *
 * Слайды свёрстаны под 16:9 и целиком в cqw — доля ширины слайда. На экране
 * телефона это значит слайд высотой 200px и текст в 5px. Переверстать сотню
 * слайдов руками и потом держать две вёрстки в синхроне — не вариант, поэтому
 * мобильная выводится из десктопной: скрипт читает <style> презентации и для
 * каждого правила, где есть cqw или сетка, пишет ту же селекторную цепочку с
 * мобильными значениями:
 *
 *   - кегль из cqw — в px по пологой шкале (мелкий текст растёт сильнее
 *     крупного: подпись 1.1cqw → 13px, заголовок 4.2cqw → 26px);
 *   - отступы и размеры из cqw — в px как на слайде шириной ~600px;
 *   - сетки в несколько колонок — в одну (мелкие плитки — в две);
 *   - ограничения ширины снимаются: слайд теперь растёт
 *     по содержимому, а не держит рамку 16:9.
 *
 * Общие вещи (сам слайд, .pad, листалка) — в css/deck-mobile.css, руками.
 * Точечные правки отдельных слайдов — в decks/<slug>/mobile-fix.css, если он
 * есть: скрипт дописывает его в конец как есть.
 *
 * Все селекторы привязаны к `.deck > .slide`: миниатюры в полосе снизу — те
 * же слайды, и они должны остаться уменьшенными копиями 16:9.
 *
 * Usage:  node tools/build-deck-mobile.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DECKS = path.join(ROOT, 'decks');
const OUT_DIR = path.join(ROOT, 'css', 'deck-mobile');

const SCOPE = '.deck>.slide';

const fontPx = (x) => Math.min(40, Math.round(8 + x * 4.4));
const spacePx = (x) => Math.round(x * 6 * 10) / 10;

/** Заменяет каждое Ncqw в значении на px через f. */
const mapCqw = (value, f) => value.replace(/(-?\d*\.?\d+)cqw/g, (_, n) => `${f(parseFloat(n))}px`);

/** Сколько дорожек в grid-template-columns. */
function trackCount(value) {
  const rep = value.match(/repeat\(\s*(\d+)/);
  if (rep) return parseInt(rep[1], 10);
  let depth = 0, count = 0, inTok = false;
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && /\s/.test(ch)) { inTok = false; continue; }
    if (!inTok) { count++; inTok = true; }
  }
  return count;
}

const SIZE_PROPS = /^(font-size|width|height|min-width|min-height|flex-basis|padding.*|margin.*|gap|row-gap|column-gap|inset|top|right|bottom|left)$/;

function convertDecl(prop, value) {
  const p = prop.trim().toLowerCase();
  const v = value.trim();
  const hasCqw = /cqw/.test(v);

  if (p === 'grid-template-columns') {
    const n = trackCount(v);
    if (n <= 1) return null;
    // auto 1fr — значок и текст рядом: так и оставить, иначе значок уедет
    // отдельной строкой над текстом.
    if (n === 2 && /(^|\s)(auto|\d*\.?\d+(px|cqw|em|rem))(\s|$)/.test(v)) return [p, mapCqw(v, spacePx)];
    // 1fr auto 1fr auto 1fr — карточки со стрелками между ними: в столбик
    if (/\bauto\b/.test(v)) return [p, 'minmax(0,1fr)'];
    return [p, n >= 4 ? 'repeat(2,minmax(0,1fr))' : 'minmax(0,1fr)'];
  }
  if (p === 'grid-template-rows') return [p, 'none'];
  if (p === 'grid-auto-flow' && /column/.test(v)) return [p, 'row'];
  if (p === 'grid-column' || p === 'grid-row') return [p, 'auto'];
  if (p === 'max-width' || p === 'max-height') return [p, 'none'];

  // Размеры без cqw переносятся как есть. Мобильные правила сильнее исходных
  // на `.deck>.slide`, и без этого `.stat p b{font-size:inherit}` проиграл
  // бы `.stat b{font-size:…}`, который в оригинале перебивал сам.
  if (!hasCqw) return SIZE_PROPS.test(p) && !/!important/.test(v) ? [p, v] : null;

  if (p === 'font-size') return [p, mapCqw(v, fontPx)];
  if (p === 'width' || p === 'min-width' || p === 'flex-basis') {
    const n = parseFloat(v);
    if (/^-?\d*\.?\d+cqw$/.test(v) && n >= 30) return [p, '100%'];
    return [p, mapCqw(v, spacePx)];
  }
  return [p, mapCqw(v, spacePx)];
}

function scopeSelector(sel) {
  return sel
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      if (/^(html|body|:root|\*)\b/.test(s)) return null;
      if (s.startsWith('.slide')) return SCOPE + s.slice('.slide'.length);
      if (s.startsWith('.deck')) return null;
      // `.hero .bg` бывает и про вложенный блок, и про сам слайд
      // (<section class="slide hero">) — второй случай ловит `.deck>.hero`.
      if (/^\.[\w-]+/.test(s)) return `${SCOPE} ${s},.deck>${s}`;
      return `${SCOPE} ${s}`;
    })
    .filter(Boolean)
    .join(',');
}

/** Плоский разбор: правила верхнего уровня, @media print и @keyframes пропускаются. */
function* rules(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) return;
    const head = css.slice(i, open).trim();
    if (head.startsWith('@')) {
      // пропустить блок целиком, с вложенными скобками
      let depth = 1, j = open + 1;
      while (j < css.length && depth) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      i = j;
      continue;
    }
    const close = css.indexOf('}', open);
    yield { selector: head, body: css.slice(open + 1, close) };
    i = close + 1;
  }
}

function convertCss(css) {
  const out = [];
  for (const { selector, body } of rules(css)) {
    const sel = scopeSelector(selector);
    if (!sel) continue;
    const decls = [];
    for (const raw of body.split(';')) {
      const k = raw.indexOf(':');
      if (k < 0) continue;
      const res = convertDecl(raw.slice(0, k), raw.slice(k + 1));
      if (res) decls.push(`${res[0]}:${res[1]}`);
    }
    if (decls.length) out.push(`${sel}{${decls.join(';')}}`);
  }
  return out.join('\n');
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const shared = convertCss(fs.readFileSync(path.join(ROOT, 'css', 'deck-theme.css'), 'utf8'));

for (const slug of fs.readdirSync(DECKS)) {
  const file = path.join(DECKS, slug, 'index.html');
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
  if (!style) continue;

  const fixFile = path.join(DECKS, slug, 'mobile-fix.css');
  const fix = fs.existsSync(fixFile) ? fs.readFileSync(fixFile, 'utf8') : '';

  const css =
    `/* Generated by tools/build-deck-mobile.mjs from decks/${slug}/index.html — do not edit by hand. */\n` +
    '@media (max-width:640px){\n' +
    convertCss(style) + '\n' +
    shared + '\n' +
    '}\n' +
    (fix ? `\n/* decks/${slug}/mobile-fix.css */\n${fix}` : '');

  fs.writeFileSync(path.join(OUT_DIR, `${slug}.css`), css);
  console.log(`css/deck-mobile/${slug}.css — ${css.split('\n').length} строк`);
}
