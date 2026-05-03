const test = require('node:test');
const assert = require('node:assert/strict');

const filter = require('../search-source-filter');

const namedRules = {
  disabled_keys: [],
  disabled_names: ['cub', 'ai assistant', 'ассистент']
};

test('filters sources by explicit names only', () => {
  const sources = [
    { title: 'TMDB' },
    { title: 'CUB' },
    { title: 'AI-ассистент' },
    { title: 'TorrServer' }
  ];

  assert.deepEqual(filter.filterSources(sources, namedRules).map((source) => source.title), [
    'TMDB',
    'TorrServer'
  ]);
});

test('filters Search.open sources and additional arrays', () => {
  const params = filter.filterOpenParams({
    input: 'matrix',
    sources: [{ title: 'CUB' }, { title: 'TorrServer' }],
    additional: [{ title: 'AI Assistant' }, { title: 'Custom' }]
  }, namedRules);

  assert.deepEqual(params.sources.map((source) => source.title), ['TorrServer']);
  assert.deepEqual(params.additional.map((source) => source.title), ['Custom']);
});

test('keeps unknown params untouched', () => {
  const params = { input: 'matrix', foo: { bar: true } };
  const filtered = filter.filterOpenParams(params, namedRules);

  assert.equal(filtered.input, 'matrix');
  assert.equal(filtered.foo, params.foo);
});

test('empty rules keep every source enabled', () => {
  const sources = [
    { title: 'TMDB' },
    { title: 'CUB' },
    { title: 'AI-ассистент' }
  ];

  assert.deepEqual(filter.filterSources(sources, {
    disabled_keys: [],
    disabled_names: []
  }).map((source) => source.title), [
    'TMDB',
    'CUB',
    'AI-ассистент'
  ]);
});

test('filters any source by stable key', () => {
  const sources = [
    { title: 'Custom Parser' },
    { title: 'TorrServer' }
  ];
  const customKey = filter.sourceKey(sources[0]);
  const filtered = filter.filterSources(sources, {
    disabled_keys: [customKey],
    disabled_names: []
  });

  assert.deepEqual(filtered.map((source) => source.title), ['TorrServer']);
});

test('sorts source settings alphabetically by title', () => {
  const sources = [
    { title: 'TorrServer' },
    { title: 'AI-ассистент' },
    { title: 'CUB' },
    { title: 'TMDB' }
  ].sort(filter.compareSourceItems);

  assert.deepEqual(sources.map((source) => source.title), [
    'AI-ассистент',
    'CUB',
    'TMDB',
    'TorrServer'
  ]);
});

test('adds restart warning for AI source settings only', () => {
  assert.match(
    filter.sourceSettingDescription({ title: 'AI-ассистент' }),
    /перезагрузку Lampa/
  );
  assert.doesNotMatch(
    filter.sourceSettingDescription({ title: 'TMDB' }),
    /перезагрузку Lampa/
  );
});

test('still supports legacy array rules', () => {
  const sources = [
    { title: 'CUB' },
    { title: 'TMDB' }
  ];

  assert.deepEqual(filter.filterSources(sources, ['cub']).map((source) => source.title), ['TMDB']);
});
