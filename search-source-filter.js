(function () {
  'use strict';

  var PLUGIN_ID = 'search_source_filter';
  var PLUGIN_NAME = 'Search Source Filter';
  var patched = false;
  var original_available_discovery = null;
  var original_add_source = null;
  var original_open = null;
  var discovered = {};
  var dynamic_settings = {};

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
        name: PLUGIN_ID + '_enabled',
        type: 'trigger',
        default: true
      },
      field: {
        name: 'Фильтр включен',
        description: 'Если выключить, все источники поиска снова будут доступны.'
      }
    });

    refreshDynamicSettings();

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
        var sources = original_available_discovery.apply(this, arguments);
        rememberSources(sources);
        return filterSources(sources, getBlockedRules());
      };
    }

    if (Lampa.Search.addSource) {
      original_add_source = Lampa.Search.addSource;
      Lampa.Search.addSource = function (source) {
        rememberSources([source]);

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
        rememberSources((params && params.sources || []).concat(params && params.additional || []));
        return original_open.call(this, filterOpenParams(params, getBlockedRules()));
      };
    }
  }

  function refreshDynamicSettings() {
    var saved = storageField(PLUGIN_ID + '_known_sources', {});
    var list = [];

    Object.keys(saved || {}).forEach(function (key) {
      if (saved[key] && saved[key].title) {
        discovered[key] = saved[key];
      }
    });

    list = Object.keys(discovered).map(function (key) {
      return discovered[key];
    }).sort(function (a, b) {
      return a.title.localeCompare(b.title);
    });

    list.forEach(function (item) {
      if (dynamic_settings[item.key]) return;

      dynamic_settings[item.key] = true;

      Lampa.SettingsApi.addParam({
        component: PLUGIN_ID,
        param: {
          name: PLUGIN_ID + '_source_' + item.key,
          type: 'trigger',
          default: true
        },
        field: {
          name: 'Показывать ' + item.title,
          description: 'Источник будет исключен из поиска, если выключить этот пункт.'
        }
      });
    });
  }

  function isBlockedSource(source, rules) {
    var title = sourceTitle(source);
    var key = sourceKey(source);

    if (rules.disabled_keys.indexOf(key) !== -1) return true;
    if (!title) return false;

    return rules.disabled_names.some(function (rule) {
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

  function sourceKey(source) {
    var title = sourceTitle(source) || 'unknown';
    return title
      .replace(/[^a-zа-яё0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'unknown';
  }

  function sourceDisplayTitle(source) {
    if (!source) return '';

    return source.title || source.name || source.source || source.id || source.component || String(source);
  }

  function rememberSources(sources) {
    if (!Array.isArray(sources)) return;

    var changed = false;

    sources.forEach(function (source) {
      var title = sourceDisplayTitle(source);
      var key = sourceKey(source);

      if (!title || discovered[key]) return;

      discovered[key] = {
        key: key,
        title: title
      };
      changed = true;
    });

    if (changed) {
      if (typeof window !== 'undefined' && window.Lampa && Lampa.Storage) {
        Lampa.Storage.set(PLUGIN_ID + '_known_sources', discovered);
      }

      refreshDynamicSettings();
    }
  }

  function getRules() {
    if (!storageField(PLUGIN_ID + '_enabled', true)) return {
      disabled_keys: [],
      disabled_names: []
    };

    var rules = {
      disabled_keys: [],
      disabled_names: []
    };

    Object.keys(discovered).forEach(function (key) {
      if (!storageField(PLUGIN_ID + '_source_' + key, true)) {
        rules.disabled_keys.push(key);
      }
    });

    var saved = storageField(PLUGIN_ID + '_known_sources', {});
    Object.keys(saved || {}).forEach(function (key) {
      if (!storageField(PLUGIN_ID + '_source_' + key, true)) {
        rules.disabled_keys.push(key);
      }
    });

    rules.disabled_keys = unique(rules.disabled_keys);
    rules.disabled_names = unique(rules.disabled_names);

    return rules;
  }

  function normalizeRules(rules) {
    if (Array.isArray(rules)) {
      return {
        disabled_keys: [],
        disabled_names: rules
      };
    }

    return rules || {
      disabled_keys: [],
      disabled_names: []
    };
  }

  function unique(list) {
    var seen = {};

    return list.filter(function (item) {
      if (seen[item]) return false;

      seen[item] = true;
      return true;
    });
  }

  function getBlockedRules() {
    var rules = getRules();
    var custom = storageField(PLUGIN_ID + '_custom', '');

    if (!custom) return rules;

    custom.split(',').forEach(function (rule) {
      rule = rule.trim().toLowerCase();
      if (rule) rules.disabled_names.push(rule);
    });

    rules.disabled_names = unique(rules.disabled_names);

    return rules;
  }

  function filterSources(sources, rules) {
    rules = normalizeRules(rules);

    if (!Array.isArray(sources)) return sources;

    return sources.filter(function (source) {
      return !isBlockedSource(source, rules);
    });
  }

  function filterOpenParams(params, rules) {
    rules = normalizeRules(rules);

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
      isBlockedSource: isBlockedSource,
      sourceKey: sourceKey
    };
  }
})();
