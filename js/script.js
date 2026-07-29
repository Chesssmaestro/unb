(function(){
  const STORAGE_KEY = 'unb_lang';
  const htmlEl = document.documentElement;
  let currentLang = 'ru';

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

    if(modalOpen && currentProduct){
      loadPresentation(currentProduct);
    }
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

  let currentProduct = null;
  let modalOpen = false;

  // Static list of presentations that actually exist in assets/presentations/products/.
  // Checking membership here is deterministic and needs no network request —
  // unlike a fetch()/HEAD probe, it can't be broken by a dev server (e.g. VS Code
  // Live Preview) that blocks or mishandles fetch. Update this list whenever new
  // PDFs are added to that folder.
  const AVAILABLE_DECKS = new Set([
    'solar-ru','solar-en','solar-uz','solar-ch',
    'power-ru','power-en','power-uz','power-ch',
    'city-ru','city-en','city-uz','city-ch',
    'roads-ru','roads-en','roads-uz','roads-ch',
    'construction-ru','construction-en','construction-uz','construction-ch'
  ]);

  function pdfUrl(slug, lang){
    // #view=FitH tells the browser's built-in PDF viewer to fit the page
    // to the available width, so mobile users land on a full-width page
    // instead of a zoomed-in view they have to pinch out of.
    return `assets/presentations/products/${slug}-${lang}.pdf#view=FitH`;
  }

  function showFallback(){
    modalFallback.hidden = false;
  }

  // Mobile Chrome refuses to render a PDF inline inside an <iframe> — it shows
  // a "tap to open" attachment card instead of the page itself. Navigating to
  // the PDF directly (new tab) makes the browser use its real full-page PDF
  // viewer, so it opens full-screen immediately with no extra tap.
  function loadPresentation(slug){
    const lang = currentLang;

    if(AVAILABLE_DECKS.has(`${slug}-${lang}`)){
      closeModal();
      window.open(pdfUrl(slug, lang), '_blank', 'noopener');
      return;
    }
    if(AVAILABLE_DECKS.has(`${slug}-ru`)){
      closeModal();
      window.open(pdfUrl(slug, 'ru'), '_blank', 'noopener');
      return;
    }

    modalLabel.textContent = 'VIEWING · ' + (PRODUCT_LABELS[slug] || (slug.toUpperCase() + ' DECK'));
    showFallback();
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

  function openModal(slug){
    modalFallback.hidden = true;
    currentProduct = slug;
    modalOpen = true;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    lockScroll();
  }

  function closeModal(){
    modalOpen = false;
    currentProduct = null;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    unlockScroll();
  }

  // Decks that exist just open straight into a new tab (real full-screen PDF
  // viewer, no "tap to open" card). Only missing decks get the on-page modal.
  function handleProductClick(slug){
    const lang = currentLang;
    if(AVAILABLE_DECKS.has(`${slug}-${lang}`)){
      window.open(pdfUrl(slug, lang), '_blank', 'noopener');
      return;
    }
    if(AVAILABLE_DECKS.has(`${slug}-ru`)){
      window.open(pdfUrl(slug, 'ru'), '_blank', 'noopener');
      return;
    }
    openModal(slug);
    loadPresentation(slug);
  }

  document.querySelectorAll('.direction-card[data-product]').forEach(card=>{
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.addEventListener('click', ()=> handleProductClick(card.getAttribute('data-product')));
    card.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' || e.key === ' '){
        e.preventDefault();
        handleProductClick(card.getAttribute('data-product'));
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
