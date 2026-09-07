/* Светлая и тёмная тема.
 *
 * Атрибут data-theme ставится на <html>, а всё оформление разведено по
 * :root[data-theme="dark"] в css/style.css (сайт), css/deck-page.css (шапка
 * презентаций) и css/deck-dark.css (сами слайды).
 *
 * Скрипт подключается в <head> обычным <script>, без defer: атрибут должен
 * оказаться на месте до первой отрисовки, иначе тёмная страница моргнёт
 * светлой. Поэтому здесь нет обращений к <body> — только к documentElement,
 * а клик ловится делегированием на document.
 *
 * Пока посетитель не нажал кнопку, тема следует за системной настройкой;
 * после нажатия выбор запоминается и системную перестаёт слушать.
 */
(function () {
  var KEY = 'unb-theme';
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function saved() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'dark' || v === 'light' ? v : null;
    } catch (e) {
      return null;
    }
  }

  function apply(theme, remember) {
    root.setAttribute('data-theme', theme);
    if (remember) {
      try {
        localStorage.setItem(KEY, theme);
      } catch (e) {}
    }
    sync();
  }

  function sync() {
    var dark = root.getAttribute('data-theme') === 'dark';
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', dark ? 'true' : 'false');
    }
  }

  apply(saved() || (mq && mq.matches ? 'dark' : 'light'), false);

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    apply(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
  });

  if (mq) {
    var follow = function () {
      if (!saved()) apply(mq.matches ? 'dark' : 'light', false);
    };
    if (mq.addEventListener) mq.addEventListener('change', follow);
    else if (mq.addListener) mq.addListener(follow);
  }

  document.addEventListener('DOMContentLoaded', sync);
})();
