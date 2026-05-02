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
  assert.equal(results[0].poster, './img/img_broken.svg');
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

test('fallback poster uses Lampa built-in broken image', () => {
  const poster = plugin.buildPoster('Very Long Movie Title That Should Wrap Nicely Inside The Poster 1080p WEB-DL', 'TorrServer');

  assert.equal(poster, './img/img_broken.svg');
});

test('localizes TorrServer binary size labels', () => {
  assert.equal(plugin.normalizeSizeLabel('568.3 MCiB'), '568 МБ');
  assert.equal(plugin.normalizeSizeLabel('4.5 GCiB'), '4,5 ГБ');
  assert.equal(plugin.normalizeSizeLabel('900 KCiB'), '900 КБ');
});

test('builds a Lampa full movie object that keeps the playable torrent card', () => {
  const source = {
    Title: 'The Matrix 1999 1080p',
    Link: 'http://torrserver.home/dl/matrix.torrent',
    size: '12,4 ГБ',
    Seeders: 12,
    Peers: 3,
    CategoryDesc: 'Movies',
    tmdb: {
      title: 'The Matrix',
      id: 603,
      original_title: 'The Matrix',
      release_date: '1999-03-31',
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      overview: 'A hacker discovers the truth.',
      production_countries: [{ iso_3166_1: 'US', name: 'United States of America' }]
    }
  };

  const movie = plugin.buildFullMovie(source);

  assert.equal(movie.source, 'torrserver');
  assert.equal(movie.method, 'movie');
  assert.equal(movie.id, 603);
  assert.equal(movie.title, 'The Matrix 1999 1080p');
  assert.equal(movie.release_date, '1999-03-31');
  assert.equal(movie.poster_path, '/poster.jpg');
  assert.equal(movie.background_image, '/backdrop.jpg');
  assert.deepEqual(movie.origin_country, ['United States of America']);
  assert.deepEqual(movie.countries, ['United States of America']);
  assert.deepEqual(movie.production_companies, []);
  assert.equal(movie.ts_reactions_enabled, true);
  assert.equal(movie.ts_torrent_card, source);
  assert.equal(movie.card, source);
});

test('disables reactions for torrent-only full cards without a real TMDB id', () => {
  const movie = plugin.buildFullMovie({
    Title: 'Torrent only result',
    Link: 'http://torrserver.home/dl/torrent-only.torrent',
    hash: 'torrent-hash'
  });

  assert.equal(movie.id, 'torrent-hash');
  assert.equal(movie.ts_reactions_enabled, false);
});

test('resolves the playable torrent card from Lampa full route params', () => {
  const source = {
    Title: 'The Matrix',
    Link: 'http://torrserver.home/dl/matrix.torrent'
  };
  const movie = plugin.buildFullMovie(source);

  assert.equal(plugin.fullRouteCard(movie), source);
  assert.equal(plugin.fullRouteCard({ card: source }), source);
  assert.equal(plugin.fullRouteCard({ movie }), source);
  assert.equal(plugin.fullRouteCard(source), source);
  assert.equal(plugin.fullRouteCard({ source: 'torrserver' }), null);
});

test('builds a Torrent.start compatible item from a full route card', () => {
  const source = {
    Title: 'The Matrix',
    Link: 'http://torrserver.home/dl/matrix.torrent',
    poster: 'http://image.tmdb.org/poster.jpg'
  };
  const movie = plugin.buildFullMovie(source);
  const playable = plugin.playableTorrentItem(movie);

  assert.equal(playable.Title, 'The Matrix');
  assert.equal(playable.title, 'The Matrix');
  assert.equal(playable.Link, 'http://torrserver.home/dl/matrix.torrent');
  assert.equal(playable.MagnetUri, 'http://torrserver.home/dl/matrix.torrent');
  assert.equal(playable.poster, 'http://image.tmdb.org/poster.jpg');
});

test('does not start torrents without a playable link', () => {
  assert.equal(plugin.playableTorrentItem({ title: 'No link' }), null);
});
