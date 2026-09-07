/**
 * Приёмник заявок с сайта: кладёт каждую заявку строкой в Google-таблицу.
 *
 * Этот файл в сборке сайта не участвует — он живёт здесь как исходник того,
 * что вставлено в Apps Script, чтобы код не существовал в единственном
 * экземпляре внутри чужого веб-интерфейса.
 *
 * Как подключить:
 *   1. Создать таблицу на Google Диске.
 *   2. В ней: Расширения → Apps Script. Удалить всё из редактора, вставить
 *      этот файл целиком, сохранить.
 *   3. Развернуть → Новое развёртывание → тип «Веб-приложение»,
 *      «Запуск от имени» — от своего имени, «У кого есть доступ» — «Все».
 *      Google попросит разрешить доступ к таблице — разрешить.
 *   4. Скопировать URL вида https://script.google.com/macros/s/…/exec
 *      и вписать его в data-endpoint формы в index.html, затем прогнать
 *      npm run build:pages.
 *
 * Проверка: открыть тот же URL в браузере — должно ответить {"ok":true,…}.
 *
 * Важно: после любой правки этого кода нужно именно «Развернуть → Управление
 * развёртываниями → Изменить → Новая версия». Просто сохранить файл мало —
 * по старому URL продолжит работать прежняя версия.
 */

/** Лист, в который складываются заявки; создаётся сам, если его нет. */
var SHEET_NAME = 'Заявки';

var HEADERS = ['Время', 'Имя', 'Телефон', 'Направление', 'Код направления', 'Язык', 'Страница'];

/** Столько цифр минимум должно быть в телефоне — та же проверка, что на сайте. */
var MIN_PHONE_DIGITS = 9;

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return reply({ ok: false, error: 'empty' });

    var data = JSON.parse(e.postData.contents);

    // Ловушка для ботов продублирована здесь: клиентскую проверку обходит
    // любой, кто отправит запрос мимо страницы.
    if (data.uz_ref) return reply({ ok: true });

    var name = String(data.name || '').trim();
    var phone = String(data.phone || '').trim();
    var digits = phone.replace(/\D/g, '');
    if (name.length < 2 || digits.length < MIN_PHONE_DIGITS) {
      return reply({ ok: false, error: 'invalid' });
    }

    sheet().appendRow([
      new Date(),
      name.slice(0, 80),
      phone.slice(0, 24),
      String(data.directionLabel || '').slice(0, 80),
      String(data.direction || '').slice(0, 40),
      String(data.lang || '').slice(0, 8),
      String(data.page || '').slice(0, 300)
    ]);

    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

/** Открыть URL в браузере — быстрый способ убедиться, что развёртывание живо. */
function doGet() {
  return reply({ ok: true, rows: Math.max(0, sheet().getLastRow() - 1) });
}

function sheet() {
  var book = SpreadsheetApp.getActive();
  var sh = book.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = book.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 150);
    sh.setColumnWidth(7, 260);
  }
  return sh;
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
