const test = require('node:test');
const assert = require('node:assert/strict');

const plugin = require('../torrserver-direct-search');

test('normalizes TorrServer Torznab items with download links', () => {
  const results = plugin.normalizeResults([
    {
      Title: 'The Matrix 1999 1080p',
      Size: '12.4 GCiB',
      CreateDate: '2024-01-02T03:04:05+03:00',
      Tracker: 'Jackett',
      Link: 'http://torrserver.home/dl/matrix.torrent',
      Seed: 12,
      Peer: 3,
      Categories: 'Movies'
    }
  ]);

  assert.equal(results.length, 1);
  assert.equal(results[0].Title, 'The Matrix 1999 1080p');
  assert.equal(results[0].MagnetUri, 'http://torrserver.home/dl/matrix.torrent');
  assert.equal(results[0].Link, 'http://torrserver.home/dl/matrix.torrent');
  assert.equal(results[0].Seeders, 12);
  assert.equal(results[0].Peers, 3);
  assert.equal(results[0].CategoryDesc, 'Movies');
});

test('drops items without a title or playable link', () => {
  const results = plugin.normalizeResults([
    { Title: 'No Link' },
    { Link: 'http://torrserver.home/dl/no-title.torrent' }
  ]);

  assert.deepEqual(results, []);
});

test('builds TorrServer URLs without double slashes', () => {
  const url = plugin.buildUrl('http://torrserver.home/', '/torznab/search/', [
    { name: 'query', value: 'matrix reloaded' }
  ]);

  assert.equal(url, 'http://torrserver.home/torznab/search/?query=matrix%20reloaded');
});
