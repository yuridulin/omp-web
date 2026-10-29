# Ревью: миграция на Bun

- **Дата:** 2026-10-29
- **База:** `bed7df5` (`main`) + незакоммиченные изменения рабочего дерева
- **Предмет:** полнота перехода с Node.js/Next.js на Bun при сохранении
  функциональности в виде чистой логики
- **Статус:** ревью, изменений в код не вносилось

## Вердикт

Рантайм-миграция завершена: Next.js как зависимость отсутствует, сервер живёт
на `Bun.serve`, `core/` не импортирует Node, DOM, `fetch` или таймеры.
Функциональность сохранена в виде чистого ядра с портами (`core/ports.ts`);
`lib/` — адаптеры, `server/` — транспорт. Направление зависимостей верное.

Осталось четыре класса хвостов:

1. собственный шим, воспроизводящий API Next (`NextResponse`/`NextRequest`),
   и Next-конвенция в 59 файлах маршрутов;
2. почти полное отсутствие Bun-native API (единственное реальное
   использование — `Bun.serve`);
3. четыре дефекта HTTP-слоя, найденные смоуком;
4. дрейф кода относительно правил `AGENTS.md` (баррель `core/index.ts`,
   re-export-шимы в `lib/`).

## Проверки

| Проверка | Результат |
|---|---|
| `bun test` | 1019 pass / 13 skip / 0 fail, 103 файла, ~52 с |
| `bun run typecheck` | чисто |
| `bun server/index.ts` | 62 маршрута; `GET /api/home` → 200, `GET /api/sessions` → 200, `/api/nope` → 404 |
| `next` в `bun.lock` | 0 вхождений |
| импорт `core/index.ts` под Bun без DOM | 217 экспортов, грузится |
| внешние импорты `core/*.ts` | только относительные; `node:`/`Bun` — 0 |
| `lib` → `server` | 0 импортов |
| `server` → `core` | 0 импортов |

Скипы тестов environment-gated: symlink-доступность, `win32`, наличие `git`,
`nativeEditEnabled` — ожидаемо.

## Находки

| # | Severity | Находка | Где |
|---|---|---|---|
| 1 | P0 | `HEAD` на GET-маршрут → 405: `dispatch` ищет `module["HEAD"]`, fallback на GET отсутствует | `server/index.ts:132` |
| 2 | P0 | `allow` в 405 содержит не-методы: `allow: GET, POST, runtime` | `server/index.ts:137` |
| 3 | P0 | Битый JSON в теле → 500 и внутренний текст ошибки; из 27 `req.json()` только 4–5 мест ловят `SyntaxError` | `server/index.ts:155-159`, `server/routes/cwd/validate/route.ts` |
| 4 | P1 | Next-шим `NextResponse`/`NextRequest` — 477 строк в 59 файлах | `server/http.ts`, `server/routes/**` |
| 5 | P1 | `export const runtime = "nodejs"` — мёртвый Next-конфиг, течёт в `Allow` | `server/routes/sessions/archive/route.ts:7`, `server/routes/sessions/[id]/export/route.ts:14` |
| 6 | P1 | Bun-native API почти не используется: `Bun.serve` ×2 — единственное реальное; `process.env` — 32 места | весь `lib/`, `server/` |
| 7 | P1 | Правило «`core/index.ts` — единственный barrel» не соблюдается: из `lib` 0 импортов барреля, 14 файлов импортируют `core/<module>` напрямую | `lib/*.ts` |
| 8 | P2 | 6 re-export-шимов `lib/*` → `core/*` (≈64 потребителя) — мёртвый вес по правилу clean cutover | `lib/types.ts`, `pi-types.ts`, `type-guards.ts`, `event-stream-protocol.ts`, `notification-events.ts`, `skill-diagnostics.ts` |
| 9 | P2 | `core/guards` и `core/skill-diagnostics` не экспортируются из барреля, хотя используются | `core/index.ts` |
| 10 | P2 | `selectRoute` пересортировывает 62 маршрута и аллоцирует массив на каждый запрос, хотя `collectRoutes` уже отсортировал | `server/index.ts:101-108` |
| 11 | P2 | `dev` = `start`, без `--watch` | `package.json` |
| 12 | P2 | Самообновление всё ещё предлагает `npm install -g` как fallback | `lib/npm-update.ts:42` |
| 13 | P2 | Нет CI; удаления `.nvmrc`, `package-lock.json`, `lib/http-dispatcher.ts`, `lib/npx.ts` и новый `bun.lock` не закоммичены | рабочее дерево |

### 1–3. Дефекты HTTP-слоя

Подтверждено смоуком на живом сервере:

```
HEAD /api/home                    → 405 (ожидается 200 без тела)
PUT  /api/sessions/archive        → 405, allow: GET, POST, runtime
POST /api/cwd/validate  {"       → 500 {"error":"SyntaxError: JSON Parse error: Expected '}'"}
```

`dispatch` перехватывает любое исключение хендлера и отдаёт 500 с
`error.message`, поэтому ошибки разбора входа неотличимы от внутренних сбоев.
Контракт границы («malformed input → `null`/defaults») на уровне сервера не
выполнен.

Исправление:

- `HEAD` искать как `module.HEAD ?? module.GET`;
- `allow` собирать из фиксированного списка методов, оставляя только реально
  экспортированные функции;
- ввести единый `readJson(request)` (в `server/http.ts` рядом с `json()`),
  возвращающий 400 `{ code: "invalid_json" }` на `SyntaxError`; перевести 27
  мест `req.json()`.

### 4. Остаток Next

Зависимости `next` нет — это собственный шим. Но он сохраняет Next-контракт
целиком: имена классов, сигнатуру хендлера
`(request, { params: Promise<...> })`, конвенцию `route.ts`. Формально
«использования Next.js» нет, по факту 59 файлов продолжают писаться в
Next-стиле.

Механическая замена без изменения поведения:

- `NextResponse.json(body, init)` → `json(body, init)` — совместимая
  сигнатура, тело хендлеров не меняется;
- `NextRequest` → нативный `Request`; 18 использований `nextUrl` →
  `new URL(request.url)`;
- `runtime = "nodejs"` удалить (2 места);
- README/AGENTS переписать без Next-терминологии.

Регрессионный барьер уже есть: `server/dispatch.test.mjs`,
`server/cross-origin.test.mjs`.

### 5–6. Node-слой: совместимость Bun, но не Bun-native

`node:`-импорты исполняет сам Bun через совместимость. Это не Node-рантайм, но
и не использование Bun. Текущий инвентарь (non-test, import-сайты):

| Модуль | Сайтов | Bun-замена |
|---|---:|---|
| `fs` | 59 | `Bun.file`, `Bun.write`, `Bun.Glob`; `lstat`/`open` остаются |
| `path` | 48 | замены нет, оставить |
| `os` | 26 | частично `Bun.env`; `tmpdir()`/`homedir()` безопаснее оставить |
| `child_process` | 18 | `Bun.spawn` / `Bun.spawnSync` |
| `crypto` | 11 | `Bun.CryptoHasher`; `randomUUID` → `Bun.randomUUIDv7` только если формат не важен |
| `util` | 10 | исчезает вместе с `promisify(execFile)` |
| `fs/promises` | 6 | `Bun.file` / `Bun.write` |
| `readline` | 3 | построчный разбор `Bun.file(...).stream()` |
| `zlib` | 2 | `Bun.gunzipSync` / `Bun.gzipSync` |
| `stream` | 1 | `Bun.file(path).stream()` вместо `Readable.toWeb(createReadStream())` |
| `string_decoder`, `url` | по 1 | `TextDecoder` / `pathToFileURL` оставить |

Приоритет: `child_process` → `Bun.spawn` (18 мест), затем `zlib`/`stream`/
`readline`. `path` и `os` держать на `node:` — у Bun нет их замены, это не
«стек Node».

### 7–9. Архитектура чистой логики

Главное требование выполнено: ядро не знает о хосте, порты описаны в
`core/ports.ts`, тесты подставляют фейки без DOM и сервера.

Расхождения с `AGENTS.md`:

- «`core/index.ts` — единственный barrel» — из `lib` 0 обращений к баррелю.
  Предлагаемое правило: `lib`/`server` импортируют конкретный модуль core
  (под Bun без бандлера баррель тянет весь core на старте), баррель — для
  внешних потребителей. Тогда `AGENTS.md` надо переписать.
- 6 re-export-шимов `lib/*` → `core/*` находятся в промежуточном состоянии:
  не удалены, но и не объявлены публичным API. По правилу clean cutover их
  нужно либо удалить с переводом потребителей, либо оставить осознанно и
  задокументировать.
- `core/guards` и `core/skill-diagnostics` используются, но отсутствуют в
  барреле — при удалении шимов это станет блокером.

### 10–13. Мелочи

- `selectRoute` сортирует на каждом запросе; достаточно линейного прохода по
  массиву, уже упорядоченному `collectRoutes`.
- `dev` без `--watch` — в README `dev` и `start` идентичны.
- `npm install -g` в `updateCommand` — fallback для Bun-only пакета; убрать
  или оставлять только при `detectInstallMethod() === "npm"`.
- Состояние миграции невоспроизводимо из репозитория: удаления не
  закоммичены, `bun.lock` не добавлен.
- `lib/session-reader.test.mjs` мокает `node:fs` через `mock.module` —
  оправдано сейчас, но при переходе на `Bun.file` мок придётся переписать.

## Предлагаемый порядок работ

1. **P0 (дефекты):** `HEAD`→GET fallback, фильтр `allow`, удаление `runtime`,
   единый `readJson` с 400 на `SyntaxError`. Прогон `server/*.test.mjs`,
   повторный смоук трёх запросов из раздела 1–3.
2. **P1 (снятие Next):** codemod `NextResponse.json` → `json`,
   `NextRequest` → `Request`, удаление шима и Next-терминологии из
   README/AGENTS. Прогон `bun test` + `bun run typecheck`.
3. **P1 (архитектура):** решение по шимам и баррелю, синхронизация
   `AGENTS.md` с фактическим правилом импортов.
4. **P2 (Bun-native):** `Bun.spawn`, `Bun.gunzipSync`,
   `Bun.file().stream()`, `Bun.env`; CI
   `bun install --frozen-lockfile && bun test && bun run typecheck`;
   коммит удалений и `bun.lock`.
