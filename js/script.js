(function(){
  const STORAGE_KEY = 'unb_lang';
  const htmlEl = document.documentElement;
  let currentLang = 'ru';

  // Which decks were actually built, keyed slug -> lang. Generated into
  // js/decks-index.js by tools/build-decks.mjs, so adding a PDF and rebuilding
  // is enough — nothing here needs hand-editing. Reading a plain global also
  // avoids a fetch()/HEAD probe, which a dev server (e.g. VS Code Live Preview)
  // can block or mishandle.
  // Declared up here because applyLang() reaches for it, and applyLang runs
  // from a click listener that is wired before the rest of this file executes.
  const DECKS = (typeof DECKS_INDEX !== 'undefined') ? DECKS_INDEX : {};

  function hasDeck(slug, lang){
    return !!(DECKS[slug] && DECKS[slug][lang]);
  }

  /** The language this deck should open in: the current one, else Russian, else anything. */
  function deckLang(slug){
    if(hasDeck(slug, currentLang)) return currentLang;
    if(hasDeck(slug, 'ru')) return 'ru';
    const langs = DECKS[slug] ? Object.keys(DECKS[slug]) : [];
    return langs.length ? langs[0] : null;
  }

  function deckUrl(slug, lang){
    return `deck.html?d=${slug}&l=${lang}`;
  }

  // Cards double as real links so they can be opened in a new tab, bookmarked
  // and crawled; the language switch rewrites the target in place.
  function syncDeckLinks(){
    document.querySelectorAll('.direction-card[data-product]').forEach(card=>{
      const slug = card.getAttribute('data-product');
      const lang = deckLang(slug);
      if(lang) card.setAttribute('data-href', deckUrl(slug, lang));
    });
    document.querySelectorAll('[data-deck]').forEach(link=>{
      const slug = link.getAttribute('data-deck');
      const lang = deckLang(slug);
      if(lang) link.href = deckUrl(slug, lang);
    });
  }

  function applyLang(lang){
    const dict = I18N[lang] || I18N.ru;
    currentLang = I18N[lang] ? lang : 'ru';
    document.querySelectorAll('[data-i18n]').forEach(el=>{
      const key = el.getAttribute('data-i18n');
      if(dict[key]) el.textContent = dict[key];
    });
    document.querySelectorAll('.lang-btn').forEach(btn=>{
      btn.classList.toggle('is-active', btn.getAttribute('data-lang') === currentLang);
    });
    htmlEl.setAttribute('lang', currentLang);
    try{ localStorage.setItem(STORAGE_KEY, currentLang); }catch(e){}

    syncDeckLinks();
  }

  document.querySelectorAll('.lang-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> applyLang(btn.getAttribute('data-lang')));
  });

  let initial = 'ru';
  try{
    const saved = localStorage.getItem(STORAGE_KEY);
    if(saved && I18N[saved]) initial = saved;
  }catch(e){}

  // scroll reveal
  const revealTargets = document.querySelectorAll('.direction-card, .pipeline__step, .effect__stat, .transition__col');
  revealTargets.forEach(el=> el.classList.add('reveal'));
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, {threshold:0.12});
  revealTargets.forEach(el=> io.observe(el));

  // ---------- Presentation modal ----------
  const PRODUCT_LABELS = {
    solar: 'SOLAR INSPECTION DECK',
    power: 'POWER LINE INSPECTION DECK',
    city: 'SMART CITY DECK',
    roads: 'ROAD INSPECTION DECK',
    construction: 'CONSTRUCTION MONITORING DECK',
    farming: 'SMART FARMING DECK',
    delivery: 'DRONE DELIVERY DECK',
    mapping: 'MAPPING & SURVEY DECK',
    hardware: 'HARDWARE SUPPLY DECK'
  };

  const modal = document.getElementById('presModal');
  const modalFallback = document.getElementById('presModalFallback');
  const modalLabel = document.getElementById('presModalLabel');
  const modalClose = document.getElementById('presModalClose');

  let modalOpen = false;

  // The decks are now HTML pages of their own, so they open in the same tab —
  // deck.html carries a "back to site" link. This also sidesteps mobile Chrome
  // refusing to render PDFs inline, which is what forced the old new-tab hack.
  function openDeck(slug){
    const lang = deckLang(slug);
    if(!lang){
      modalLabel.textContent = 'VIEWING · ' + (PRODUCT_LABELS[slug] || (slug.toUpperCase() + ' DECK'));
      modalFallback.hidden = false;
      openModal();
      return;
    }
    window.location.href = deckUrl(slug, lang);
  }

  let savedScrollY = 0;

  // Plain `overflow:hidden` on body doesn't reliably block background
  // scroll on iOS Safari — pinning the body with `position:fixed` and
  // restoring the scroll offset on close is the standard iOS-safe lock.
  function lockScroll(){
    savedScrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
  }

  function unlockScroll(){
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    window.scrollTo(0, savedScrollY);
  }

  function openModal(){
    modalOpen = true;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    lockScroll();
  }

  function closeModal(){
    modalOpen = false;
    modalFallback.hidden = true;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    unlockScroll();
  }

  document.querySelectorAll('.direction-card[data-product]').forEach(card=>{
    const slug = card.getAttribute('data-product');
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.addEventListener('click', (e)=>{
      // Ctrl/Cmd/middle click should still land in a new tab, like a link.
      const href = card.getAttribute('data-href');
      if(href && (e.metaKey || e.ctrlKey)){
        window.open(href, '_blank', 'noopener');
        return;
      }
      openDeck(slug);
    });
    card.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        openDeck(slug);
      }
    });
  });

  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e)=>{
    if(e.target === modal) closeModal();
  });
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape' && modalOpen) closeModal();
  });

  applyLang(initial);
})();
