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

  // От корня, а не относительный: языковые копии лежат в /en/, /uz/, /zh/,
  // и относительный путь увёл бы на несуществующий /en/deck.html.
  //
  // Часть презентаций свёрстана отдельными страницами (decks/<slug>/) —
  // у них в индексе записан свой адрес, остальные листает deck.html.
  function deckUrl(slug, lang){
    const deck = DECKS[slug] && DECKS[slug][lang];
    return (deck && deck.page) || `/deck.html?d=${slug}&l=${lang}`;
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
      if(!dict[key]) return;
      // Заголовок и подзаголовок героя несут акцентную разметку внутри строки,
      // поэтому хранятся в словаре как HTML. Остальное — обычный текст.
      if(el.hasAttribute('data-i18n-html')) el.innerHTML = dict[key];
      else el.textContent = dict[key];
    });
    // Подписи иконочных кнопок: внутри только иконка, поэтому вместе с title
    // ставим aria-label — иначе скринридер прочитает пустоту.
    document.querySelectorAll('[data-i18n-title]').forEach(el=>{
      const key = el.getAttribute('data-i18n-title');
      if(!dict[key]) return;
      el.setAttribute('title', dict[key]);
      el.setAttribute('aria-label', dict[key]);
    });
    document.querySelectorAll('.lang-btn').forEach(btn=>{
      btn.classList.toggle('is-active', btn.getAttribute('data-lang') === currentLang);
    });
    htmlEl.setAttribute('lang', currentLang === 'ch' ? 'zh' : currentLang);
    // Пишем язык для deck.html: там свой переключатель, и он должен открыться
    // на том же языке, с которого посетитель пришёл.
    try{ localStorage.setItem(STORAGE_KEY, currentLang); }catch(e){}

    syncDeckLinks();
  }

  // У каждого языка теперь свой URL (/, /en/, /uz/, /zh/), а страницы собраны
  // заранее — переключатель это обычные ссылки, перехватывать клик не нужно.
  // Язык определяет адрес: localStorage больше не участвует, иначе посетитель
  // с сохранённым «ru» открыл бы /en/ и увидел русский текст.
  const PATH_LANG = {en:'en', uz:'uz', zh:'ch'};
  const initial = PATH_LANG[location.pathname.split('/').filter(Boolean)[0]] || 'ru';

  // Хедер зафиксирован и выпал из потока, поэтому его высоту надо вернуть
  // странице отступом. Меряем вместо жёсткой константы: высота гуляет от
  // подгрузки шрифтов, переноса телефона/языков и брейкпоинтов.
  const siteHeader = document.querySelector('.site-header');
  if(siteHeader){
    const syncHeaderHeight = ()=>{
      htmlEl.style.setProperty('--header-h', siteHeader.offsetHeight + 'px');
    };
    syncHeaderHeight();
    if('ResizeObserver' in window) new ResizeObserver(syncHeaderHeight).observe(siteHeader);
    else window.addEventListener('resize', syncHeaderHeight);
    window.addEventListener('load', syncHeaderHeight);
  }

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

  // ---------- Заявка ----------
  // Сайт статический, своего сервера нет, поэтому форма стучится в веб-приложение
  // Google Apps Script, а оно кладёт строку в таблицу. Адрес приложения лежит
  // в data-endpoint разметки: там он на виду и сам попадает в языковые копии.
  //
  // Content-Type: text/plain — не прихоть. С ним запрос считается «простым», и
  // браузер не шлёт preflight-запрос OPTIONS, на который Apps Script не отвечает.
  const form = document.getElementById('requestForm');
  if(form){
    const requestModal = document.getElementById('requestModal');
    const requestPanel = requestModal.querySelector('.request-modal__panel');
    const closeBtn = document.getElementById('requestModalClose');
    let requestOpen = false;
    // Окно открывают две кнопки — в шапке и в герое. Запоминаем, какая именно:
    // на закрытии фокус должен вернуться туда, откуда посетитель ушёл.
    let lastTrigger = null;

    function openRequest(){
      requestOpen = true;
      requestModal.classList.add('is-open');
      requestModal.setAttribute('aria-hidden', 'false');
      lockScroll();
      document.getElementById('requestName').focus();
    }

    function closeRequest(){
      requestOpen = false;
      requestModal.classList.remove('is-open');
      requestModal.setAttribute('aria-hidden', 'true');
      unlockScroll();
      if(lastTrigger) lastTrigger.focus();
    }

    document.querySelectorAll('[data-request-open]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        lastTrigger = btn;
        openRequest();
      });
    });
    closeBtn.addEventListener('click', closeRequest);
    requestModal.addEventListener('click', (e)=>{
      if(e.target === requestModal) closeRequest();
    });

    document.addEventListener('keydown', (e)=>{
      if(!requestOpen) return;
      if(e.key === 'Escape'){ closeRequest(); return; }
      if(e.key !== 'Tab') return;
      // Табом из окна не уйти: под затемнением лежит вся страница, и без этого
      // фокус уходит на её ссылки, которых посетитель уже не видит.
      const items = Array.prototype.slice
        .call(requestPanel.querySelectorAll('button, input, select, textarea, a[href]'))
        .filter(el=> !el.disabled && el.tabIndex >= 0);
      if(!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    });

    const statusEl = document.getElementById('requestStatus');
    const submitBtn = document.getElementById('requestSubmit');
    const submitLabel = submitBtn.querySelector('[data-i18n="request.submit"]');
    const direction = document.getElementById('requestDirection');

    const fields = [
      { el: document.getElementById('requestName'),
        err: document.getElementById('requestNameError'),
        ok: (v) => v.trim().length >= 2 },
      // Номер сверяем по числу цифр, а не по маске: у нас пишут и +998 90 123 45 67,
      // и 8-90-123-45-67, и с иностранным кодом — маска отсекла бы половину.
      { el: document.getElementById('requestPhone'),
        err: document.getElementById('requestPhoneError'),
        ok: (v) => (v.match(/\d/g) || []).length >= 9 },
      { el: direction,
        err: document.getElementById('requestDirectionError'),
        ok: (v) => v !== '' }
    ];

    const t = (key)=>{
      const dict = I18N[currentLang] || I18N.ru;
      return dict[key] || I18N.ru[key] || '';
    };

    function showStatus(key, kind){
      statusEl.textContent = t(key);
      statusEl.className = 'request__status request__status--' + kind;
      statusEl.hidden = false;
    }

    function validate(){
      let firstBad = null;
      fields.forEach(f=>{
        const good = f.ok(f.el.value);
        f.el.classList.toggle('is-invalid', !good);
        f.err.hidden = good;
        if(!good && !firstBad) firstBad = f.el;
      });
      if(firstBad) firstBad.focus();
      return !firstBad;
    }

    // Ошибка гаснет по мере исправления, а не ждёт следующей отправки.
    fields.forEach(f=> f.el.addEventListener('input', ()=>{
      if(!f.el.classList.contains('is-invalid')) return;
      if(!f.ok(f.el.value)) return;
      f.el.classList.remove('is-invalid');
      f.err.hidden = true;
    }));

    form.addEventListener('submit', (e)=>{
      e.preventDefault();
      // Ловушка: поле спрятано за край экрана, человек его не заполняет.
      if(form.uz_ref.value) return;
      if(!validate()) return;

      const endpoint = (form.getAttribute('data-endpoint') || '').trim();
      if(!endpoint){
        showStatus('request.err_send', 'fail');
        return;
      }

      const payload = {
        name: document.getElementById('requestName').value.trim(),
        phone: document.getElementById('requestPhone').value.trim(),
        direction: direction.value,
        // Слаг в таблице не читается — кладём рядом и подпись, как её видел клиент.
        directionLabel: direction.options[direction.selectedIndex].textContent.trim(),
        lang: currentLang,
        page: location.href
      };

      const idleLabel = submitLabel.textContent;
      submitBtn.disabled = true;
      submitLabel.textContent = t('request.sending');
      statusEl.hidden = true;

      fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify(payload)
      })
        .then(res=> res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status)))
        .then(data=>{
          if(!data || data.ok !== true) throw new Error('rejected');
          form.reset();
          showStatus('request.ok', 'ok');
        })
        .catch(()=> showStatus('request.err_send', 'fail'))
        .then(()=>{
          submitBtn.disabled = false;
          submitLabel.textContent = idleLabel;
        });
    });
  }

  applyLang(initial);
})();
