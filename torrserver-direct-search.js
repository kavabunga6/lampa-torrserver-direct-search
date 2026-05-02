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

          var results = items.slice(0, 40);
          results.forEach(function (item) {
            item.Title = shortText(item.Title, 110);
            item.title = item.Title;
            item.name = item.Title;
            item.params = {
              createInstance: function (data) {
                return new TorrentResultCard(data);
              }
            };
          });

          done(results.length ? [{
            title: 'TorrServer',
            results: results,
            total: items.length,
            total_pages: Math.ceil(items.length / 40)
          }] : []);
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
      onMore: function (params, close) {
        close();
        Lampa.Search.open({
          sources: [source],
          input: params.query || ''
        });
      },
      onSelect: function (params, close) {
        close();
        Lampa.Torrent.start(params.element, {
          title: params.element.Title || params.element.title || params.query || 'Torrent'
        });
      },
      params: {
        lazy: true,
        nofound: 'search_nofound',
        start_typing: 'search_start_typing'
      }
    };
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
      done(normalized);
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
    if (typeof size === 'number') return lampaUtils().bytesToSize(size);
    return size || '';
  }

  function shortText(text, len) {
    text = text || '';
    if (lampaUtils().shortText) return lampaUtils().shortText(text, len);
    return text.length > len ? text.slice(0, len - 3) + '...' : text;
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

    this.html = createTorrentCardHtml(data);
    this.html.attr('data-hash', data.hash || '');
    this.html.card_data = data;
    this.html[0].card_data = data;
    this.html.on('visible', this.emit.bind(this, 'visible'));
    this.html.on('hover:focus', this.emit.bind(this, 'focus', this.html, data));
    this.html.on('hover:touch', this.emit.bind(this, 'touch', this.html, data));
    this.html.on('hover:hover', this.emit.bind(this, 'hover', this.html, data));
    this.html.on('hover:enter', this.emit.bind(this, 'enter', this.html, data));
    this.html.on('hover:long', this.emit.bind(this, 'long', this.html, data));

    this.emit('create');
  };

  TorrentResultCard.prototype.render = function (js) {
    return js ? this.html : $(this.html);
  };

  TorrentResultCard.prototype.destroy = function () {
    if (this.html) this.html.remove();
    this.emit('destroy');
  };

  function createTorrentCardHtml(data) {
    var title = data.Title || data.title || '';
    var meta = [];

    if (data.size) meta.push(data.size);
    if (!isNaN(data.Seeders)) meta.push('S: ' + data.Seeders);
    if (!isNaN(data.Peers)) meta.push('P: ' + data.Peers);
    if (data.Tracker) meta.push(data.Tracker);

    var html = $(
      '<div class="selector card-parser ts-direct-search-card">' +
        '<div class="ts-direct-search-card__title"></div>' +
        '<div class="ts-direct-search-card__meta"></div>' +
      '</div>'
    );

    html.find('.ts-direct-search-card__title').text(title);
    html.find('.ts-direct-search-card__meta').text(meta.join(' / '));
    html.css({
      width: '22em',
      minHeight: '7.2em',
      marginRight: '1em',
      padding: '1em',
      borderRadius: '0.45em',
      background: 'rgba(255,255,255,0.08)',
      boxSizing: 'border-box',
      overflow: 'hidden'
    });
    html.find('.ts-direct-search-card__title').css({
      fontSize: '1.15em',
      lineHeight: '1.25',
      maxHeight: '3.8em',
      overflow: 'hidden'
    });
    html.find('.ts-direct-search-card__meta').css({
      marginTop: '0.75em',
      fontSize: '0.9em',
      opacity: '0.65',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    });

    return html;
  }

  if (typeof window !== 'undefined') boot();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildUrl: buildUrl,
      normalizeResults: normalizeResults
    };
  }
})();
