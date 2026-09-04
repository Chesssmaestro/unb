/**
 * Листалка для презентаций-страниц (decks/<slug>/).
 *
 * Слайды в разметке идут подряд — так страница читается и без скрипта, и
 * печатается. Скрипт превращает её в просмотрщик: показывает по одному
 * слайду, как deck.html, теми же клавишами, свайпом и миниатюрами.
 *
 * Управление живёт в самой разметке (id=dp*), спрятанное атрибутом hidden:
 * его строки переводятся при сборке языковых копий, а рисовать его из
 * скрипта значило бы оставить эти подписи без перевода.
 */
(function () {
  var deckEl = document.querySelector('.deck');
  if (!deckEl) return;

  var slides = Array.prototype.slice.call(deckEl.querySelectorAll(':scope > .slide'));
  if (slides.length < 2) return;

  var el = {
    prev: document.getElementById('dpPrev'),
    next: document.getElementById('dpNext'),
    full: document.getElementById('dpFull'),
    foot: document.getElementById('dpFoot'),
    progress: document.getElementById('dpProgress'),
    progressBar: document.getElementById('dpProgressBar'),
    current: document.getElementById('dpCurrent'),
    total: document.getElementById('dpTotal'),
    thumbs: document.getElementById('dpThumbs'),
    thumbsToggle: document.getElementById('dpThumbsToggle')
  };
  for (var k in el) if (!el[k]) return;

  var index = 0;
  var thumbsBuilt = false;

  function clamp(i) {
    return Math.max(0, Math.min(slides.length - 1, i));
  }

  function render() {
    slides.forEach(function (slide, i) {
      slide.classList.toggle('is-current', i === index);
    });

    el.current.textContent = String(index + 1);
    el.prev.disabled = index === 0;
    el.next.disabled = index === slides.length - 1;
    el.progressBar.style.width = ((index + 1) / slides.length) * 100 + '%';

    var thumbs = el.thumbs.children;
    for (var i = 0; i < thumbs.length; i++) {
      var active = i === index;
      thumbs[i].classList.toggle('is-active', active);
      thumbs[i].setAttribute('aria-selected', active ? 'true' : 'false');
      if (active && thumbs[i].scrollIntoView) {
        thumbs[i].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }

    try {
      history.replaceState(null, '', '#' + (index + 1));
    } catch (e) {}
  }

  function go(i) {
    var next = clamp(i);
    if (next === index) return;
    index = next;
    render();
  }

  /**
   * Миниатюра — копия слайда в узкой коробке: он свёрстан в cqw и потому сам
   * рисуется уменьшенным. Строится один раз, при первом открытии полосы:
   * на длинной презентации это заметный кусок разметки.
   */
  function buildThumbs() {
    if (thumbsBuilt) return;
    thumbsBuilt = true;

    slides.forEach(function (slide, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dp-thumb';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-label', String(i + 1));

      var copy = slide.cloneNode(true);
      copy.classList.remove('is-current');
      copy.removeAttribute('id');
      copy.setAttribute('aria-hidden', 'true');
      btn.appendChild(copy);

      btn.addEventListener('click', function () {
        go(i);
      });
      el.thumbs.appendChild(btn);
    });
  }

  // ---------- запуск ----------

  document.body.classList.add('dp-on');
  el.prev.hidden = false;
  el.next.hidden = false;
  el.foot.hidden = false;
  el.progress.hidden = false;
  el.total.textContent = String(slides.length);
  el.thumbsToggle.setAttribute('aria-expanded', 'false');

  if (document.fullscreenEnabled) el.full.hidden = false;

  // Ссылка вида /decks/city/#7 открывает седьмой слайд — так же, как в
  // deck.html: адрес презентации можно скинуть на нужном месте.
  var fromHash = parseInt((location.hash || '').replace('#', ''), 10);
  if (fromHash) index = clamp(fromHash - 1);
  render();

  // ---------- управление ----------

  el.prev.addEventListener('click', function () {
    go(index - 1);
  });
  el.next.addEventListener('click', function () {
    go(index + 1);
  });

  el.thumbsToggle.addEventListener('click', function () {
    buildThumbs();
    var open = el.thumbs.classList.toggle('is-open');
    el.thumbsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) render();
  });

  el.full.addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
      case ' ':
        go(index + 1);
        break;
      case 'ArrowLeft':
      case 'PageUp':
        go(index - 1);
        break;
      case 'Home':
        go(0);
        break;
      case 'End':
        go(slides.length - 1);
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  var touchX = 0;
  var touchY = 0;

  deckEl.addEventListener(
    'touchstart',
    function (e) {
      touchX = e.changedTouches[0].clientX;
      touchY = e.changedTouches[0].clientY;
    },
    { passive: true }
  );

  deckEl.addEventListener('touchend', function (e) {
    var dx = e.changedTouches[0].clientX - touchX;
    var dy = e.changedTouches[0].clientY - touchY;
    // Порог и сравнение с вертикалью: иначе слайд перелистывается от любого
    // касания, в том числе от попытки прокрутить страницу.
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    go(index + (dx < 0 ? 1 : -1));
  });

  window.addEventListener('hashchange', function () {
    var n = parseInt((location.hash || '').replace('#', ''), 10);
    if (n) go(n - 1);
  });
})();
