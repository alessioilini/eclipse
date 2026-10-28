# Затмение

Карточная игра для браузера и Telegram: команда из шести героинь, двенадцать карт, бой три на три против бота. TypeScript, React 18, Vite; тесты на Vitest и Playwright.

## Запуск

```sh
npm install
npm run dev
```

Vite печатает локальный адрес; игра рассчитана на экран телефона.

## Тесты

```sh
npm test       # модульные тесты (Vitest)
npm run e2e    # сквозные тесты (Playwright): сборка, vite preview на порту 4173, экран 390×844
```

Для `npm run e2e` нужен Chromium Playwright: `npx playwright install chromium`.

## Деплой

Пуш в `main` запускает GitHub Actions (`.github/workflows/deploy.yml`): `npm ci`, тесты, сборка и выкладка на GitHub Pages. Сайт: https://alessioilini.github.io/eclipse/

Однократная настройка репозитория: Settings → Pages → Source: GitHub Actions.

## Арт

Портреты и арт в рост генерируются через OpenAI Images и упаковываются в WebP:

```sh
OPENAI_API_KEY=… npm run art
npm run art:pack
```

Затем закоммитить `public/art`. Исходные PNG лежат в `art/out/` и в репозиторий не попадают.

Параметры `npm run art -- …`:

- `--only <id>` — только одна героиня (например, `--only aira`);
- `--kind portrait|full` — только портреты или только арт в рост;
- `--force` — перегенерировать уже существующие файлы (по умолчанию они пропускаются).

Модель по умолчанию `gpt-image-2.5-sunburst`, альтернатива `gpt-image-2.5-flare`: `npm run art -- --model gpt-image-2.5-flare` или переменная `OPENAI_IMAGE_MODEL`. Качество `--quality low|medium|high|xhigh|max` (по умолчанию medium; `high` заметно лучше рисует руки, примерно втрое дороже) или `OPENAI_IMAGE_QUALITY`. Полный прогон стоит около 1 доллара. Ключ берётся только из окружения: не записывайте его в файлы и не коммитьте. Стиль и промпты: `art/style.md`, `art/prompts.ts`.

## Telegram-бот

1. В [@BotFather](https://t.me/BotFather) отправить `/newbot`, ввести имя бота и username (оканчивается на `bot`).
2. Отправить `/newapp`, выбрать этого бота и ввести название, описание, картинку, Web App URL `https://alessioilini.github.io/eclipse/` и short name `play`.
3. Вписать username бота (без `@`) в `TG_BOT` в `src/config.ts`. `TG_APP` должен совпадать с short name из шага 2 (`play`).

После этого ссылки-вызовы, отправленные из Telegram, имеют вид `https://t.me/<бот>/play?startapp=<код>`. Пока `TG_BOT` равен `null`, ссылки строятся по адресу сайта.

## Ссылки-вызовы

Вызов — это ссылка `…/#/c/<код>`, где код (base64url, не длиннее 100 символов) содержит колоду отправителя (шесть героинь и двенадцать карт), seed матча, имя отправителя и контрольную сумму. Сервер не нужен: получатель раскодирует ссылку у себя и играет против бота с колодой и seed отправителя, поэтому противник у всех одинаковый.
