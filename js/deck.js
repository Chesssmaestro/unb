/**
 * Deck viewer — renders a presentation from assets/decks/<slug>-<lang>/.
 *
 * URL contract:  deck.html?d=solar&l=ru#4   (deck, language, 1-based slide)
 *
 * Deck data arrives as a <script> that calls UNB_DECK.register(), rather than
 * a fetch()ed JSON file: a script tag is immune to the file:// and dev-server
 * fetch restrictions the site has run into before, and it doubles as the
 * "does this deck exist" probe.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'unb_lang';
  var LANGS = ['ru', 'en', 'uz', 'ch'];
  var FALLBACK_ORDER = ['ru', 'en', 'uz', 'ch'];

  var el = {
    root: document.getElementById('deck'),
    title: document.getElementById('deckTitle'),
    stage: document.getElementById('deckStage'),
    frame: document.getElementById('deckFrame'),
    slide: document.getElementById('deckSlide'),
    loader: document.getElementById('deckLoader'),
    prev: document.getElementById('deckPrev'),
    next: document.getElementById('deckNext'),
    current: document.getElementById('deckCurrent'),
    total: document.getElementById('deckTotal'),
    thumbs: document.getElementById('deckThumbs'),
    thumbsToggle: document.getElementById('deckThumbsToggle'),
    progressBar: document.getElementById('deckProgressBar'),
    full: document.getElementById('deckFull'),
    langs: document.getElementById('deckLangs'),
    langNote: document.getElementById('deckLangNote'),
    missing: document.getElementById('deckMissing')
  };

  var deck = null;      // currently rendered deck data
  var index = 0;        // 0-based slide index
  var slug = '';
  var lang = 'ru';      // language of the deck being shown
  // The chrome's language is tracked separately: a deck missing in Chinese
  // falls back to the Russian slides, but a visitor who came in on 中文 should
  // still get Chinese buttons rather than being flipped to Russian wholesale.
  var uiLang = 'ru';
  var pending = null;   // slug-lang currently being loaded
  var loaded = {};      // slug-lang -> deck data already registered

  // ---------- language ----------

  function savedLang() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v && LANGS.indexOf(v) !== -1) return v;
    } catch (e) {}
    return null;
  }

  function storeLang(v) {
    try { localStorage.setItem(STORAGE_KEY, v); } catch (e) {}
  }

  function t(key, fallback) {
    var dict = (typeof I18N !== 'undefined' && (I18N[uiLang] || I18N.ru)) || null;
    return (dict && dict[key]) || fallback;
  }

  function applyStrings() {
    document.documentElement.setAttribute('lang', uiLang === 'ch' ? 'zh' : uiLang);
    document.querySelectorAll('[data-i18n]').forEach(function (node) {
      var key = node.getAttribute('data-i18n');
      var val = t(key, null);
      if (val) node.textContent = val;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (node) {
      var val = t(node.getAttribute('data-i18n-title'), null);
      if (val) {
        node.setAttribute('title', val);
        node.setAttribute('aria-label', val);
      }
    });
  }

  /** Languages this deck was actually built in. */
  function availableLangs(forSlug) {
    var entry = (typeof DECKS_INDEX !== 'undefined' && DECKS_INDEX[forSlug]) || null;
    if (!entry) return [];
    return LANGS.filter(function (l) { return !!entry[l]; });
  }

  function resolveLang(forSlug, wanted) {
    var have = availableLangs(forSlug);
    if (!have.length) return null;
    if (have.indexOf(wanted) !== -1) return wanted;
    for (var i = 0; i < FALLBACK_ORDER.length; i++) {
      if (have.indexOf(FALLBACK_ORDER[i]) !== -1) return FALLBACK_ORDER[i];
    }
    return have[0];
  }

  // ---------- slide paths ----------

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function slideSrc(n, width) {
    return 'assets/decks/' + slug + '-' + lang + '/' + pad(n) + '-' + width + '.webp';
  }

  // ---------- rendering ----------

  function render() {
    if (!deck) return;
    var slide = deck.slides[index] || { n: index + 1, alt: '' };
    var n = slide.n;

    el.slide.classList.add('is-loading');
    el.loader.hidden = false;
    el.slide.src = slideSrc(n, 1600);
    el.slide.srcset = slideSrc(n, 800) + ' 800w, ' + slideSrc(n, 1600) + ' 1600w';
    el.slide.sizes = '100vw';
    el.slide.alt = slide.alt || deck.title + ' — ' + n + '/' + deck.pages;
    // Only the first slide should preempt other requests; later ones are
    // stepped to by hand and can queue normally.
    el.slide.setAttribute('fetchpriority', index === 0 ? 'high' : 'auto');

    el.current.textContent = String(n);
    el.total.textContent = String(deck.pages);
    el.prev.disabled = index === 0;
    el.next.disabled = index >= deck.pages - 1;
    el.progressBar.style.width = ((index + 1) / deck.pages) * 100 + '%';

    var thumbs = el.thumbs.children;
    for (var i = 0; i < thumbs.length; i++) {
      var active = i === index;
      thumbs[i].classList.toggle('is-active', active);
      thumbs[i].setAttribute('aria-selected', active ? 'true' : 'false');
      if (active && thumbs[i].scrollIntoView) {
        thumbs[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }

    document.title = deck.title + ' — ' + (index + 1) + '/' + deck.pages + ' · UNB Group';
    try {
      // uiLang, not lang: the URL should preserve what the visitor asked for,
      // so a shared link re-runs the same fallback instead of freezing it.
      history.replaceState(null, '', '?d=' + slug + '&l=' + uiLang + '#' + (index + 1));
    } catch (e) {}

    preload(index + 1);
    preload(index - 1);
  }

  // Warm the neighbouring slides at the width this screen will actually use,
  // so stepping through the deck is instant without pulling 1600px images
  // down a phone connection.
  function preloadWidth() {
    var css = Math.max(window.innerWidth || 0, 320);
    var dpr = window.devicePixelRatio || 1;
    return css * dpr > 900 ? 1600 : 800;
  }

  function preload(i) {
    if (!deck || i < 0 || i >= deck.pages) return;
    var img = new Image();
    img.src = slideSrc(deck.slides[i].n, preloadWidth());
  }

  function buildThumbs() {
    el.thumbs.innerHTML = '';
    deck.slides.forEach(function (slide, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'deck__thumb';
      btn.setAttribute('role', 'tab');
      btn.title = String(slide.n);
      var img = document.createElement('img');
      img.src = slideSrc(slide.n, 240);
      img.alt = String(slide.n);
      img.loading = 'lazy';
      img.decoding = 'async';
      btn.appendChild(img);
      btn.addEventListener('click', function () { go(i); });
      el.thumbs.appendChild(btn);
    });
  }

  function go(i) {
    if (!deck) return;
    var next = Math.max(0, Math.min(deck.pages - 1, i));
    if (next === index) return;
    index = next;
    render();
  }

  // ---------- deck loading ----------

  window.UNB_DECK = {
    register: function (data) {
      loaded[data.slug + '-' + data.lang] = data;
      if (pending === data.slug + '-' + data.lang) show(data);
    }
  };

  function show(data) {
    pending = null;
    deck = data;
    slug = data.slug;
    lang = data.lang;
    el.missing.hidden = true;
    el.title.textContent = data.title;
    el.langNote.hidden = lang === uiLang;
    el.langNote.textContent = lang.toUpperCase();
    el.langNote.title = t('deck.lang_missing', 'Нет на этом языке');
    index = Math.max(0, Math.min(data.pages - 1, index));
    applyStrings();
    syncLangButtons();
    buildThumbs();
    render();
  }

  function showMissing() {
    pending = null;
    deck = null;
    el.missing.hidden = false;
    el.loader.hidden = true;
    applyStrings();
  }

  function load(nextSlug, nextLang) {
    uiLang = nextLang;
    var resolved = resolveLang(nextSlug, nextLang);
    if (!resolved) {
      slug = nextSlug;
      lang = nextLang;
      showMissing();
      return;
    }
    var key = nextSlug + '-' + resolved;
    if (loaded[key]) {
      show(loaded[key]);
      return;
    }
    pending = key;
    el.loader.hidden = false;
    var script = document.createElement('script');
    script.src = 'assets/decks/' + key + '/deck.js?v=7';
    script.onerror = showMissing;
    document.head.appendChild(script);
  }

  function syncLangButtons() {
    var have = availableLangs(slug);
    el.langs.querySelectorAll('.lang-btn').forEach(function (btn) {
      var l = btn.getAttribute('data-lang');
      var ok = have.indexOf(l) !== -1;
      btn.disabled = !ok;
      btn.classList.toggle('is-active', l === lang);
      btn.title = ok ? l.toUpperCase() : t('deck.lang_missing', 'Нет на этом языке');
    });
  }

  el.langs.addEventListener('click', function (e) {
    var btn = e.target.closest('.lang-btn');
    if (!btn || btn.disabled) return;
    var l = btn.getAttribute('data-lang');
    storeLang(l);
    load(slug, l);
  });

  // ---------- controls ----------

  el.prev.addEventListener('click', function () { go(index - 1); });
  el.next.addEventListener('click', function () { go(index + 1); });

  el.slide.addEventListener('load', function () {
    el.slide.classList.remove('is-loading');
    el.loader.hidden = true;
  });
  el.slide.addEventListener('error', function () {
    el.slide.classList.remove('is-loading');
    el.loader.hidden = true;
  });

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': case ' ': case 'Enter':
        e.preventDefault(); go(index + 1); break;
      case 'ArrowLeft': case 'PageUp': case 'Backspace':
        e.preventDefault(); go(index - 1); break;
      case 'Home':
        e.preventDefault(); go(0); break;
      case 'End':
        if (deck) { e.preventDefault(); go(deck.pages - 1); } break;
      case 'f': case 'F': case 'а': case 'А':
        e.preventDefault(); toggleFullscreen(); break;
      case 'Escape':
        if (document.fullscreenElement) document.exitFullscreen();
        break;
    }
  });

  // Swipe. A horizontal move that clearly beats the vertical one counts as a
  // page turn; anything shorter is treated as a tap so the buttons still work.
  var touch = null;
  el.stage.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { touch = null; return; }
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });

  el.stage.addEventListener('touchend', function (e) {
    if (!touch) return;
    var end = e.changedTouches[0];
    var dx = end.clientX - touch.x;
    var dy = end.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    go(dx < 0 ? index + 1 : index - 1);
  }, { passive: true });

  // ---------- fullscreen ----------

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (el.root.requestFullscreen) {
      el.root.requestFullscreen().catch(function () {});
    }
  }

  el.full.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', function () {
    el.root.classList.toggle('is-immersive', !!document.fullscreenElement);
  });

  el.thumbsToggle.addEventListener('click', function () {
    el.thumbs.classList.toggle('is-open');
  });

  // ---------- boot ----------

  var params = new URLSearchParams(location.search);
  var wantSlug = (params.get('d') || params.get('deck') || 'group').replace(/[^a-z0-9-]/gi, '');
  var wantLang = params.get('l') || params.get('lang') || savedLang() || 'ru';
  if (LANGS.indexOf(wantLang) === -1) wantLang = 'ru';

  var fromHash = parseInt(location.hash.replace('#', ''), 10);
  index = isNaN(fromHash) || fromHash < 1 ? 0 : fromHash - 1;

  slug = wantSlug;
  lang = wantLang;
  uiLang = wantLang;
  applyStrings();
  load(wantSlug, wantLang);
})();
