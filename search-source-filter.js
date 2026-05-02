(function () {
  'use strict';

  var PLUGIN_ID = 'search_source_filter';
  var PLUGIN_NAME = 'Search Source Filter';
  var patched = false;
  var original_available_discovery = null;
  var original_add_source = null;
  var original_open = null;

  var icon =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '</svg>';

  function boot() {
    if (!window.Lampa) {
      setTimeout(boot, 300);
      return;
    }

    if (window[PLUGIN_ID]) return;
    window[PLUGIN_ID] = true;

    addSettings();
    patchSearch();

    console.log(PLUGIN_NAME + ' loaded');
  }

  function addSettings() {
    Lampa.SettingsApi.addComponent({
      component: PLUGIN_ID,
      name: 'Источники поиска',
      icon: icon
    });

    Lampa.SettingsApi.addParam({
      component: PLUGIN_ID,
      param: {
        name: PLUGIN_ID + '_disable_cub',
        type: 'trigger',
        default: true
      },
      field: {
        name: 'Отключить CUB',
        description: 'Убирает CUB из поиска и не запускает запросы к нему.'
      }
    });

    Lampa.SettingsApi.addParam({
      component: PLUGIN_ID,
      param: {
        name: PLUGIN_ID + '_disable_ai',
        type: 'trigger',
        default: true
      },
      field: {
        name: 'Отключить AI-ассистент',
        description: 'Блокирует источник AI-ассистента при добавлении в поиск.'
      }
    });

    Lampa.SettingsApi.addParam({
      component: PLUGIN_ID,
      param: {
        name: PLUGIN_ID + '_disable_tmdb',
        type: 'trigger',
        default: false
      },
      field: {
        name: 'Отключить TMDB',
        description: 'Опционально убирает TMDB из общего поиска.'
      }
    });

    Lampa.SettingsApi.addParam({
      component: PLUGIN_ID,
      param: {
        name: PLUGIN_ID + '_custom',
        type: 'input',
        values: '',
        default: ''
      },
      field: {
        name: 'Дополнительные названия',
        description: 'Через запятую: например, Parser, Online, MySource.'
      }
    });
  }

  function patchSearch() {
    if (patched) return;
    if (!Lampa.Api || !Lampa.Search) {
      setTimeout(patchSearch, 300);
      return;
    }

    patched = true;

    if (Lampa.Api.availableDiscovery) {
      original_available_discovery = Lampa.Api.availableDiscovery;
      Lampa.Api.availableDiscovery = function () {
        return filterSources(original_available_discovery.apply(this, arguments), getBlockedRules());
      };
    }

    if (Lampa.Search.addSource) {
      original_add_source = Lampa.Search.addSource;
      Lampa.Search.addSource = function (source) {
        if (isBlockedSource(source, getBlockedRules())) {
          log('blocked addSource', sourceTitle(source));
          return source;
        }

        return original_add_source.apply(this, arguments);
      };
    }

    if (Lampa.Search.open) {
      original_open = Lampa.Search.open;
      Lampa.Search.open = function (params) {
        return original_open.call(this, filterOpenParams(params, getBlockedRules()));
      };
    }
  }

  function filterOpenParams(params, rules) {
    if (!params) return params;

    var filtered = {};

    for (var key in params) {
      filtered[key] = params[key];
    }

    if (Array.isArray(filtered.sources)) {
      filtered.sources = filterSources(filtered.sources, rules);
    }

    if (Array.isArray(filtered.additional)) {
      filtered.additional = filterSources(filtered.additional, rules);
    }

    return filtered;
  }

  function filterSources(sources, rules) {
    if (!Array.isArray(sources)) return sources;

    return sources.filter(function (source) {
      return !isBlockedSource(source, rules);
    });
  }

  function isBlockedSource(source, rules) {
    var title = sourceTitle(source);
    if (!title) return false;

    return rules.some(function (rule) {
      return rule && title.indexOf(rule) !== -1;
    });
  }

  function sourceTitle(source) {
    var values = [];

    if (typeof source === 'string') values.push(source);
    if (source) {
      values.push(source.title);
      values.push(source.name);
      values.push(source.source);
      values.push(source.id);
      values.push(source.component);
    }

    return values.filter(Boolean).join(' ').toLowerCase();
  }

  function getBlockedRules() {
    var rules = [];

    if (storageField(PLUGIN_ID + '_disable_cub', true)) {
      rules = rules.concat(['cub', 'куб']);
    }

    if (storageField(PLUGIN_ID + '_disable_ai', true)) {
      rules = rules.concat(['ai-assistant', 'ai assistant', 'ai-ассистент', 'ai ассистент', 'ассистент']);
    }

    if (storageField(PLUGIN_ID + '_disable_tmdb', false)) {
      rules = rules.concat(['tmdb', 'тмдб']);
    }

    var custom = storageField(PLUGIN_ID + '_custom', '');
    if (custom) {
      custom.split(',').forEach(function (rule) {
        rule = rule.trim().toLowerCase();
        if (rule) rules.push(rule);
      });
    }

    return rules;
  }

  function storageField(name, fallback) {
    if (typeof window === 'undefined' || !window.Lampa || !Lampa.Storage) return fallback;

    var value = Lampa.Storage.field(name);
    return value === undefined || value === null ? fallback : value;
  }

  function log(message, data) {
    if (typeof console !== 'undefined' && console.log) {
      console.log(PLUGIN_NAME + ': ' + message, data || '');
    }
  }

  if (typeof window !== 'undefined') boot();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      filterOpenParams: filterOpenParams,
      filterSources: filterSources,
      isBlockedSource: isBlockedSource
    };
  }
})();
