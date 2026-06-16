# VibeRoll 🎬

Генератор коротких **вертикальных видео-объявлений** (Reels/TikTok, 1080×1920) для локального бизнеса.

Загрузи фото → опиши бизнес → Claude пишет 3 сценария → выбираешь/редактируешь → сервер собирает готовый ролик через FFmpeg (слайд-шоу с эффектом Ken Burns, тайминговые субтитры, фоновая музыка 30%, водяной знак).

## Стек
- **Frontend:** Next.js 14 (App Router) + React (hooks) + TailwindCSS, мобильная адаптация.
- **Backend:** Next.js API routes (Node runtime).
- **Сценарии:** Anthropic Claude (`@anthropic-ai/sdk`, по умолчанию `claude-haiku-4-5`).
- **Сборка видео:** серверный FFmpeg через `child_process`.
- **Говорящая голова (опц.):** HeyGen API v2 — включается флагом.

> ⚠️ HeyGen платный. Из коробки приложение работает в **mock-режиме**: оно не дёргает HeyGen, а собирает **настоящее** видео-слайдшоу из загруженных фото. Видео реальное, скачивается и воспроизводится. Когда появится ключ HeyGen — переключаешь `VIDEO_PROVIDER=heygen`, и пайплайн использует аватар-видео как основу (субтитры/музыка/водяной знак накладываются так же).

## Требования
- Node.js 18+
- **FFmpeg в системе** (`ffmpeg` и `ffprobe` в PATH). Локально: `brew install ffmpeg` / `apt install ffmpeg`.
- Шрифт для субтитров. По умолчанию используется `/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf`. Если его нет — положи любой TTF с кириллицей и поправь путь `FONT_DIR`/`FONT_FILE` в `src/lib/video.js`.

## Запуск локально
```bash
npm install
cp .env.example .env.local   # впиши ANTHROPIC_API_KEY (необязательно — без него сценарии mock)
npm run dev                  # http://localhost:3000
```

## Переменные окружения (`.env.local`)
| Переменная | Назначение |
|---|---|
| `ANTHROPIC_API_KEY` | Ключ Anthropic. Без него `/api/scripts` отдаёт mock-сценарии. |
| `SCRIPT_MODEL` | Модель для сценариев (по умолчанию `claude-haiku-4-5`). |
| `VIDEO_PROVIDER` | `mock` (слайдшоу) или `heygen`. |
| `HEYGEN_API_KEY` | Нужен только при `VIDEO_PROVIDER=heygen`. |
| `PUBLIC_BASE_URL` | Базовый URL для ссылок на готовые файлы. |
| `REDIS_URL` | Если задан — реестр задач в Redis (переживает рестарт, общий для инстансов). Иначе in-memory. |
| `JOB_TTL_SECONDS` | Сколько хранить запись о задаче (по умолчанию 3600). |

## API
- `POST /api/scripts` — `{ businessName, offer, style }` → `{ scripts: [{title, script} ×3] }`.
- `POST /api/video` — **multipart/form-data**: поля `scriptText, avatarId, voiceId, watermarkText` + файлы `photos` (до 5). → `{ videoId }`. Работа идёт асинхронно.
- `GET /api/video-status?id=...` → `{ status: processing|completed|error, videoUrl? }`.
- `POST /api/compile` — `{ videoUrl, musicUrl?, watermarkText }` — отдельная переналожка музыки/водяного знака на уже существующий локальный файл.

## Экраны
1. **UploadScreen** — drag-and-drop до 5 фото с превью, поля «Что рекламируем?» и «Преимущества», выбор стиля ведущего.
2. **ScriptScreen** — три карточки-сценария, кнопки «Редактировать» и «Сгенерировать видео».
3. **VideoScreen** — polling статуса, плеер, «Скачать» / «Перегенерировать».

## Аватары / голоса
Тестовые ID захардкожены в `src/components/UploadScreen.jsx` (массив `STYLES`). Подставь реальные `avatar_id` / `voice_id` из HeyGen, когда будут.

## Деплой

### Railway
1. Запушь репозиторий, в Railway: **New Project → Deploy from GitHub repo**.
2. FFmpeg на образах Railway (Nixpacks) ставится через `nixpacks.toml` (уже включён) — он добавляет пакет `ffmpeg`.
3. В **Variables** добавь `ANTHROPIC_API_KEY` и при необходимости `VIDEO_PROVIDER`/`HEYGEN_API_KEY`.
4. Build: `npm run build`. Start: `npm run start` (порт берётся из `$PORT`).

### Render
На нативном рантайме Render **нет FFmpeg**, поэтому деплоим как **Docker** (в репозитории есть `Dockerfile`, который ставит ffmpeg и шрифт с кириллицей).

**Вариант A — Blueprint (рекомендуется, один клик).** В репозитории лежит `render.yaml`: он поднимает web-сервис (Docker) + Key Value (Redis) и сам пробрасывает `REDIS_URL`.
1. Dashboard → **New → Blueprint**, выберите репозиторий.
2. Render покажет два сервиса (`viberoll` + `viberoll-kv`). Подтвердите.
3. На шаге переменных впишите `ANTHROPIC_API_KEY` (и при желании R2-переменные) — они помечены `sync: false`, то есть берутся не из yaml, а вводятся вручную.
4. Apply → дождитесь билда. Адрес вида `https://viberoll.onrender.com`.

**Вариант B — вручную.**
1. **New → Web Service**, репозиторий, **Language: Docker**.
2. (Для Redis) **New → Key Value**, скопируйте Internal Connection URL.
3. В Web Service → Environment добавьте `REDIS_URL` (из шага 2), `ANTHROPIC_API_KEY`, при необходимости `VIDEO_PROVIDER`, `HEYGEN_API_KEY`, R2-переменные.

**Как протестировать после деплоя:**
- Откройте URL сервиса, прокликайте флоу: фото → сценарии → «Сгенерировать видео» → дождитесь плеера → «Скачать».
- Проверьте API напрямую:
  ```bash
  # сценарии
  curl -X POST https://<ваш>.onrender.com/api/scripts \
    -H "Content-Type: application/json" \
    -d '{"businessName":"кофейня Тёплый угол","offer":"свежая обжарка","style":"young"}'

  # запуск видео (multipart) → вернёт {"videoId":"..."}
  curl -X POST https://<ваш>.onrender.com/api/video \
    -F "scriptText=Тестовый сценарий про кофе" \
    -F "avatarId=a" -F "voiceId=v" \
    -F "photos=@photo1.jpg" -F "photos=@photo2.jpg"

  # статус (повторять, пока status=completed)
  curl "https://<ваш>.onrender.com/api/video-status?id=<videoId>"
  ```
- Проверьте Redis: Dashboard → ваш Key Value → **Metrics** (активные подключения растут при запросах) или через redis-cli из Shell сервиса: `redis-cli -u $REDIS_URL keys 'viberoll:job:*'`.
- Проверьте субтитры: на готовом видео кириллица должна читаться, а не превращаться в квадраты — если квадраты, значит шрифт в образе не подхватился (сверьте путь `FONT_DIR`).

> ⚠️ На free-плане web-сервис засыпает после простоя — первый запрос будет «холодным» (несколько секунд на пробуждение), а долгая генерация может не успеть. Для нормального теста хватает starter-плана. Free Key Value не персистит данные на диск — для нашего TTL-кэша задач это допустимо.

## Хранение готовых видео в Cloudflare R2 (опционально, но рекомендуется)

По умолчанию ролики лежат в `public/generated` на диске инстанса — на Railway/Render это эфемерно (пропадут при редеплое). Чтобы ссылки жили долго, подключите R2. R2 совместим с S3 API, поэтому используется обычный `@aws-sdk/client-s3`, а egress (скачивание) у R2 **бесплатный** — для раздачи видео это идеально.

**Шаги:**
1. В Cloudflare Dashboard → **R2** создайте бакет (напр. `viberoll-media`).
2. Включите публичный доступ: либо R2.dev-домен (`https://pub-xxxx.r2.dev`), либо привяжите свой кастомный домен (рекомендуется для прода).
3. **R2 → Manage API Tokens** → создайте токен с правом Object Read & Write. Получите Access Key ID и Secret Access Key. Account ID виден в дашборде.
4. Заполните в `.env.local` (или в переменных хостинга):
   ```
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=viberoll-media
   R2_PUBLIC_BASE_URL=https://pub-xxxx.r2.dev   # или свой домен
   ```

Как только заданы **все пять** переменных, готовые ролики автоматически заливаются в R2, локальная копия удаляется, а пользователю отдаётся постоянная публичная ссылка. Если хоть одна переменная пуста — приложение работает в локальном режиме как раньше. Никаких изменений в коде переключение не требует.

> Загружаемые фото (`public/uploads`) остаются локальными — они нужны только на время сборки ролика, после чего не используются. При желании их можно периодически чистить.

## Реестр задач: Redis (для нескольких инстансов)

Генерация видео асинхронна: `POST /api/video` сразу отдаёт `videoId`, а статус опрашивается через `GET /api/video-status`. Где хранится статус, решает наличие `REDIS_URL`:

- **Без `REDIS_URL`** — in-memory `Map` в процессе. Просто для локалки и одного инстанса; при рестарте статусы теряются, при нескольких инстансах воркер и поллер могут оказаться в разных процессах и статус «не найдётся».
- **С `REDIS_URL`** — записи лежат в Redis под ключом `viberoll:job:<id>` с TTL (`JOB_TTL_SECONDS`). Переживает рестарт и работает при горизонтальном масштабировании: любой инстанс видит результат, записанный любым другим.

Никаких изменений в коде для переключения не нужно — только переменная окружения.

**Где взять Redis:**
- **Railway:** в проекте → **New → Database → Add Redis**. Railway выдаст переменную подключения — пробросьте её в сервис как `REDIS_URL`.
- **Render:** **New → Key Value** (их управляемый Redis), скопируйте Internal Connection URL в `REDIS_URL`.
- Подойдёт и любой внешний (Upstash и т.п.) — нужен лишь стандартный `redis://` / `rediss://` URL.

## ⚠️ Ограничения MVP
- **Без `REDIS_URL`** реестр задач живёт в памяти одного процесса (см. выше). Для прода/нескольких инстансов задайте `REDIS_URL`.
- **Без R2** файлы во `public/generated` живут на эфемерном диске и исчезают при редеплое. С R2 (см. выше) ссылки постоянны.
- Длительные задачи на бесплатных тарифах могут упереться в таймаут запроса — генерация вынесена в фоновую задачу, но сам инстанс должен жить достаточно долго. Сейчас задача выполняется в том же процессе (фоновый промис), а не в отдельном worker'е — для большого объёма вынесите сборку в очередь/worker.
