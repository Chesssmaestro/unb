/**
 * Приёмник заявок с сайта: кладёт каждую заявку строкой в базу D1.
 *
 * Пришёл на смену tools/lead-form.gs (Google Apps Script + таблица). Сайт
 * по-прежнему статический, на GitHub Pages; этот воркер — единственный кусок
 * бэкенда, и живёт он на отдельном поддомене, адрес которого прописан в
 * data-endpoint формы в index.html.
 *
 * Деплой:
 *   cd worker
 *   npx wrangler d1 execute unb-leads --remote --file=schema.sql   # один раз
 *   npx wrangler deploy
 *
 * Проверка: открыть https://leads.unbgroup.uz/ в браузере — ответит
 * {"ok":true,"rows":N}. Свежие заявки: npm run leads (см. package.json).
 *
 * Просмотр заявок: https://unb-leads.bdunb.workers.dev/admin — страница
 * отдаётся отсюда же, а не с сайта, чтобы её не было на GitHub Pages. Пароль
 * задаётся секретом, в коде и в репозитории его нет:
 *   npx wrangler secret put ADMIN_TOKEN --config worker/wrangler.toml
 */

import ADMIN_PAGE from './admin.html';

/** Откуда принимаем заявки. Всё остальное получит отказ ещё на preflight. */
const ALLOWED_ORIGINS = [
  'https://unbgroup.uz',
  'https://www.unbgroup.uz'
];

/** Столько цифр минимум должно быть в телефоне — та же проверка, что на сайте. */
const MIN_PHONE_DIGITS = 9;

/** Больше стольких заявок с одного IP за окно ниже — это не клиент. */
const RATE_LIMIT = 5;
const RATE_WINDOW = '-10 minutes';

/** Повтор того же номера по тому же направлению в этом окне — двойной клик. */
const DEDUPE_WINDOW = '-1 hour';

/** Статусы воронки — те же, что в комментарии к schema.sql. */
const STATUSES = ['new', 'called', 'won', 'lost'];

/** Столько последних заявок отдаёт страница просмотра за раз. */
const ADMIN_LIMIT = 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Просмотр заявок — отдельная ветка: свой домен (этот же), без CORS, с
    // паролем. Форма сайта сюда не ходит.
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      return adminPage();
    }
    if (url.pathname.startsWith('/admin/')) {
      return adminApi(request, env, url);
    }

    const cors = corsHeaders(request.headers.get('Origin'));

    // Preflight. В отличие от Apps Script, который на OPTIONS не отвечал вовсе
    // (из-за чего форма и слала text/plain), здесь честный CORS.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads').first();
      return json({ ok: true, rows: row ? row.n : 0 }, 200, cors);
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'method' }, 405, cors);
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ ok: false, error: 'empty' }, 400, cors);
    }

    // Ловушка для ботов продублирована здесь: клиентскую проверку обходит
    // любой, кто отправит запрос мимо страницы. Отвечаем «ок», чтобы бот не
    // понял, на чём именно споткнулся, и не начал подбирать.
    if (data.uz_ref) return json({ ok: true }, 200, cors);

    const name = String(data.name || '').trim().slice(0, 80);
    const phone = String(data.phone || '').trim().slice(0, 24);
    const digits = phone.replace(/\D/g, '');
    const direction = String(data.direction || '').trim().slice(0, 40);

    if (name.length < 2 || digits.length < MIN_PHONE_DIGITS || !direction) {
      return json({ ok: false, error: 'invalid' }, 400, cors);
    }

    const ip = request.headers.get('CF-Connecting-IP') || '';

    // Антиспам. Считаем по самой таблице, без KV: заявок единицы в день, лишний
    // COUNT по индексу дешевле отдельного хранилища и лишнего биндинга.
    const recent = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM leads
        WHERE ip = ?1 AND created_at > datetime('now', ?2)`
    ).bind(ip, RATE_WINDOW).first();
    if (recent && recent.n >= RATE_LIMIT) {
      return json({ ok: false, error: 'rate' }, 429, cors);
    }

    // Двойной клик и повторная отправка после «связь отвалилась» не должны
    // плодить строки: менеджер увидит одну заявку вместо трёх одинаковых.
    const dupe = await env.DB.prepare(
      `SELECT id FROM leads
        WHERE phone_digits = ?1 AND direction = ?2
          AND created_at > datetime('now', ?3)
        LIMIT 1`
    ).bind(digits, direction, DEDUPE_WINDOW).first();
    if (dupe) return json({ ok: true, duplicate: true }, 200, cors);

    await env.DB.prepare(
      `INSERT INTO leads
         (name, phone, phone_digits, direction, direction_label,
          lang, page, ip, country, user_agent)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
    ).bind(
      name,
      phone,
      digits,
      direction,
      String(data.directionLabel || '').slice(0, 80),
      String(data.lang || '').slice(0, 8),
      String(data.page || '').slice(0, 300),
      ip,
      (request.cf && request.cf.country) || '',
      (request.headers.get('User-Agent') || '').slice(0, 400)
    ).run();

    return json({ ok: true }, 200, cors);
  }
};

/**
 * Origin отдаём обратно только если он в списке. Отвечать «*» нельзя: тогда
 * заявки принимались бы и с чужой копии страницы, поднятой ради спама.
 */
function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

/** Страница просмотра. В поисковики не пускаем, в чужие фреймы — тоже. */
function adminPage() {
  return new Response(ADMIN_PAGE, {
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    }
  });
}

/**
 * GET  /admin/leads        — последние заявки
 * POST /admin/leads/<id>   — сменить status и/или comment
 * Всё под заголовком Authorization: Bearer <ADMIN_TOKEN>.
 */
async function adminApi(request, env, url) {
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

  // Секрет не задан — закрыто для всех, а не открыто для всех.
  if (!env.ADMIN_TOKEN) return json({ ok: false, error: 'not_configured' }, 503, headers);

  const auth = request.headers.get('Authorization') || '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!(await sameSecret(given, env.ADMIN_TOKEN))) {
    return json({ ok: false, error: 'auth' }, 401, headers);
  }

  if (url.pathname === '/admin/leads' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT id, created_at, name, phone, direction, direction_label,
              lang, page, country, status, comment
         FROM leads ORDER BY id DESC LIMIT ?1`
    ).bind(ADMIN_LIMIT).all();
    return json({ ok: true, leads: results }, 200, headers);
  }

  const m = url.pathname.match(/^\/admin\/leads\/(\d+)$/);
  if (m && request.method === 'POST') {
    let data;
    try {
      data = await request.json();
    } catch {
      return json({ ok: false, error: 'empty' }, 400, headers);
    }
    const status = data.status === undefined ? null : String(data.status);
    if (status !== null && !STATUSES.includes(status)) {
      return json({ ok: false, error: 'status' }, 400, headers);
    }
    const comment = data.comment === undefined ? null : String(data.comment).slice(0, 1000);

    // COALESCE: не переданное поле остаётся как было.
    const res = await env.DB.prepare(
      `UPDATE leads SET status = COALESCE(?1, status), comment = COALESCE(?2, comment)
        WHERE id = ?3`
    ).bind(status, comment, Number(m[1])).run();
    if (!res.meta.changes) return json({ ok: false, error: 'not_found' }, 404, headers);
    return json({ ok: true }, 200, headers);
  }

  return json({ ok: false, error: 'not_found' }, 404, headers);
}

/**
 * Сравнение пароля за постоянное время: обычное === выдаёт по скорости ответа,
 * сколько первых символов угадано. Хешируем оба, чтобы длины совпадали.
 */
async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b))
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json;charset=utf-8' }
  });
}
