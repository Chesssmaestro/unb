/**
 * Собирает sitemap.xml и robots.txt из js/decks-index.js.
 *
 * Генератор, а не файл руками: список презентаций меняется при каждом
 * прогоне build-decks.mjs, и рукописная карта сайта разошлась бы с реальностью
 * на первой же новой презентации. Поэтому build-decks вызывает этот скрипт сам.
 *
 * Usage:  node tools/build-sitemap.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://' + fs.readFileSync(path.join(ROOT, 'CNAME'), 'utf8').trim();

// Порядок языков в hreflang-альтернативах; ru — язык по умолчанию на сайте.
const LANGS = ['ru', 'en', 'uz', 'ch'];

// Google понимает 'zh' , не 'ch'; внутренний код языка сайта на это не меняем.
const HREFLANG = { ru: 'ru', en: 'en', uz: 'uz', ch: 'zh' };

function readDecksIndex() {
  const file = path.join(ROOT, 'js', 'decks-index.js');
  const m = fs.readFileSync(file, 'utf8').match(/=\s*(\{[\s\S]*\});/);
  if (!m) throw new Error('Не разобрать js/decks-index.js');
  return JSON.parse(m[1]);
}

/** Дата последнего изменения файла в формате W3C (YYYY-MM-DD). */
function lastmod(relPath) {
  const abs = path.join(ROOT, relPath);
  const when = fs.existsSync(abs) ? fs.statSync(abs).mtime : new Date();
  return when.toISOString().slice(0, 10);
}

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function deckUrl(slug, lang) {
  return `${ORIGIN}/deck.html?d=${slug}&l=${lang}`;
}

/**
 * Один <url>. `alternates` — все языковые версии этой же страницы: без них
 * поисковик считает переводы дублями и оставляет в выдаче только один.
 */
function urlEntry({ loc, mod, changefreq, priority, alternates }) {
  const lines = [`  <url>`, `    <loc>${xmlEscape(loc)}</loc>`];
  for (const [lang, href] of alternates || []) {
    lines.push(
      `    <xhtml:link rel="alternate" hreflang="${lang}" href="${xmlEscape(href)}"/>`
    );
  }
  lines.push(`    <lastmod>${mod}</lastmod>`);
  lines.push(`    <changefreq>${changefreq}</changefreq>`);
  lines.push(`    <priority>${priority}</priority>`);
  lines.push(`  </url>`);
  return lines.join('\n');
}

function main() {
  const decks = readDecksIndex();
  const entries = [];

  // Главная в четырёх языковых версиях: /, /en/, /uz/, /zh/ (собирает
  // tools/build-pages.mjs). Каждая ссылается на остальные через hreflang,
  // иначе поисковик посчитает переводы дублями и оставит один.
  const DIRS = { ru: '', en: 'en', uz: 'uz', ch: 'zh' };
  const homeUrl = (lang) => ORIGIN + '/' + (DIRS[lang] ? DIRS[lang] + '/' : '');
  const homeAlternates = LANGS.map((l) => [HREFLANG[l], homeUrl(l)]);
  homeAlternates.push(['x-default', homeUrl('ru')]);

  for (const lang of LANGS) {
    entries.push(
      urlEntry({
        loc: homeUrl(lang),
        mod: lastmod(lang === 'ru' ? 'index.html' : path.join(DIRS[lang], 'index.html')),
        changefreq: 'weekly',
        priority: lang === 'ru' ? '1.0' : '0.9',
        alternates: homeAlternates,
      })
    );
  }

  for (const slug of Object.keys(decks)) {
    const langs = LANGS.filter((l) => decks[slug][l]);
    // x-default ведёт на русскую версию, если она есть: это язык по умолчанию.
    const alternates = langs.map((l) => [HREFLANG[l], deckUrl(slug, l)]);
    alternates.push(['x-default', deckUrl(slug, langs.includes('ru') ? 'ru' : langs[0])]);

    for (const lang of langs) {
      entries.push(
        urlEntry({
          loc: deckUrl(slug, lang),
          mod: lastmod(path.join('assets', 'decks', `${slug}-${lang}`)),
          changefreq: 'monthly',
          priority: slug === 'group' ? '0.8' : '0.7',
          alternates,
        })
      );
    }
  }

  const sitemap =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n' +
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    entries.join('\n') +
    '\n</urlset>\n';

  const robots =
    'User-agent: *\n' +
    'Allow: /\n' +
    '\n' +
    '# Исходные PDF весят ~930 МБ и продублированы веб-презентациями — в индексе не нужны.\n' +
    'Disallow: /assets/presentations/\n' +
    '\n' +
    `Sitemap: ${ORIGIN}/sitemap.xml\n`;

  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots, 'utf8');
  console.log(`Wrote sitemap.xml (${entries.length} URLs) and robots.txt`);
}

main();
