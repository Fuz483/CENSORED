# Пляцоўка

## Локальный запуск

Frontend: Node.js 22+, backend: Python 3.12+ и PostgreSQL.

1. Скопируйте `.env.example` в `.env`. Для локального PostgreSQL задайте
   `POSTGRES_HOST=localhost` и свои данные подключения. Для Docker оставьте `db`.
2. Для локального PostgreSQL подготовьте backend один раз (из корня):

   ```powershell
   python -m venv backend/.venv
   backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
   ```

   Затем каждый раз запускайте backend и frontend вместе из корня:

   ```powershell
   .\start-local.ps1
   ```

   Скрипт запускает PostgreSQL, применяет миграции, включает фоновый watchdog
   backend, проверяет готовность API, затем запускает frontend на
   `http://localhost:5173`. Watchdog следит за `/health` и автоматически
   перезапускает backend, если процесс завершился или API перестал отвечать;
   логи старта находятся в `.local/backend-supervisor.log` и
   `.local/backend-*.err.log`. Скрипт не запускает второй Vite, если frontend
   уже работает. Если API не готов, frontend не стартует.
   Для ручного запуска используйте команды API и frontend отдельно, но сначала
   дождитесь ответа `http://127.0.0.1:8000/health` со статусом 200.

   Альтернатива из корня: `docker compose up --build` (нужен Docker).
   Compose выполняет `scripts.seed`, который добавляет демонстрационные записи;
   не используйте это наполнение как реальный каталог.

3. Ручной запуск frontend (из `frontend/`, если не используется `start-local.ps1`):

   ```powershell
   npm install
   npm run dev
   ```

    Откройте `http://localhost:5173`. Vite использует `vite.config.ts`:
    прокси `/api` направлен на `127.0.0.1:8000` и занимает фиксированный порт,
    чтобы не запускаться незаметно на другом адресе.
   После изменения конфигурации перезапустите старые Vite-процессы.
   Не открывайте `index.html` напрямую — CSS требует сборки Tailwind.

Для удалённого backend скопируйте `frontend/.env.example` в `frontend/.env`.
`API_PROXY_TARGET` — адрес backend для разработки. `VITE_API_BASE_URL` — origin
backend для production-сборки (без `/api/v1`); при пустом значении настройте
reverse proxy `/api` на сервере размещения frontend.

## API и ограничения

- Регистрация/вход: `POST /api/v1/auth/register`, `/auth/login`; восстановление
  сессии: `GET /api/v1/auth/me`. JWT хранится в `sessionStorage` текущей вкладки.
- Доступность: `GET /api/v1/rooms/available?date=YYYY-MM-DD&type_room=sport_hall`.
  Frontend запрашивает пять типов на семь дней, без локального демо-каталога.
- Бронь: `POST /api/v1/bookings` с Bearer JWT, минимум 1 час, шаг 15 минут.
  История: `GET /api/v1/bookings/user/{user_id}`. Отмена: `PATCH
  /api/v1/bookings/{id}/state` с `{"state":"cancelled"}`.
- Новые брони сразу получают статус `confirmed` и серверный QR-код; оплата не
  требуется. Несколько броней отправляются отдельными POST; при частичном успехе
  проверьте историю, прежде чем повторять запрос. Охрана проверяет код, статус и
  дату брони: допуск разрешён только в день бронирования.
- Backend пока использует встроенный каталог помещений и записи бронирований,
  не постоянную модель помещений. Фото, адреса и часть вместимостей отсутствуют;
  frontend не подменяет их выдуманными данными.
- CRUD помещений, редактирование профиля и платёжный провайдер не подключены.

## Кабинет УО для хакатона

В форме входа выберите «УО»: один пароль открывает кабинет «Лицей БГУ».
Для локальной демонстрации включён `UO_DEMO_ENABLED=true` в `.env`.
По умолчанию в `.env.example` режим выключен. Аккаунт хранится в PostgreSQL,
пароль — только в виде хеша; проверка выполняется на backend, сессия — JWT.
Из `backend/` можно задать или заменить пароль:

```powershell
.venv/Scripts/python.exe -m scripts.setup_uo_demo
```

Кабинет показывает три демонстрационных помещения, свободные часы и реальные
заявки арендаторов только для Лицея БГУ. Кнопка «Обновить данные» загружает
новые заявки; создание/изменение помещений и ручные брони пока не реализованы.
Помещения и расписание предназначены для показа, не подтверждены учреждением.
Выдача паролей главным администратором, несколько учреждений, ограничение
попыток входа и смена/отзыв паролей — отдельный этап перед production.
Демонстрационный режим не следует включать на публичном production-сервере.

## Проверки

Frontend: `npm run build` из `frontend/`.

API-тесты из `backend/` (изолированная SQLite БД, не затрагивают PostgreSQL):

```powershell
.venv/Scripts/python.exe -m pip install -r requirements-dev.txt
.venv/Scripts/python.exe -m unittest discover -s tests -v
```
