---
name: UNB Group — «Dala»
description: Созвездие на чёрном бархате — чистый чёрный, белая типографика на размере и трекинге, одна фиолетовая кнопка.
colors:
  void: "#000000"
  bone-white: "#ffffff"
  ash-gray: "#9a9a9a"
  silver-mist: "#bdbdbd"
  electric-iris: "#8052ff"
  electric-iris-hover: "#6b3cff"
  saffron-spark: "#ffb829"
  deep-verdant: "#15846e"
  line: "rgba(255,255,255,.14)"
  line-strong: "rgba(255,255,255,.32)"
  star-violet: "#8052ff"
  star-amber: "#ffb829"
  star-teal: "#2ee6c0"
  star-magenta: "#ff4fb8"
  star-blue: "#4d8dff"
typography:
  display:
    fontFamily: "PP Neue Montreal, Inter, sans-serif"
    fontSize: "clamp(2.25rem, 10.5cqi, 7.0625rem)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.04em"
  heading-l:
    fontFamily: "PP Neue Montreal, Inter, sans-serif"
    fontSize: "clamp(2.25rem, 1.1rem + 4.2vw, 4.875rem)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.04em"
  heading:
    fontFamily: "PP Neue Montreal, Inter, sans-serif"
    fontSize: "clamp(2rem, 1.3rem + 2.4vw, 3rem)"
    fontWeight: 400
    letterSpacing: "-0.035em"
  heading-s:
    fontFamily: "PP Neue Montreal, Inter, sans-serif"
    fontSize: "clamp(1.75rem, 1.2rem + 1.9vw, 2.625rem)"
    fontWeight: 400
    letterSpacing: "-0.04em"
  subheading:
    fontFamily: "PP Neue Montreal, Inter, sans-serif"
    fontSize: "clamp(1.5rem, 1.1rem + 1.4vw, 2.25rem)"
    fontWeight: 400
    lineHeight: 1.2
  heading-xs:
    fontFamily: "PP Neue Montreal, Inter, sans-serif"
    fontSize: "clamp(1.375rem, 1.2rem + .6vw, 1.6875rem)"
    fontWeight: 400
    lineHeight: 1
  heading-2xs:
    fontFamily: "PP Neue Montreal, Inter, sans-serif"
    fontSize: "clamp(1.25rem, 1.1rem + .5vw, 1.5rem)"
    fontWeight: 400
    letterSpacing: "-0.02em"
  body:
    fontFamily: "PP Neue Montreal, Inter, sans-serif"
    fontSize: "18px"
    fontWeight: 200
    lineHeight: 1.5
  nav-label:
    fontFamily: "PP Neue Montreal, Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "0.025em"
  caption:
    fontFamily: "PP Neue Montreal, Inter, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  md: "1.5rem"
  pill: "9999px"
spacing:
  s1: "0.375rem"
  s2: "0.75rem"
  s3: "1.125rem"
  s4: "1.5rem"
  s5: "1.875rem"
  s6: "2.25rem"
  s7: "3.75rem"
  s8: "6rem"
  s9: "7.5rem"
components:
  button-primary:
    backgroundColor: "{colors.electric-iris}"
    textColor: "{colors.bone-white}"
    typography: "{typography.nav-label}"
    rounded: "{rounded.md}"
    padding: "14px 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.electric-iris-hover}"
  link-arrow:
    textColor: "{colors.bone-white}"
    typography: "{typography.nav-label}"
  label:
    textColor: "{colors.saffron-spark}"
    typography: "{typography.nav-label}"
  tag:
    textColor: "{colors.silver-mist}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  wordmark:
    textColor: "{colors.deep-verdant}"
    typography: "{typography.heading-2xs}"
---

# DESIGN.md — UNB Group

Источник токенов в коде — `css/tokens.css`. Этот файл описывает, как ими пользоваться.

## Overview

«Созвездие на чёрном бархате» (по мотивам dala.craftedbygc.com). Страница — чистый чёрный фон, на котором всё несёт типографика: крупные заголовки весом 400 с отрицательным трекингом и ультратонкий body весом 200. Единственный цветной визуал — созвездие в hero: тысячи контурных треугольников, собранных в силуэт квадрокоптера (`js/constellation.js`). Очень просторно: один-два смысловых блока на экран.

## Colors

- **Void** `#000000` — фон всего, включая шапку и модальное окно. Никаких `#0a0a0a`.
- **Bone White** — заголовки и основной текст.
- **Ash Gray** `#9a9a9a` — body, неактивная навигация (7.4:1 на чёрном — проходит AA и на 12px).
- **Silver Mist** `#bdbdbd` — подписи, лейблы колонок, номера шагов.
- **Electric Iris** `#8052ff` — только заполненная кнопка (одна на экран), активные индикаторы (точка под языком, прогресс в deck, активная миниатюра), фокус-кольцо. Никогда не фон больших блоков. Hover `#6b3cff` темнее — белый текст держит 5.6:1.
- **Saffron Spark** `#ffb829` — uppercase-лейблы над заголовками, теги направлений, hover акцентных ссылок, `+` в hero.
- **Deep Verdant** `#15846e` — wordmark «UNB Group» и favicon.
- **Line** `rgba(255,255,255,.14)` — волосяные разделители строк списков. Это не рамки карточек.
- **Star-палитра** — только canvas созвездия.

## Typography

PP Neue Montreal из `assets/fonts/` (`PPNeueMontreal-{Thin,Light,Book,Medium,SemiBold}.woff2`), fallback — Inter из Google Fonts (200/400/600). Иерархия строится размером и трекингом, а не жирностью: все заголовки весом 400, body весом 200 (не меньше 16px), лейблы 14px/600 uppercase.

Display и Heading L масштабируются от ширины колонки (`cqi`), а не от вьюпорта. Так самое длинное русское слово («Интеллектуальная», «инфраструктуры») не вылезает из своей колонки ни на одной ширине. На всех заголовках стоит `text-wrap: balance`.

## Layout

- **Масштаб:** корневой `font-size: clamp(100%, .8333vw, 175%)` — до 1920px ровно 16px, шире интерфейс растёт пропорционально экрану (2560px → ~21px). Все токены отступов, радиусов и тач-зон — в `rem`, поэтому масштабируются вместе с ним; canvas читает тот же множитель.
- **Ширина:** контент на всю ширину экрана, поля `clamp(18px, 4.5vw, 120px)`; потолок `--maxw: 160rem` — только для сверхшироких 32:9.
- **Высота:** каждая секция и футер — минимум один экран под шапкой (`--screen: calc(100svh - var(--header-h))`), контент центрирован по вертикали; длинные секции (направления) растут по содержимому.
- `.split` — асимметричные колонки 7/5: слева огромный заголовок (sticky на десктопе), справа контент. `.split--flip` зеркалит их, чтобы секции шли зигзагом: hero (дрон справа) → transition (дрон слева, текст справа) → platform (заголовок справа) → directions (на всю ширину) → effect R → presentations L. Ниже 768px всё в одну колонку.
- Направления — не сетка карточек, а индекс-список строк: тег, заголовок, текст с тегами, стрелка. При наведении остальные строки приглушаются.

## Elevation & Depth

Теней, свечений, стекла и градиентов нет. Глубину дают масштаб, контраст и воздух. Модальное окно — чёрная панель с волосяной линией поверх scrim `rgba(0,0,0,.86)`.

## Shapes

24px — кнопки, панель модалки, слайды в deck. 9999px — теги и точечные индикаторы. Иконки — авторские SVG, обводка 1.5, скругления `round`.

## Components

- **Primary button** — пилюля Electric Iris, 14px uppercase. На экране одна: «Позвонить» в навбаре.
- **Link-arrow** — ghost-CTA: 14px uppercase, белый или Ash, стрелка сдвигается при наведении, hover — Saffron.
- **Навбар** — wordmark слева, ссылки по центру (от 1024px), справа языки с iris-точкой под активным и кнопка звонка. До 600px кнопка становится иконкой с доступным именем.
- **Label** — Saffron uppercase над заголовком секции.
- **Hero и фоновое созвездие** — Display-заголовок и CTA слева. `canvas.sky` закреплён за всей страницей: дрейфующие частицы с параллаксом плюс созвездие-дрон. Дрон собирается в слоте hero (справа), по прокрутке перелетает в слот секции «От ручного контроля…» (слева). Из hero во вторую секцию дрон перелетает целым (прогресс перелёта сглажен, у слота дрон стоит ровно на месте). Дальше, где своего слота нет (платформа, направления, эффект), осколки лежат по фону всего экрана и медленно дрейфуют. Так в обе стороны прокрутки: у своих слотов (дрон в hero и второй секции, лампочка в футере) созвездие собрано, между ними — осколки; дрон ⇄ лампочка превращается по ходу прокрутки. а в футере (`data-constellation="bulb"`) перестраивается в лампочку — решение. Новые остановки задаются пустым блоком с `data-constellation="drone|bulb"`. Кнопка паузы; при `prefers-reduced-motion` время заморожено, кадр обновляется только при прокрутке.
- **Индикаторы** (карусели, deck) — точки около 6–8px, активная Electric Iris.

## Do's and Don'ts

- Do: все значения только из `css/tokens.css`; новый текст — только через ключ в `js/i18n.js`.
- Do: видимый фокус — кольцо 2px Iris с отступом 3px.
- Don't: две заполненные кнопки рядом; фиолетовый фон секций.
- Don't: карточки с фоном или рамкой, «фичи в три колонки», тени, glow, glassmorphism, градиенты в UI.
- Don't: жирные заголовки; body весом 400; вес 200 меньше 16px.
- Don't: стоковые фото, 3D-рендеры, мокапы. Допустимы только реальные фото людей.
