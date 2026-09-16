-- Схема базы заявок (Cloudflare D1).
--
-- Держим её здесь, а не только в облаке: иначе структура таблицы существует
-- в единственном экземпляре внутри чужого веб-интерфейса, и восстановить её
-- после случайного `DROP` неоткуда. Применяется командой
--   npx wrangler d1 execute unb-leads --remote --file=worker/schema.sql
-- Все операторы идемпотентны, так что повторный прогон ничего не ломает.

CREATE TABLE IF NOT EXISTS leads (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  name            TEXT    NOT NULL,
  phone           TEXT    NOT NULL,   -- как ввёл человек: +998 90 …, 8-90-…
  phone_digits    TEXT    NOT NULL,   -- только цифры: поиск и проверка дублей
  direction       TEXT    NOT NULL,   -- слаг: solar, power, roads, …
  direction_label TEXT,               -- подпись на языке, с которого отправили
  lang            TEXT,
  page            TEXT,
  ip              TEXT,
  country         TEXT,
  user_agent      TEXT,
  status          TEXT    NOT NULL DEFAULT 'new',  -- new / called / won / lost
  comment         TEXT
);

-- Лента заявок: свежие сверху — то, ради чего в таблицу вообще заходят.
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);

-- По номеру ищут вручную («этот уже звонил?») и проверяет дубли сам Worker.
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_digits);

-- Воронка: «покажи все необработанные».
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status, created_at DESC);

-- Антиспам-счётчик в Worker бьёт по паре (ip, время).
CREATE INDEX IF NOT EXISTS idx_leads_ip ON leads(ip, created_at DESC);
