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
  assert.equal(results[0].size, '12,4 ГБ');
  assert.equal(results[0].CategoryDesc, 'Movies');
  assert.match(results[0].poster, /^data:image\/svg\+xml;charset=UTF-8,/);
  assert.equal(results[0].img, results[0].poster);
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

test('normalizes lowercase TorrServer fields', () => {
  const results = plugin.normalizeResults([
    {
      title: 'Matrix Reloaded',
      size: '8.0 GCiB',
      createDate: '2024-01-02T03:04:05+03:00',
      tracker: 'Prowlarr',
      link: 'http://torrserver.home/dl/matrix-reloaded.torrent',
      seed: 5,
      peer: 2,
      categories: 'Movies'
    }
  ]);

  assert.equal(results.length, 1);
  assert.equal(results[0].Title, 'Matrix Reloaded');
  assert.equal(results[0].MagnetUri, 'http://torrserver.home/dl/matrix-reloaded.torrent');
  assert.equal(results[0].Tracker, 'Prowlarr');
  assert.equal(results[0].size, '8 ГБ');
  assert.equal(results[0].Seeders, 5);
  assert.equal(results[0].Peers, 2);
});

test('formats TorrServer search result as a single non-paginated group', () => {
  const items = Array.from({ length: 45 }, (_, index) => ({
    Title: `Matrix result ${index + 1}`,
    Link: `http://torrserver.home/dl/${index + 1}.torrent`
  }));
  const groups = plugin.formatSearchResults(items);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].results.length, 45);
  assert.equal(groups[0].total, 45);
  assert.equal(groups[0].total_pages, 1);
  assert.equal(groups[0].page, 1);
  assert.equal(groups[0].params.items.view, 45);
});

test('cleans torrent release names for optional poster lookup', () => {
  assert.equal(plugin.cleanPosterQuery('The.Matrix.1999.1080p.BluRay.x265-GROUP'), 'The Matrix 1999');
  assert.equal(plugin.cleanPosterQuery('Matrix Reloaded [HDRip] 720p.mkv'), 'Matrix Reloaded');
});

test('fallback poster uses a neutral no-image SVG', () => {
  const poster = plugin.buildPoster('Very Long Movie Title That Should Wrap Nicely Inside The Poster 1080p WEB-DL', 'TorrServer');
  const svg = decodeURIComponent(poster.replace('data:image/svg+xml;charset=UTF-8,', ''));

  assert.match(svg, /fill="#3f3f3f"/);
  assert.match(svg, /<rect x="101" y="176" width="98" height="98"/);
  assert.doesNotMatch(svg, /Very Long Movie Title That Should Wrap Nicely Inside The Poster 1080p WEB-DL/);
});

test('formats torrent peer numbers compactly', () => {
  assert.equal(plugin.formatNumber(235), '235');
  assert.equal(plugin.formatNumber(1200), '1.2k');
  assert.equal(plugin.formatNumber(12500), '13k');
});

test('localizes TorrServer binary size labels', () => {
  assert.equal(plugin.normalizeSizeLabel('568.3 MCiB'), '568 МБ');
  assert.equal(plugin.normalizeSizeLabel('4.5 GCiB'), '4,5 ГБ');
  assert.equal(plugin.normalizeSizeLabel('900 KCiB'), '900 КБ');
});
