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
  var styles_injected = false;

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
    registerFullComponent();
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
      onRecall: function (data) {
        if (!data || !data[0] || !data[0].results) return;

        data[0].results.forEach(function (item) {
          item.params = {
            createInstance: function (card_data) {
              return new TorrentResultCard(card_data);
            }
          };
        });
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

  function registerFullComponent() {
    if (Lampa.Component && Lampa.Component.add) {
      Lampa.Component.add('ts_full', TorrServerFullComponent);
    }
  }

  function openTorrentFull(item) {
    var object = {
      component: 'ts_full',
      source: 'torrserver',
      title: item.Title || item.title || 'TorrServer',
      card: item,
      method: 'movie',
      id: item.hash || lampaUtils().hash(item.Link || item.Title || 'torrserver')
    };

    if (Lampa.Activity && Lampa.Activity.push) {
      Lampa.Activity.push(object);
    } else if (Lampa.Router && Lampa.Router.call) {
      Lampa.Router.call('ts_full', object);
    } else {
      Lampa.Torrent.start(item, {
        title: object.title
      });
    }
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
      item.params = {
        createInstance: function (data) {
          return new TorrentResultCard(data);
        }
      };

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
    var svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">',
      '<rect width="300" height="450" fill="#3f3f3f"/>',
      '<g opacity="0.36" fill="none" stroke="#8a8a8a" stroke-width="10" stroke-linejoin="round" stroke-linecap="round">',
      '<rect x="101" y="176" width="98" height="98"/>',
      '<path d="M112 244l37-21 31 20 19-13"/>',
      '<path d="M112 263l37-21 31 20 19-13"/>',
      '<path d="M112 225l22-13 15 10"/>',
      '</g>',
      '</svg>'
    ].join('');

    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  function escapeSvg(text) {
    return (text || '').replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char];
    });
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

  function TorrentResultCard(data) {
    this.data = data;
    this.components = [];
    this.html = null;
  }

  TorrentResultCard.prototype.use = function (module) {
    if (this.components.indexOf(module) < 0) this.components.push(module);
  };

  TorrentResultCard.prototype.emit = function (event) {
    var args = Array.prototype.slice.call(arguments, 1);
    var name = event.charAt(0).toUpperCase() + event.slice(1);
    var only = null;

    this.components.forEach(function (component) {
      if (typeof component['only' + name] === 'function') only = component['only' + name];
    });

    if (only) return only.apply(this, args);

    this.components.forEach(function (component) {
      if (typeof component['on' + name] === 'function') component['on' + name].apply(this, args);
    }, this);
  };

  TorrentResultCard.prototype.create = function () {
    var data = this.data;

    injectCardStyles();

    this.html = createTorrentCardHtml(data);
    this.html.attr('data-hash', data.hash || '');
    this.html.card_data = data;
    this.html[0].card_data = data;
    this.html.on('visible', this.emit.bind(this, 'visible'));
    this.html.on('hover:focus', this.onFocus.bind(this));
    this.html.on('hover:touch', this.onTouch.bind(this));
    this.html.on('hover:hover', this.onHover.bind(this));
    this.html.on('hover:enter', this.onEnter.bind(this));
    this.html.on('hover:long', this.emit.bind(this, 'long', this.html, data));

    this.emit('create');
  };

  TorrentResultCard.prototype.onFocus = function () {
    $('.ts-direct-search-card').removeClass('focus hover');
    this.html.addClass('focus');
    this.emit('focus', this.html, this.data);
  };

  TorrentResultCard.prototype.onHover = function () {
    $('.ts-direct-search-card').removeClass('hover');
    this.html.addClass('hover');
    this.emit('hover', this.html, this.data);
  };

  TorrentResultCard.prototype.onTouch = function () {
    pressCard(this.html);
    this.emit('touch', this.html, this.data);
  };

  TorrentResultCard.prototype.onEnter = function () {
    pressCard(this.html);
    this.emit('enter', this.html, this.data);
  };

  TorrentResultCard.prototype.render = function (js) {
    return js ? this.html : $(this.html);
  };

  TorrentResultCard.prototype.destroy = function () {
    if (this.html) this.html.remove();
    this.emit('destroy');
  };

  function pressCard(card) {
    card.addClass('ts-direct-search-card--pressed');

    setTimeout(function () {
      card.removeClass('ts-direct-search-card--pressed');
    }, 140);
  }

  function injectCardStyles() {
    if (styles_injected) return;
    styles_injected = true;

    var style = document.createElement('style');
    style.id = 'ts-direct-search-card-styles';
    style.textContent = [
      '.ts-direct-search-card{transition:transform .12s ease, opacity .12s ease; transform-origin:center top;}',
      '.ts-direct-search-card .card__view{overflow:visible;}',
      '.ts-direct-search-card .card__img{border-radius:1em;}',
      '.ts-direct-search-card.focus .card__view::after,',
      '.ts-direct-search-card.hover .card__view::after{content:"";position:absolute;top:-.5em;left:-.5em;right:-.5em;bottom:-.5em;border:.3em solid #fff;border-radius:1.4em;z-index:-1;pointer-events:none;}',
      '.ts-direct-search-card.hover .card__view::after{border-color:rgba(255,255,255,.5);}',
      '.ts-direct-search-card--pressed{transform:scale(.965);opacity:.82;}'
    ].join('\n');

    document.head.appendChild(style);
  }

  function createTorrentCardHtml(data) {
    var title = data.Title || data.title || '';
    var meta = compactTorrentMeta(data);

    var html = $(
      '<div class="selector card card--loaded ts-direct-search-card">' +
        '<div class="card__view ts-direct-search-card__poster">' +
          '<img class="card__img" alt="">' +
        '</div>' +
        '<div class="card__title ts-direct-search-card__title"></div>' +
        '<div class="ts-direct-search-card__meta">' +
          '<span class="ts-direct-search-card__size"></span>' +
          '<span class="ts-direct-search-card__peers"></span>' +
        '</div>' +
      '</div>'
    );

    html.find('.ts-direct-search-card__title').text(title);
    html.find('.ts-direct-search-card__size').text(meta.size);
    html.find('.ts-direct-search-card__peers').text(meta.peers);
    html.find('.card__img').attr('src', data.poster || data.img || buildPoster(title, data.Tracker));
    html.css({
      marginRight: '1em'
    });
    html.find('.ts-direct-search-card__poster').css({
      background: 'rgba(255,255,255,0.08)'
    });
    html.find('.card__img').css({
      width: '100%',
      height: '100%',
      display: 'block',
      objectFit: 'cover',
      borderRadius: '1em'
    });
    html.find('.ts-direct-search-card__title').css({
      marginTop: '0.65em',
      fontSize: '1em',
      lineHeight: '1.25',
      maxHeight: '2.6em',
      overflow: 'hidden'
    });
    html.find('.ts-direct-search-card__meta').css({
      marginTop: '0.75em',
      fontSize: '0.9em',
      opacity: '0.65',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      display: 'flex',
      gap: '0.45em',
      alignItems: 'center'
    });
    html.find('.ts-direct-search-card__size').css({
      flexShrink: '0'
    });
    html.find('.ts-direct-search-card__peers').css({
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    });

    return html;
  }

  function TorrServerFullComponent(object) {
    this.object = object || {};
    this.card = this.object.card || {};
    this.html = null;
  }

  TorrServerFullComponent.prototype.create = function () {
    injectFullStyles();

    var card = this.card;
    var poster = card.poster || card.img || buildPoster(card.Title || card.title || '', card.Tracker || '');
    var title = card.Title || card.title || 'TorrServer';
    var details = torrentDetails(card);

    this.html = $(
      '<div class="ts-full">' +
        '<div class="ts-full__poster"><img alt=""></div>' +
        '<div class="ts-full__body">' +
          '<div class="ts-full__title"></div>' +
          '<div class="ts-full__meta"></div>' +
          '<div class="ts-full__description"></div>' +
          '<div class="ts-full__actions">' +
            '<div class="selector ts-full__button ts-full__button--play"><div class="ts-full__button-icon">▶</div><div>Смотреть</div></div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    this.html.find('.ts-full__poster img').attr('src', poster);
    this.html.find('.ts-full__title').text(title);
    this.html.find('.ts-full__meta').text(details.meta);
    this.html.find('.ts-full__description').text(details.description);
    this.html.find('.ts-full__button--play').on('hover:enter', this.play.bind(this));
    this.html.find('.ts-full__button--play').on('hover:touch', function () {
      $(this).addClass('ts-full__button--pressed');
      setTimeout(function (button) {
        button.removeClass('ts-full__button--pressed');
      }, 140, $(this));
    });

    if (this.activity) {
      this.activity.loader(false);
      this.activity.toggle();
    }
  };

  TorrServerFullComponent.prototype.start = function () {
    var html = this.html;

    Lampa.Controller.add('ts_full', {
      toggle: function () {
        Lampa.Controller.collectionSet(html);
        Lampa.Controller.collectionFocus(false, html);
      },
      up: function () {},
      down: function () {},
      left: function () {
        Lampa.Controller.toggle('menu');
      },
      right: function () {},
      back: function () {
        Lampa.Activity.backward();
      }
    });

    Lampa.Controller.toggle('ts_full');
  };

  TorrServerFullComponent.prototype.play = function () {
    var card = this.card;

    $('.ts-full__button--play').addClass('ts-full__button--pressed');
    setTimeout(function () {
      $('.ts-full__button--play').removeClass('ts-full__button--pressed');
    }, 140);

    Lampa.Torrent.start(card, {
      title: card.Title || card.title || 'Torrent'
    });
  };

  TorrServerFullComponent.prototype.render = function (js) {
    return js ? this.html : $(this.html);
  };

  TorrServerFullComponent.prototype.destroy = function () {
    if (this.html) this.html.remove();
  };

  function torrentDetails(card) {
    var meta = [];
    var description = [];
    var tmdb = card.tmdb || {};
    var date = tmdb.release_date || tmdb.first_air_date || '';
    var year = date ? String(date).slice(0, 4) : '';

    if (year) meta.push(year);
    if (tmdb.vote_average) meta.push(Number(tmdb.vote_average).toFixed(1));
    if (card.size) meta.push(card.size);
    if (!isNaN(card.Seeders)) meta.push('Сиды: ' + card.Seeders);
    if (!isNaN(card.Peers)) meta.push('Пиры: ' + card.Peers);
    if (card.Tracker) meta.push(card.Tracker);
    if (card.CategoryDesc) meta.push(card.CategoryDesc);

    if (tmdb.overview) description.push(tmdb.overview);
    description.push('Источник: TorrServer');
    if (card.CreateDate) description.push('Дата: ' + card.CreateDate);
    else if (card.PublishDate) description.push('Дата: ' + new Date(card.PublishDate).toLocaleDateString());
    if (card.Link) description.push('Ссылка готова к воспроизведению через TorrServer.');

    return {
      meta: meta.join('  •  '),
      description: description.join('\n')
    };
  }

  function compactTorrentMeta(data) {
    var size = data.size || '';
    var peers = [];

    if (!isNaN(data.Seeders)) peers.push('↑ ' + formatNumber(data.Seeders));
    if (!isNaN(data.Peers)) peers.push('↓ ' + formatNumber(data.Peers));

    return {
      size: size,
      peers: peers.join('   ')
    };
  }

  function formatNumber(value) {
    value = parseInt(value, 10);

    if (isNaN(value)) return '0';
    if (value >= 1000) return (value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';

    return value + '';
  }

  function injectFullStyles() {
    if (document.getElementById('ts-full-styles')) return;

    var style = document.createElement('style');
    style.id = 'ts-full-styles';
    style.textContent = [
      '.ts-full{min-height:100%;display:flex;gap:4.5em;align-items:flex-start;padding:5em 4em 4em 8.5em;box-sizing:border-box;color:#fff;}',
      '.ts-full__poster{width:22em;flex-shrink:0;background:#3f3f3f;border-radius:.8em;overflow:hidden;}',
      '.ts-full__poster img{display:block;width:100%;aspect-ratio:2/3;object-fit:cover;}',
      '.ts-full__body{min-width:0;max-width:64em;padding-top:1em;}',
      '.ts-full__title{font-size:3.2em;line-height:1.12;margin-bottom:.45em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;}',
      '.ts-full__meta{font-size:1.35em;color:rgba(255,255,255,.68);line-height:1.45;margin-bottom:1.6em;}',
      '.ts-full__description{font-size:1.25em;line-height:1.55;color:rgba(255,255,255,.72);white-space:pre-line;margin-bottom:2.3em;}',
      '.ts-full__actions{display:flex;gap:1em;align-items:center;}',
      '.ts-full__button{height:5.4em;min-width:10.5em;padding:0 1.6em;border-radius:.45em;background:rgba(0,0,0,.42);display:flex;gap:.9em;align-items:center;justify-content:center;font-size:1.05em;transition:transform .12s ease,background .12s ease,opacity .12s ease;}',
      '.ts-full__button.focus,.ts-full__button.hover{background:#fff;color:#111;}',
      '.ts-full__button--pressed{transform:scale(.965);opacity:.82;}',
      '.ts-full__button-icon{font-size:1.6em;line-height:1;}'
    ].join('\n');

    document.head.appendChild(style);
  }

  if (typeof window !== 'undefined') boot();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildUrl: buildUrl,
      buildPoster: buildPoster,
      cleanPosterQuery: cleanPosterQuery,
      formatSearchResults: formatSearchResults,
      formatNumber: formatNumber,
      normalizeSizeLabel: normalizeSizeLabel,
      normalizeResults: normalizeResults
    };
  }
})();
