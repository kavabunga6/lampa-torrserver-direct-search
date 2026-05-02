const assert = require('node:assert/strict');

const baseUrl = process.env.TORRSERVER_URL || 'http://torrserver.home';
const query = process.env.TORRSERVER_QUERY || 'matrix';
const url = new URL('/torznab/search/', baseUrl.replace(/\/+$/, '') + '/');

url.searchParams.set('query', query);

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 30000);

fetch(url, { signal: controller.signal })
  .then(async (response) => {
    const text = await response.text();

    assert.equal(response.status, 200, `Expected 200 from ${url}, got ${response.status}: ${text}`);

    const json = JSON.parse(text);

    assert.ok(Array.isArray(json), 'Expected Torznab search response to be an array');
    assert.ok(json.length > 0, `Expected at least one result for "${query}"`);
    assert.ok(json.some((item) => item.Title || item.title), 'Expected at least one result title');
    assert.ok(json.some((item) => item.Link || item.link || item.Magnet || item.magnet), 'Expected at least one playable link');

    console.log(`OK: ${json.length} result(s) from ${url}`);
  })
  .finally(() => clearTimeout(timer));
