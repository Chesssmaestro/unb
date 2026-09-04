/**
 * Собирает языковые копии HTML-презентаций: /en/decks/<slug>/ и так далее.
 *
 * Презентации city, power и roads свёрстаны как обычные страницы, а не
 * отрендерены из PDF (см. tools/build-decks.mjs — там остальные). Текст на
 * слайдах размечен data-i18n, переводы лежат рядом в decks/<slug>/i18n.js.
 *
 * Русская страница decks/<slug>/index.html — шаблон и одновременно рабочая
 * страница: её этот скрипт не трогает, только сверяет, что русские строки в
 * разметке и в словаре не разошлись. Копии генерируются, править их руками
 * нельзя — следующий прогон затрёт правки.
 *
 * Usage:  node tools/build-deck-pages.mjs [slug ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://' + fs.readFileSync(path.join(ROOT, 'CNAME'), 'utf8').trim();

// Внутренний код языка -> каталог на сайте; русская версия лежит в корне.
const DIRS = { ru: '', en: 'en', uz: 'uz', ch: 'zh' };
// Google понимает 'zh', а не внутренний код 'ch'.
const HREFLANG = { ru: 'ru', en: 'en', uz: 'uz', ch: 'zh' };
const LANGS = Object.keys(DIRS);

const deckUrl = (slug, lang) =>
  `${ORIGIN}/${DIRS[lang] ? DIRS[lang] + '/' : ''}decks/${slug}/`;
const deckPath = (slug, lang) => `/${DIRS[lang] ? DIRS[lang] + '/' : ''}decks/${slug}/`;
const homePath = (lang) => `/${DIRS[lang] ? DIRS[lang] + '/' : ''}`;

/** Словарь из файла вида `const X = {...};` — тем же способом, что и build-pages. */
function loadDict(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*(\\{[\\s\\S]*\\});\\s*$`));
  if (!m) throw new Error(`Не разобрать ${path.relative(ROOT, file)}`);
  return new Function('return ' + m[1])();
}

/** Презентации-страницы: каталог с index.html и i18n.js рядом. */
function findDecks() {
  const base = path.join(ROOT, 'decks');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base).filter((slug) => {
    const dir = path.join(base, slug);
    return (
      fs.statSync(dir).isDirectory() &&
      fs.existsSync(path.join(dir, 'index.html')) &&
      fs.existsSync(path.join(dir, 'i18n.js'))
    );
  });
}

/**
 * Пути на слайдах относительные (foto/…). Из /en/decks/<slug>/ они
 * разрешились бы туда же, где картинок нет, — переводим в корневые.
 */
function absolutizePaths(doc, slug) {
  for (const attr of ['src', 'href']) {
    for (const el of doc.querySelectorAll(`[${attr}]`)) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      if (/^([a-z]+:|\/\/|\/|#)/i.test(v)) continue;
      el.setAttribute(attr, deckPath(slug, 'ru') + v);
    }
  }
}

function setHeadLinks(doc, slug, lang) {
  for (const el of doc.querySelectorAll('link[rel="canonical"], link[rel="alternate"]')) {
    el.remove();
  }
  const links = [`<link rel="canonical" href="${deckUrl(slug, lang)}">`];
  for (const l of LANGS) {
    links.push(`<link rel="alternate" hreflang="${HREFLANG[l]}" href="${deckUrl(slug, l)}">`);
  }
  links.push(`<link rel="alternate" hreflang="x-default" href="${deckUrl(slug, 'ru')}">`);

  const head = doc.querySelector('head');
  const icon = head.querySelector('link[rel="icon"]');
  const block = '\n' + links.join('\n') + '\n';
  if (icon) icon.insertAdjacentHTML('beforebegin', block);
  else head.insertAdjacentHTML('beforeend', block);
}

const escapeHtml = (s) => s.replace(/&(?![a-z]+;|#\d+;)/g, '&amp;').replace(/</g, '&lt;');
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');

/**
 * Значения словаря — это HTML: на слайдах внутри строки живут <br>, <b> и
 * <span>, и без них вёрстка слайда рассыпается. Поэтому здесь, в отличие от
 * build-pages.mjs, содержимое подставляется как разметка.
 */
function translate(doc, dict, where) {
  let n = 0;
  const missing = [];

  for (const el of doc.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    const value = dict[key];
    if (value === undefined) {
      missing.push(key);
      continue;
    }
    el.set_content(value);
    n++;
  }
  for (const el of doc.querySelectorAll('[data-i18n-alt]')) {
    const key = el.getAttribute('data-i18n-alt');
    const value = dict[key];
    if (value === undefined) {
      missing.push(key);
      continue;
    }
    el.setAttribute('alt', escapeAttr(value));
    n++;
  }
  // Подписи кнопок листалки. aria-label ставится тем же значением: у кнопок
  // внутри только иконка, и без него скринридер прочитает пустоту.
  for (const el of doc.querySelectorAll('[data-i18n-title]')) {
    const key = el.getAttribute('data-i18n-title');
    const value = dict[key];
    if (value === undefined) {
      missing.push(key);
      continue;
    }
    el.setAttribute('title', escapeAttr(value));
    el.setAttribute('aria-label', escapeAttr(value));
    n++;
  }

  if (missing.length) {
    throw new Error(`${where}: нет ключей ${[...new Set(missing)].join(', ')}`);
  }
  return n;
}

/** Активная кнопка языка и ссылка «на сайт» — они разные у каждой копии. */
function setBar(doc, slug, lang) {
  for (const a of doc.querySelectorAll('.dp-langs a')) {
    const l = a.getAttribute('data-lang');
    a.setAttribute('href', deckPath(slug, l));
    a.classList.remove('is-active');
    if (l === lang) a.classList.add('is-active');
    // classList.remove оставляет за собой пустой class="" — убираем.
    if (!a.getAttribute('class')) a.removeAttribute('class');
  }
  const back = doc.querySelector('.dp-back');
  if (back) back.setAttribute('href', homePath(lang));
}

/**
 * Русские строки живут сразу в двух местах — в разметке шаблона и в словаре.
 * Правку одного без другого ловим здесь: иначе русская страница и переводы
 * тихо разъедутся, и заметит это уже посетитель.
 */
function checkRussian(template, dict, slug) {
  const doc = parse(template, { comment: true });
  const drift = [];

  for (const el of doc.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    const inMarkup = el.innerHTML.trim();
    if (dict[key] === undefined) drift.push(`${key}: нет в словаре`);
    else if (dict[key] !== inMarkup) {
      drift.push(`${key}:\n    разметка: ${inMarkup}\n    словарь:  ${dict[key]}`);
    }
  }
  for (const el of doc.querySelectorAll('[data-i18n-alt]')) {
    const key = el.getAttribute('data-i18n-alt');
    const inMarkup = (el.getAttribute('alt') || '').trim();
    if (dict[key] === undefined) drift.push(`${key}: нет в словаре`);
    else if (dict[key] !== inMarkup) {
      drift.push(`${key}:\n    разметка: ${inMarkup}\n    словарь:  ${dict[key]}`);
    }
  }

  for (const el of doc.querySelectorAll('[data-i18n-title]')) {
    const key = el.getAttribute('data-i18n-title');
    const inMarkup = (el.getAttribute('title') || '').trim();
    if (dict[key] === undefined) drift.push(`${key}: нет в словаре`);
    else if (dict[key] !== inMarkup) {
      drift.push(`${key}:\n    разметка: ${inMarkup}\n    словарь:  ${dict[key]}`);
    }
  }

  const title = doc.querySelector('title');
  if (title && dict['meta.title'] !== title.text.trim()) {
    drift.push(`meta.title:\n    разметка: ${title.text.trim()}\n    словарь:  ${dict['meta.title']}`);
  }
  const desc = doc.querySelector('meta[name="description"]');
  if (desc && dict['meta.description'] !== desc.getAttribute('content')) {
    drift.push(
      `meta.description:\n    разметка: ${desc.getAttribute('content')}\n    словарь:  ${dict['meta.description']}`
    );
  }

  if (drift.length) {
    throw new Error(
      `decks/${slug}: русский текст в разметке разошёлся со словарём —\n  ` + drift.join('\n  ')
    );
  }
}

function buildPage(template, slug, lang, dict) {
  const doc = parse(template, { comment: true });

  doc.querySelector('html').setAttribute('lang', HREFLANG[lang]);
  doc.querySelector('title').set_content(escapeHtml(dict['meta.title']));
  const desc = doc.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', escapeAttr(dict['meta.description']));

  const translated = translate(doc, dict, `decks/${slug} (${lang})`);
  setBar(doc, slug, lang);
  absolutizePaths(doc, slug);
  setHeadLinks(doc, slug, lang);

  const banner =
    '<!-- Generated by tools/build-deck-pages.mjs from decks/' +
    slug +
    '/ — do not edit by hand. -->\n';
  const html = doc
    .toString()
    .replace(/<head>[\s\S]*?<\/head>/, (head) => head.replace(/\n{2,}/g, '\n'))
    .replace(/^(<!DOCTYPE html>\n)/i, `$1${banner}`);

  return { html, translated };
}

function main() {
  const only = process.argv.slice(2);
  const site = loadDict(path.join(ROOT, 'js', 'i18n.js'), 'I18N');
  const decks = findDecks().filter((slug) => !only.length || only.includes(slug));

  if (!decks.length) {
    console.log('Презентаций-страниц не найдено');
    return;
  }

  for (const slug of decks) {
    const dir = path.join(ROOT, 'decks', slug);
    const template = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    const deck = loadDict(path.join(dir, 'i18n.js'), 'DECK_I18N');

    for (const lang of LANGS) {
      if (!deck[lang]) throw new Error(`decks/${slug}: нет словаря для «${lang}»`);
      for (const key of ['meta.title', 'meta.description', 'meta.short']) {
        if (!deck[lang][key]) throw new Error(`decks/${slug} (${lang}): нет ключа ${key}`);
      }
    }
    checkRussian(template, Object.assign({}, site.ru, deck.ru), slug);

    for (const lang of LANGS) {
      if (lang === 'ru') continue;
      // Строки шапки («На сайт») общие с остальным сайтом, поэтому берём их
      // из js/i18n.js; ключи презентации при совпадении имени главнее.
      const dict = Object.assign({}, site[lang], deck[lang]);
      const { html, translated } = buildPage(template, slug, lang, dict);
      const out = path.join(ROOT, DIRS[lang], 'decks', slug);
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, 'index.html'), html, 'utf8');
      console.log(`${deckPath(slug, lang)} — ${translated} переведённых узлов`);
    }
  }
}

main();
