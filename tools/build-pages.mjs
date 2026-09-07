/**
 * Собирает языковые копии главной: /en/, /uz/, /zh/.
 *
 * Зачем: переключатель языков на сайте работает в браузере, поэтому у всех
 * четырёх версий был один адрес «/». Поисковик видит по нему только русский
 * текст — по английским и узбекским запросам сайт просто не появляется.
 * Отдельный URL с готовым текстом решает это без сервера: GitHub Pages сам
 * отдаёт /en/ из /en/index.html.
 *
 * index.html — единственный источник правды. Копии генерируются, править их
 * руками нельзя: следующий прогон затрёт изменения.
 *
 * Usage:  node tools/build-pages.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://' + fs.readFileSync(path.join(ROOT, 'CNAME'), 'utf8').trim();

// Внутренний код языка -> каталог на сайте. Русский остаётся в корне: у «/»
// уже есть входящие ссылки и позиции, а редиректы на GitHub Pages не сделать.
const DIRS = { ru: '', en: 'en', uz: 'uz', ch: 'zh' };
// Google понимает 'zh', а не внутренний код 'ch'.
const HREFLANG = { ru: 'ru', en: 'en', uz: 'uz', ch: 'zh' };

const LANGS = Object.keys(DIRS);

// Локали для Open Graph: у него свой формат, не hreflang.
const OG_LOCALE = { ru: 'ru_RU', en: 'en_US', uz: 'uz_UZ', ch: 'zh_CN' };

/**
 * Официальные профили компании — LinkedIn, Crunchbase, отраслевые каталоги.
 * Это единственное, что связывает сайт с записями о компании снаружи, поэтому
 * поисковик по ним и опознаёт организацию. Пока список пуст, sameAs не
 * выводится: пустой или выдуманный тег хуже отсутствующего.
 */
const SAME_AS = [];

const CONTACT = {
  phone: '+998943888882',
  email: 'info@unbgroup.uz',
  // Города в контактах на сайте нет; страна взята из домена и кода телефона.
  country: 'UZ',
};

/** Темы, по которым компанию должен опознавать поиск, включая AI-поиск. */
const KNOWS_ABOUT = [
  'Drone mapping',
  'LiDAR survey',
  'Photogrammetry',
  'Digital twin',
  'AI-based infrastructure inspection',
  'Solar plant inspection',
  'Power line inspection',
  'Smart city monitoring',
  'Precision agriculture',
  'Drone delivery',
];

function loadDict() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
  const m = src.match(/const I18N\s*=\s*(\{[\s\S]*\});\s*$/);
  if (!m) throw new Error('Не разобрать js/i18n.js');
  return new Function('return ' + m[1])();
}

const urlFor = (lang) => ORIGIN + '/' + (DIRS[lang] ? DIRS[lang] + '/' : '');

/**
 * Пути в index.html относительные (assets/…, css/…, deck.html). Из /en/ они
 * разрешились бы в /en/assets/… — переводим в корневые.
 */
function absolutizePaths(doc) {
  for (const attr of ['src', 'href']) {
    for (const el of doc.querySelectorAll(`[${attr}]`)) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      // Внешние ссылки, якоря, tel:/mailto: и уже корневые пути не трогаем.
      if (/^([a-z]+:|\/\/|\/|#)/i.test(v)) continue;
      el.setAttribute(attr, '/' + v);
    }
  }
}

function setHeadLinks(doc, lang) {
  const head = doc.querySelector('head');
  for (const el of doc.querySelectorAll('link[rel="canonical"], link[rel="alternate"]')) {
    el.remove();
  }
  const links = [`<link rel="canonical" href="${urlFor(lang)}">`];
  for (const l of LANGS) {
    links.push(`<link rel="alternate" hreflang="${HREFLANG[l]}" href="${urlFor(l)}">`);
  }
  links.push(`<link rel="alternate" hreflang="x-default" href="${urlFor('ru')}">`);

  const icon = head.querySelector('link[rel="icon"]');
  const block = '\n' + links.join('\n') + '\n';
  if (icon) icon.insertAdjacentHTML('beforebegin', block);
  else head.insertAdjacentHTML('beforeend', block);
}

/** Подставляет переводы в узлы, размеченные data-i18n. */
function translate(doc, dict) {
  let n = 0;
  for (const el of doc.querySelectorAll('[data-i18n]')) {
    const value = dict[el.getAttribute('data-i18n')];
    if (value === undefined) continue;
    // data-i18n-html несёт разметку внутри строки (акцентные span в герое).
    if (el.hasAttribute('data-i18n-html')) el.set_content(value);
    else el.set_content(escapeHtml(value));
    n++;
  }
  return n;
}

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');

/** Слаги направлений — прямо из карточек, чтобы список не заводить дважды. */
function directionSlugs(doc) {
  return doc
    .querySelectorAll('.direction-card[data-product]')
    .map((el) => el.getAttribute('data-product'));
}

/**
 * Разметка организации для поисковиков и AI-поиска.
 *
 * Один граф на страницу: организация, сайт и сама страница. Направления
 * попадают в него услугами — их названия и описания уже переведены в словаре,
 * поэтому каждая языковая копия описывает компанию на своём языке, а ссылается
 * на один и тот же @id организации.
 */
function jsonLd(lang, dict, slugs) {
  const home = urlFor(lang);
  const orgId = ORIGIN + '/#organization';

  const org = {
    '@type': 'Organization',
    '@id': orgId,
    name: 'UNB Group',
    url: ORIGIN + '/',
    logo: ORIGIN + '/assets/logo.png',
    image: ORIGIN + '/assets/og-cover.png',
    description: dict['meta.description'],
    telephone: CONTACT.phone,
    email: CONTACT.email,
    address: { '@type': 'PostalAddress', addressCountry: CONTACT.country },
    areaServed: { '@type': 'Country', name: 'Uzbekistan' },
    knowsAbout: KNOWS_ABOUT,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      telephone: CONTACT.phone,
      email: CONTACT.email,
      availableLanguage: ['ru', 'uz', 'en', 'zh'],
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: dict['directions.title'],
      itemListElement: slugs.map((slug) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: dict[`dir.${slug}.title`],
          description: dict[`dir.${slug}.text`],
          serviceType: dict[`dir.${slug}.title`],
          url: home + '#dir-' + slug,
          provider: { '@id': orgId },
          areaServed: { '@type': 'Country', name: 'Uzbekistan' },
        },
      })),
    },
  };
  if (SAME_AS.length) org.sameAs = SAME_AS;

  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@graph': [
        org,
        {
          '@type': 'WebSite',
          '@id': ORIGIN + '/#website',
          url: ORIGIN + '/',
          name: 'UNB Group',
          publisher: { '@id': orgId },
          inLanguage: LANGS.map((l) => HREFLANG[l]),
        },
        {
          '@type': 'WebPage',
          '@id': home + '#webpage',
          url: home,
          name: dict['meta.title'],
          description: dict['meta.description'],
          inLanguage: HREFLANG[lang],
          isPartOf: { '@id': ORIGIN + '/#website' },
          about: { '@id': orgId },
        },
      ],
    },
    null,
    2
  );
}

/** Что видит соцсеть или мессенджер в превью ссылки. */
function socialMeta(lang, dict) {
  const tags = [
    ['og:title', dict['meta.title']],
    ['og:description', dict['meta.description']],
    ['og:url', urlFor(lang)],
    ['og:locale', OG_LOCALE[lang]],
    ...LANGS.filter((l) => l !== lang).map((l) => ['og:locale:alternate', OG_LOCALE[l]]),
  ];
  return tags;
}

function setSocialMeta(doc, lang, dict) {
  // og:locale:alternate — по тегу на язык, и их число зависит от копии,
  // поэтому блок переписывается целиком, а не правится по месту.
  for (const el of doc.querySelectorAll('meta[property^="og:locale"], meta[property="og:title"], meta[property="og:description"], meta[property="og:url"]')) {
    el.remove();
  }
  const html = socialMeta(lang, dict)
    .map(([p, c]) => `<meta property="${p}" content="${escapeAttr(c)}">`)
    .join('\n');
  doc.querySelector('meta[property="og:type"]').insertAdjacentHTML('afterend', '\n' + html);
}

function setJsonLd(doc, lang, dict, slugs) {
  doc.querySelector('script[type="application/ld+json"]').set_content(
    '\n' + jsonLd(lang, dict, slugs) + '\n'
  );
}

function buildPage(template, lang, dict) {
  const doc = parse(template, { comment: true });

  doc.querySelector('html').setAttribute('lang', HREFLANG[lang]);
  doc.querySelector('title').set_content(escapeHtml(dict['meta.title']));
  doc
    .querySelector('meta[name="description"]')
    .setAttribute('content', escapeAttr(dict['meta.description']));

  const translated = translate(doc, dict);

  // Активная вкладка переключателя проставляется здесь, а не в браузере:
  // без JS страница всё равно должна показывать свой язык выделенным.
  for (const el of doc.querySelectorAll('.lang-btn')) {
    const active = el.getAttribute('data-lang') === lang;
    el.classList.remove('is-active');
    if (active) el.classList.add('is-active');
  }

  setSocialMeta(doc, lang, dict);
  setJsonLd(doc, lang, dict, directionSlugs(doc));
  absolutizePaths(doc);
  setHeadLinks(doc, lang);

  const banner =
    '<!-- Generated by tools/build-pages.mjs from index.html — do not edit by hand. -->\n';
  // Удаление старых <link> оставляет за собой пустые строки — подчищаем,
  // но только в <head>, чтобы не трогать форматирование разметки.
  const html = doc
    .toString()
    .replace(/<head>[\s\S]*?<\/head>/, (head) => head.replace(/\n{2,}/g, '\n'))
    .replace(/^(<!DOCTYPE html>\n)/i, `$1${banner}`);

  return { html, translated };
}

/**
 * index.html не генерируется — это шаблон, и переписывать его же выводом
 * парсера значит рисковать исходником ради нуля пользы. Но hreflang, теги
 * Open Graph и разметка schema.org в нём написаны руками, а копиям они
 * проставляются генератором. Сверяем, что русская страница не разошлась с
 * остальными: молча она разойдётся так, что заметит это только поисковик.
 */
function checkTemplate(template, dict) {
  const missing = [
    `<link rel="canonical" href="${urlFor('ru')}">`,
    ...LANGS.map((l) => `<link rel="alternate" hreflang="${HREFLANG[l]}" href="${urlFor(l)}">`),
    `<link rel="alternate" hreflang="x-default" href="${urlFor('ru')}">`,
    ...socialMeta('ru', dict).map(
      ([p, c]) => `<meta property="${p}" content="${escapeAttr(c)}">`
    ),
  ].filter((tag) => !template.includes(tag));

  if (missing.length) {
    throw new Error(
      'В index.html не хватает тегов в <head> — добавьте их вручную:\n  ' + missing.join('\n  ')
    );
  }

  const doc = parse(template, { comment: true });
  const script = doc.querySelector('script[type="application/ld+json"]');
  if (!script) {
    throw new Error('В index.html нет разметки schema.org — добавьте вручную:\n' + expectedLd(dict, doc));
  }
  const expected = jsonLd('ru', dict, directionSlugs(doc));
  // Переводы строк нормализуем: index.html может лежать и с CRLF.
  if (script.text.replace(/\r\n/g, '\n').trim() !== expected.trim()) {
    throw new Error(
      'schema.org в index.html разошлась с генератором. Замените содержимое\n' +
        '<script type="application/ld+json"> на:\n\n' + expected + '\n'
    );
  }
}

const expectedLd = (dict, doc) =>
  '<script type="application/ld+json">\n' + jsonLd('ru', dict, directionSlugs(doc)) + '\n</script>';

function main() {
  const I18N = loadDict();
  const template = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  checkTemplate(template, I18N.ru);

  for (const lang of LANGS) {
    const dict = I18N[lang];
    if (!dict) throw new Error(`Нет словаря для «${lang}»`);
    for (const key of ['meta.title', 'meta.description']) {
      if (!dict[key]) throw new Error(`Нет ключа ${key} для «${lang}»`);
    }
    if (lang === 'ru') continue;

    const { html, translated } = buildPage(template, lang, dict);
    const dir = path.join(ROOT, DIRS[lang]);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    console.log(`/${DIRS[lang]}/ — ${translated} переведённых узлов`);
  }
}

main();
