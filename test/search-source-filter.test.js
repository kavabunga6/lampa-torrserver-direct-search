const test = require('node:test');
const assert = require('node:assert/strict');

const filter = require('../search-source-filter');

const rules = ['cub', 'ai assistant', 'ассистент'];

test('filters CUB and AI assistant sources', () => {
  const sources = [
    { title: 'TMDB' },
    { title: 'CUB' },
    { title: 'AI-ассистент' },
    { title: 'TorrServer' }
  ];

  assert.deepEqual(filter.filterSources(sources, rules).map((source) => source.title), [
    'TMDB',
    'TorrServer'
  ]);
});

test('filters Search.open sources and additional arrays', () => {
  const params = filter.filterOpenParams({
    input: 'matrix',
    sources: [{ title: 'CUB' }, { title: 'TorrServer' }],
    additional: [{ title: 'AI Assistant' }, { title: 'Custom' }]
  }, rules);

  assert.deepEqual(params.sources.map((source) => source.title), ['TorrServer']);
  assert.deepEqual(params.additional.map((source) => source.title), ['Custom']);
});

test('keeps unknown params untouched', () => {
  const params = { input: 'matrix', foo: { bar: true } };
  const filtered = filter.filterOpenParams(params, rules);

  assert.equal(filtered.input, 'matrix');
  assert.equal(filtered.foo, params.foo);
});

test('empty rules keep every source enabled', () => {
  const sources = [
    { title: 'TMDB' },
    { title: 'CUB' },
    { title: 'AI-ассистент' }
  ];

  assert.deepEqual(filter.filterSources(sources, []).map((source) => source.title), [
    'TMDB',
    'CUB',
    'AI-ассистент'
  ]);
});
