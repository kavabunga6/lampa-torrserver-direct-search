(function () {
  'use strict';

  var PLUGIN_ID = 'ts_direct_search';
  var PLUGIN_NAME = 'TorrServer Direct Search';
  var DEFAULT_ENDPOINT = 'torznab';
  var network;
  var source;
  var menu_button;
  var source_registered = false;
  var menu_listener_registered = false;

  var icon =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M10.5 18a7.5 7.5 0 1 1 5.303-2.197L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M7.5 10.5h6M10.5 7.5v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>';

  function boot() {
    if (!window.Lampa) {
      setTimeout(boot, 300);
      return;
    }

    if (window[PLUGIN_ID]) return;
    window[PLUGIN_ID] = true;

    network = new Lampa.Reguest();

    addSettings();
    registerTorrServerSource();
    buildSource();
    scheduleMenuButton();
    syncGlobalSource();

    Lampa.Storage.listener.follow('change', function (event) {
      if (
        event.name === PLUGIN_ID + '_in_global_search' ||
        event.name === PLUGIN_ID + '_use_lampa_url' ||
        event.name === PLUGIN_ID + '_url' ||
        event.name === PLUGIN_ID + '_endpoint' ||
        event.name === 'torrserver_url' ||
        event.name === 'torrserver_url_two' ||
        event.name === 'torrserver_use_link'
      ) {
        syncGlobalSource();
      }
    });

    console.log(PLUGIN_NAME + ' loaded');
  }

  function addSettings() {
    Lampa.SettingsApi.addComponent({
      component: PLUGIN_ID,
      name: 'TorrServer поиск',
      icon: icon
    });

    Lampa.SettingsApi.addParam({
      component: PLUGIN_ID,
      param: {
        name: PLUGIN_ID + '_use_lampa_url',
        type: 'trigger',
        default: true
      },
      field: {
        name: 'Использовать TorrServer из настроек Lampa',
        description: 'Если выключено, будет использоваться адрес ниже.'
      }
    });

    Lampa.SettingsApi.addParam({
      component: PLUGIN_ID,
      param: {
        name: PLUGIN_ID + '_url',
        type: 'input',
        values: '',
        default: 'http://127.0.0.1:8090'
      },
      field: {
        name: 'Адрес TorrServer',
        description: 'Например: http://192.168.1.10:8090'
      }
    });

    Lampa.SettingsApi.addParam({
      component: PLUGIN_ID,
      param: {
        name: PLUGIN_ID + '_in_global_search',
        type: 'trigger',
        default: true
      },
      field: {
        name: 'Добавить вкладку в общий поиск',
        description: 'Вкладка ищет только через TorrServer. Кнопка меню всегда открывает поиск без TMDB/CUB.'
      }
    });

    Lampa.SettingsApi.addParam({
      component: PLUGIN_ID,
      param: {
        name: PLUGIN_ID + '_timeout',
        type: 'input',
        values: '',
        default: '15'
      },
      field: {
        name: 'Таймаут поиска, секунд',
        description: 'Сколько ждать ответ от TorrServer.'
      }
    });

    Lampa.SettingsApi.addParam({
      component: PLUGIN_ID,
      param: {
        name: PLUGIN_ID + '_endpoint',
        type: 'select',
        values: {
          torznab: 'Torznab',
          rutor: 'Rutor',
          both: 'Torznab + Rutor'
        },
        default: DEFAULT_ENDPOINT
      },
      field: {
        name: 'Источник поиска TorrServer',
        description: 'Torznab использует настроенные в TorrServer Jackett/Prowlarr-индексеры.'
      }
    });

    Lampa.SettingsApi.addParam({
      component: PLUGIN_ID,
      param: {
        name: PLUGIN_ID + '_poster_lookup',
        type: 'trigger',
        default: false
      },
      field: {
        name: 'Искать постеры через TMDB',
        description: 'Опционально. Может делать дополнительные запросы к TMDB, поэтому выключено по умолчанию.'
      }
    });

    Lampa.SettingsApi.addParam({
      component: PLUGIN_ID,
      param: {
        name: PLUGIN_ID + '_poster_lookup_limit',
        type: 'input',
        values: '',
        default: '8'
      },
      field: {
        name: 'Сколько постеров искать',
        description: 'Ограничивает число TMDB-запросов на один поиск.'
      }
    });

    Lampa.SettingsApi.addParam({
      component: PLUGIN_ID,
      param: {
        name: PLUGIN_ID + '_results_limit',
        type: 'input',
        values: '',
        default: '120'
      },
      field: {
        name: 'Лимит результатов',
        description: 'Сколько результатов TorrServer показывать в одной линии.'
      }
    });
  }

  function addMenuButton() {
    if (menu_button || !Lampa.Menu || !Lampa.Search) return;

    try {
      menu_button = Lampa.Menu.addButton(icon, 'TS поиск', function () {
        Lampa.Search.open({
          sources: [source],
          input: ''
        });
      });
    } catch (error) {
      menu_button = null;
      return false;
    }

    return true;
  }

  function scheduleMenuButton() {
    if (addMenuButton()) return;

    if (!menu_listener_registered && Lampa.Listener && Lampa.Listener.follow) {
      menu_listener_registered = true;
      Lampa.Listener.follow('menu', function (event) {
        if (event.type === 'end' || event.type === 'start') addMenuButton();
      });
    }

    setTimeout(function () {
      addMenuButton();
    }, 1000);
  }

  function buildSource() {
    source = {
      title: 'TorrServer',
      search: function (params, done) {
        var query = decodeURIComponent(params.query || '').trim();
        if (!query) {
          done([]);
          return;
        }

        searchTorrServer(query, function (items) {
          items.sort(function (a, b) {
            return (b.Seeders || 0) - (a.Seeders || 0);
          });

          done(formatSearchResults(items));
        }, function () {
          done([]);
        });
      },
      onCancel: function () {
        network.clear();
      },
      onSelect: function (params, close) {
        close();
        openTorrentFull(params.element);
      },
      params: {
        lazy: false,
        nofound: 'search_nofound',
        start_typing: 'search_start_typing'
      }
    };
  }

  function registerTorrServerSource() {
    if (!Lampa.Api || !Lampa.Api.sources) return;

    Lampa.Api.sources.torrserver = {
      full: function (params, oncomplite, onerror) {
        var card = fullRouteCard(params);

        if (!card) {
          onerror && onerror();
          return;
        }

        var movie = buildFullMovie(card);
        var result = {
          movie: movie,
          persons: {
            cast: [],
            crew: []
          },
          recomend: {
            results: []
          },
          simular: {
            results: []
          }
        };

        if (movie.ts_reactions_enabled) {
          result.reactions = {
            result: []
          };
        }

        oncomplite(result);
      }
    };

    if (Lampa.Listener && Lampa.Listener.follow) {
      Lampa.Listener.follow('full', function (event) {
        if (!event || event.type !== 'complite' || !event.object || event.object.source !== 'torrserver') return;

        scheduleFullBindings(event.body, event.data || event.object);
      });
    }
  }

  function openTorrentFull(item) {
    var card = buildFullMovie(item);

    if (Lampa.Router && Lampa.Router.call) {
      Lampa.Router.call('full', card);
      return;
    }

    Lampa.Torrent.start(item, {
      title: item.Title || item.title || 'Torrent'
    });
  }

  function buildFullMovie(item) {
    var tmdb = item.tmdb || {};
    var title = item.Title || item.title || tmdb.title || tmdb.name || 'TorrServer';
    var id = tmdb.id || item.hash || lampaUtils().hash(item.Link || title || 'torrserver');
    var release = tmdb.release_date || tmdb.first_air_date || publishDate(item) || '';
    var poster = tmdb.poster_path || (item.poster && item.poster.indexOf('data:image/') !== 0 ? item.poster : '');
    var backdrop = tmdb.backdrop_path || tmdb.background_image || poster;
    var countries = normalizeCountries(tmdb);
    var reactions_enabled = canUseReactions(item);

    return {
      id: id,
      source: 'torrserver',
      method: 'movie',
      card: item,
      title: title,
      name: title,
      original_title: tmdb.original_title || tmdb.original_name || title,
      release_date: release,
      first_air_date: release,
      overview: tmdb.overview || torrentOverview(item),
      tagline: item.Tracker ? 'TorrServer / ' + item.Tracker : 'TorrServer',
      vote_average: tmdb.vote_average || 0,
      runtime: 0,
      genres: torrentGenres(item),
      poster_path: poster,
      img: poster,
      background_image: backdrop,
      production_countries: countries.map(function (name) {
        return {
          iso_3166_1: name,
          name: name
        };
      }),
      origin_country: countries,
      countries: countries,
      production_companies: [],
      ts_reactions_enabled: reactions_enabled,
      ts_torrent_card: item
    };
  }

  function canUseReactions(item) {
    var tmdb = item && item.tmdb;

    if (!tmdb || !tmdb.id) return false;

    if (typeof window === 'undefined' || !window.Lampa || !Lampa.Api || !Lampa.Api.sources) return true;

    return !!(Lampa.Api.sources.cub && Lampa.Api.sources.cub.reactionsAdd);
  }

  function normalizeCountries(tmdb) {
    var values = [];

    if (Array.isArray(tmdb.production_countries)) {
      tmdb.production_countries.forEach(function (country) {
        values.push(country && (country.name || country.iso_3166_1 || country));
      });
    }

    if (Array.isArray(tmdb.origin_country)) {
      values = values.concat(tmdb.origin_country);
    }

    if (typeof tmdb.production_countries === 'string') values.push(tmdb.production_countries);
    if (typeof tmdb.origin_country === 'string') values.push(tmdb.origin_country);

    return values.filter(Boolean);
  }

  function fullRouteCard(params) {
    if (!params) return null;
    if (params.ts_torrent_card) return params.ts_torrent_card;
    if (params.card) return params.card;
    if (params.movie && params.movie.ts_torrent_card) return params.movie.ts_torrent_card;
    if (params.movie) return params.movie;
    return params.Title || params.title || params.Link || params.MagnetUri ? params : null;
  }

  function scheduleFullBindings(body, params) {
    [0, 200, 800].forEach(function (delay) {
      setTimeout(function () {
        bindFullPlayButton(body, params);
        toggleFullReactions(body, params);
      }, delay);
    });
  }

  function bindFullPlayButton(body, params) {
    var torrent = playableTorrentItem(params);

    if (!torrent) return;

    var page = fullBody(body);
    var direct = page.find('.view--torrent');
    var play = page.find('.button--play');

    direct.removeClass('hide');
    direct.addClass('selector');
    direct.attr('data-subtitle', 'TorrServer');
    direct.data('subtitle', 'TorrServer');
    direct.off('hover:enter hover:touch click');
    direct.on('hover:enter.ts-direct-search hover:touch.ts-direct-search click.ts-direct-search', function () {
      startTorrent(torrent);
    });

    play.removeClass('hide');
    play.addClass('selector');
    play.off('hover:enter.ts-direct-search hover:touch.ts-direct-search click.ts-direct-search');
    play.on('hover:enter.ts-direct-search hover:touch.ts-direct-search click.ts-direct-search', function () {
      if (!page.find('.buttons--container > .full-start__button:not(.hide)').not('.view--torrent').length) {
        startTorrent(torrent);
      }
    });
  }

  function playableTorrentItem(item) {
    item = fullRouteCard(item);

    if (!item) return null;

    var link = item.MagnetUri || item.Link || item.link || item.url;

    if (!link && item.card) link = item.card.MagnetUri || item.card.Link || item.card.link || item.card.url;
    if (!link && item.ts_torrent_card) link = item.ts_torrent_card.MagnetUri || item.ts_torrent_card.Link || item.ts_torrent_card.link || item.ts_torrent_card.url;
    if (!link) return null;

    var title = item.Title || item.title || item.name || 'Torrent';

    return {
      Title: title,
      title: title,
      MagnetUri: link,
      Link: link,
      poster: item.poster || item.img || '',
      img: item.img || item.poster || '',
      hash: item.hash || lampaUtils().hash(link || title)
    };
  }

  function startTorrent(item) {
    prepareTorrentReturn();

    Lampa.Torrent.start(item, {
      title: item.Title || item.title || 'Torrent'
    });
  }

  function prepareTorrentReturn() {
    if (Lampa.Torrent && Lampa.Torrent.back) {
      Lampa.Torrent.back(function () {
        closeTorrentModal();
        restoreFullController();
      });
    }

    if (Lampa.Torrent && Lampa.Torrent.opened) {
      Lampa.Torrent.opened(function () {
        if (Lampa.Player && Lampa.Player.callback) {
          Lampa.Player.callback(function () {
            closeTorrentModal();
            restoreFullController();
          });
        }
      });
    }
  }

  function closeTorrentModal() {
    if (Lampa.Modal && Lampa.Modal.close) {
      try {
        Lampa.Modal.close();
      } catch (error) {
        logDebug('modal close failed', error);
      }
    }
  }

  function restoreFullController() {
    setTimeout(function () {
      if (!Lampa.Controller || !Lampa.Controller.toggle) return;

      try {
        Lampa.Controller.toggle('full_start');
      } catch (error) {
        Lampa.Controller.toggle('content');
      }
    }, 50);
  }

  function toggleFullReactions(body, params) {
    var card = fullRouteCard(params);
    var movie = params && (params.movie || params);
    var enabled = movie && movie.ts_reactions_enabled;

    if (!enabled && card) enabled = canUseReactions(card);
    if (enabled) return;

    fullBody(body).find('.full-start-new__reactions, .button--reaction').remove();
  }

  function fullBody(body) {
    if (body) return $(body);
    if (typeof document !== 'undefined') return $(document);
    return $();
  }

  function publishDate(item) {
    if (item.CreateDate) return item.CreateDate;
    if (!item.PublishDate) return '';

    try {
      return new Date(item.PublishDate).toISOString().slice(0, 10);
    } catch (error) {
      return '';
    }
  }

  function torrentOverview(item) {
    var parts = ['Источник: TorrServer'];

    if (item.size) parts.push('Размер: ' + item.size);
    if (!isNaN(item.Seeders)) parts.push('Сиды: ' + item.Seeders);
    if (!isNaN(item.Peers)) parts.push('Пиры: ' + item.Peers);
    if (item.Tracker) parts.push('Трекер: ' + item.Tracker);

    return parts.join('\n');
  }

  function torrentGenres(item) {
    var categories = (item.CategoryDesc || '').split(/[|,/]/).map(function (name) {
      return name.trim();
    }).filter(Boolean).slice(0, 3);

    if (!categories.length) categories = ['TorrServer'];

    return categories.map(function (name, index) {
      return {
        id: index + 1,
        name: name
      };
    });
  }

  function syncGlobalSource() {
    if (!Lampa.Search || !source) return;

    if (source_registered) {
      Lampa.Search.removeSource(source);
      source_registered = false;
    }

    if (Lampa.Storage.field(PLUGIN_ID + '_in_global_search') && getTorrServerUrl()) {
      Lampa.Search.addSource(source);
      source_registered = true;
    }
  }

  function searchTorrServer(query, done, fail) {
    var base = getTorrServerUrl();
    if (!base) {
      Lampa.Noty.show('Укажите адрес TorrServer');
      fail();
      return;
    }

    var timeout = parseInt(Lampa.Storage.field(PLUGIN_ID + '_timeout'), 10);
    if (!timeout || timeout < 1) timeout = 15;

    network.timeout(timeout * 1000);

    requestTorrServer(query, function (json) {
      if (!Array.isArray(json)) {
        logDebug('search response is not an array', json);
        fail();
        return;
      }

      var normalized = normalizeResults(json);
      logDebug('search complete', {
        query: query,
        raw: json.length,
        normalized: normalized.length,
        url: getTorrServerUrl(),
        endpoint: Lampa.Storage.field(PLUGIN_ID + '_endpoint') || DEFAULT_ENDPOINT
      });

      enrichPosters(normalized, function (items) {
        done(items);
      });
    }, fail);
  }

  function requestTorrServer(query, done, fail) {
    var endpoint = Lampa.Storage.field(PLUGIN_ID + '_endpoint') || DEFAULT_ENDPOINT;
    var endpoints = endpoint === 'both' ? ['torznab', 'rutor'] : [endpoint];
    var results = [];
    var index = 0;

    function next() {
      var current = endpoints[index++];
      if (!current) {
        done(results);
        return;
      }

      requestEndpoint(current, query, function (json) {
        if (Array.isArray(json) && json.length) {
          results = results.concat(json);
          done(results);
        } else {
          next();
        }
      }, function () {
        next();
      });
    }

    next();
  }

  function requestEndpoint(endpoint, query, done, fail) {
    var base = getTorrServerUrl();
    var path = endpoint === 'rutor' ? '/search/' : '/torznab/search/';
    var url = buildUrl(base, path, [{ name: 'query', value: query }]);
    var request = network.native || network.silent;

    request.call(network, url, done, fail);
  }

  function logDebug(message, data) {
    if (typeof console !== 'undefined' && console.log) {
      console.log(PLUGIN_NAME + ': ' + message, data || '');
    }
  }

  function normalizeResults(items) {
    var checked_at = Date.now();

    return items.map(function (item) {
      var title = item.Title || item.title || item.Name || item.name || '';
      var link = item.Magnet || item.magnet || item.MagnetUri || item.downloadUrl || item.Link || item.link || '';
      var hash = lampaUtils().hash(link || title);

      return {
        Title: title,
        title: title,
        Tracker: item.Tracker || item.tracker || item.Indexer || item.indexer || '',
        Size: item.Size || item.size || 0,
        size: normalizeSize(item.Size || item.size || 0),
        PublishDate: lampaUtils().strToTime(item.CreateDate || item.createDate || item.PublishDate || item.publishDate || ''),
        Seeders: parseInt(item.Seed || item.seed || item.Seeders || item.seeders || 0, 10),
        Peers: parseInt(item.Peer || item.peer || item.Peers || item.peers || 0, 10),
        MagnetUri: link,
        Link: link,
        poster: buildPoster(title, item.Tracker || item.tracker || item.Indexer || item.indexer || ''),
        img: buildPoster(title, item.Tracker || item.tracker || item.Indexer || item.indexer || ''),
        CategoryDesc: item.Categories || item.categories || item.CategoryDesc || '',
        bitrate: '-',
        checked_at: checked_at,
        source_rank: 0,
        hash: hash,
        viewed: viewed(hash)
      };
    }).filter(function (item) {
      return item.Title && item.MagnetUri;
    });
  }

  function formatSearchResults(items) {
    var limit = resultLimit();
    var results = items.slice(0, limit).map(function (item) {
      item.Title = shortText(item.Title, 110);
      item.title = item.Title;
      item.name = item.Title;
      item.original_title = item.Tracker || 'TorrServer';
      item.source = 'torrserver';
      item.method = 'movie';

      return item;
    });

    return results.length ? [{
      title: 'TorrServer',
      results: results,
      total: results.length,
      total_pages: 1,
      page: 1,
      params: {
        items: {
          view: Math.max(results.length, 7),
          align_left: false,
          mapping: 'line'
        },
        scroll: {
          horizontal: true,
          step: 300
        }
      }
    }] : [];
  }

  function resultLimit() {
    var limit = 120;

    if (typeof window !== 'undefined' && window.Lampa && Lampa.Storage) {
      limit = parseInt(Lampa.Storage.field(PLUGIN_ID + '_results_limit'), 10);
    }

    if (!limit || limit < 1) limit = 120;
    return Math.min(limit, 300);
  }

  function enrichPosters(items, done) {
    var enabled = Lampa.Storage.field(PLUGIN_ID + '_poster_lookup');
    var limit = parseInt(Lampa.Storage.field(PLUGIN_ID + '_poster_lookup_limit'), 10);

    if (!enabled || !Lampa.Api || !Lampa.Api.search || !Lampa.Api.img) {
      done(items);
      return;
    }

    if (!limit || limit < 1) limit = 8;

    var queue = items.slice(0, limit).filter(function (item) {
      return item && item.Title;
    });
    var pending = queue.length;
    var completed = false;

    if (!pending) {
      done(items);
      return;
    }

    var timer = setTimeout(function () {
      finish();
    }, 4500);

    queue.forEach(function (item) {
      var query = cleanPosterQuery(item.Title);

      if (!query) {
        oneDone();
        return;
      }

      try {
        Lampa.Api.search({ query: query }, function (result) {
          var card = result && (result.movie || result.tv);

          if (card && card.poster_path) {
            item.poster = Lampa.Api.img(card.poster_path, 'w300');
            item.img = item.poster;
          }

          if (card) {
            item.tmdb = card;
          }

          oneDone();
        });
      } catch (error) {
        oneDone();
      }
    });

    function oneDone() {
      pending--;
      if (pending <= 0) finish();
    }

    function finish() {
      if (completed) return;

      completed = true;
      clearTimeout(timer);
      done(items);
    }
  }

  function cleanPosterQuery(title) {
    return (title || '')
      .replace(/\[[^\]]+\]/g, ' ')
      .replace(/\([^\)]*(?:rip|hdr|hevc|x264|x265|web|dl|bluray|hdtv|proper|repack)[^\)]*\)/ig, ' ')
      .replace(/\b(2160p|1080p|720p|480p|4k|uhd|hdr|dv|web[- .]?dl|webrip|brrip|bluray|hdtv|hevc|x264|x265|aac|dts|ddp?\d?\.?\d?|mp4|mkv|avi|p2p|proper|repack)\b/ig, ' ')
      .replace(/\b(19|20)\d{2}\b.*$/, function (match) {
        return match.slice(0, 4);
      })
      .replace(/[-_.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
  }

  function getTorrServerUrl() {
    if (Lampa.Storage.field(PLUGIN_ID + '_use_lampa_url')) {
      if (Lampa.Torserver && Lampa.Torserver.url && Lampa.Torserver.url()) {
        return Lampa.Torserver.url();
      }

      var use_second = Lampa.Storage.field('torrserver_use_link') === 'two';
      var lampa_url = Lampa.Storage.field(use_second ? 'torrserver_url_two' : 'torrserver_url');
      return lampa_url ? normalizeUrl(lampa_url) : '';
    }

    return normalizeUrl(Lampa.Storage.field(PLUGIN_ID + '_url'));
  }

  function normalizeUrl(url) {
    if (!url) return '';
    return lampaUtils().checkEmptyUrl((url + '').replace(/\/+$/, ''));
  }

  function buildUrl(base, path, query) {
    if (lampaUtils().buildUrl) return lampaUtils().buildUrl(base, path, query);

    var url = base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
    var query_string = query.map(function (item) {
      return encodeURIComponent(item.name) + '=' + encodeURIComponent(item.value);
    }).join('&');

    return url + (query_string ? '?' + query_string : '');
  }

  function viewed(hash) {
    if (typeof window === 'undefined' || !window.Lampa || !Lampa.Storage) return false;

    var view = Lampa.Storage.cache('torrents_view', 5000, []);
    return view.indexOf(hash) > -1;
  }

  function normalizeSize(size) {
    if (typeof size === 'number') return formatBytes(size);

    return normalizeSizeLabel(size);
  }

  function normalizeSizeLabel(size) {
    if (!size && size !== 0) return '';

    var text = String(size).trim();
    var match = text.match(/^([\d\s.,]+)\s*([kmgtp])c?i?b$/i);

    if (!match) return text;

    return formatSizeValue(parseSizeNumber(match[1]), match[2]);
  }

  function parseSizeNumber(value) {
    value = String(value || '').replace(/\s+/g, '').replace(',', '.');
    var number = parseFloat(value);

    return isNaN(number) ? 0 : number;
  }

  function formatBytes(bytes) {
    var value = Number(bytes);
    var units = ['b', 'k', 'm', 'g', 't', 'p'];
    var index = 0;

    if (!value || value < 0) return formatSizeValue(0, 'b');

    while (value >= 1024 && index < units.length - 1) {
      value = value / 1024;
      index++;
    }

    return formatSizeValue(value, units[index]);
  }

  function formatSizeValue(value, unit) {
    var locale = currentLocale();
    var labels = sizeUnitLabels(locale);
    var label = labels[String(unit || '').toLowerCase()] || unit;
    var decimals = value >= 100 || Math.round(value) === value ? 0 : 1;
    var formatter = typeof Intl !== 'undefined' ? new Intl.NumberFormat(locale, {
      maximumFractionDigits: decimals
    }) : null;
    var number = formatter ? formatter.format(value) : String(Number(value.toFixed(decimals)));

    return number + ' ' + label;
  }

  function sizeUnitLabels(locale) {
    if (/^ru\b/i.test(locale || '')) {
      return {
        b: 'Б',
        k: 'КБ',
        m: 'МБ',
        g: 'ГБ',
        t: 'ТБ',
        p: 'ПБ'
      };
    }

    return {
      b: 'B',
      k: 'KiB',
      m: 'MiB',
      g: 'GiB',
      t: 'TiB',
      p: 'PiB'
    };
  }

  function currentLocale() {
    if (typeof window !== 'undefined') {
      if (window.Lampa && Lampa.Storage && Lampa.Storage.field('language')) {
        return Lampa.Storage.field('language');
      }

      if (window.navigator && (navigator.language || navigator.userLanguage)) {
        return navigator.language || navigator.userLanguage;
      }
    }

    return 'ru-RU';
  }

  function shortText(text, len) {
    text = text || '';
    if (lampaUtils().shortText) return lampaUtils().shortText(text, len);
    return text.length > len ? text.slice(0, len - 3) + '...' : text;
  }

  function buildPoster(title, tracker) {
    return './img/img_broken.svg';
  }

  function lampaUtils() {
    if (typeof window !== 'undefined' && window.Lampa && Lampa.Utils) return Lampa.Utils;

    return {
      hash: function (text) {
        var hash = 0;
        text = text || '';

        for (var i = 0; i < text.length; i++) {
          hash = ((hash << 5) - hash) + text.charCodeAt(i);
          hash |= 0;
        }

        return hash + '';
      },
      strToTime: function (value) {
        var time = Date.parse(value || '');
        return isNaN(time) ? 0 : time;
      },
      checkEmptyUrl: function (url) {
        return url || '';
      },
      bytesToSize: function (size) {
        return size + ' B';
      }
    };
  }

  if (typeof window !== 'undefined') boot();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildFullMovie: buildFullMovie,
      buildUrl: buildUrl,
      buildPoster: buildPoster,
      cleanPosterQuery: cleanPosterQuery,
      formatSearchResults: formatSearchResults,
      fullRouteCard: fullRouteCard,
      normalizeSizeLabel: normalizeSizeLabel,
      normalizeResults: normalizeResults,
      playableTorrentItem: playableTorrentItem
    };
  }
})();
