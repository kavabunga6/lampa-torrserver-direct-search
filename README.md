# TorrServer Direct Search для Lampa

Плагин добавляет в Lampa поиск торрентов напрямую через TorrServer, без запросов к TMDB или CUB внутри самого источника поиска.

## Что делает

- добавляет кнопку меню `TS поиск`;
- открывает поиск только по источнику TorrServer;
- может добавить отдельную вкладку `TorrServer` в общий поиск Lampa;
- отправляет выбранный magnet в стандартный проигрыватель Lampa через `Lampa.Torrent.start`;
- использует endpoint TorrServer `/torznab/search/?query=...`, с опциональным fallback на `/search/?query=...`.

## Установка

1. Опубликуйте `torrserver-direct-search.js` по HTTP/HTTPS, например через GitHub Pages или локальный веб-сервер.
2. В Lampa откройте `Настройки -> Расширения -> Добавить плагин`.
3. Укажите URL до `torrserver-direct-search.js`.
4. Откройте `Настройки -> TorrServer поиск`.
5. Оставьте включенным `Использовать TorrServer из настроек Lampa` или задайте адрес вручную.

## Настройки

- `Использовать TorrServer из настроек Lampa` - берет адрес из стандартных настроек TorrServer в Lampa.
- `Адрес TorrServer` - ручной адрес, например `http://192.168.1.10:8090`.
- `Добавить вкладку в общий поиск` - включает источник в обычном поиске Lampa.
- `Таймаут поиска, секунд` - ограничение ожидания ответа от TorrServer.
- `Источник поиска TorrServer` - `Torznab`, `Rutor` или `Torznab + Rutor`.

## Проверка

```bash
npm test
npm run test:smoke
```

Smoke-тест по умолчанию проверяет `http://torrserver.home/torznab/search/?query=matrix`. Адрес и запрос можно заменить:

```bash
TORRSERVER_URL=http://torrserver.home TORRSERVER_QUERY=matrix npm run test:smoke
```

## Важно

Кнопка `TS поиск` открывает поиск с единственным источником TorrServer, поэтому не запускает TMDB/CUB-поиск параллельно. Если включена вкладка в общем поиске, другие вкладки Lampa могут работать по своим обычным правилам, но вкладка `TorrServer` все равно обращается только к TorrServer.
