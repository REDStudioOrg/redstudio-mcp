import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RedStudioClient, ApiError } from '../src/client.js';
import { fakeFetch, lastCall, parseJsonBody } from './helpers.js';

const KEY = 'abc123';

function makeClient(fetch, extra = {}) {
  return new RedStudioClient({ apiKey: KEY, baseUrl: 'https://cms.test/api/v1/external', fetchImpl: fetch, ...extra });
}

test('requires an api key', () => {
  assert.throws(() => new RedStudioClient({ apiKey: '' }), /API key/);
});

test('defaults base url to production and strips trailing slash', () => {
  const c = new RedStudioClient({ apiKey: KEY, fetchImpl: fakeFetch() });
  assert.equal(c.baseUrl, 'https://redstudio.ie/api/v1/external');
  const c2 = new RedStudioClient({ apiKey: KEY, baseUrl: 'https://x.test/api/v1/external/', fetchImpl: fakeFetch() });
  assert.equal(c2.baseUrl, 'https://x.test/api/v1/external');
});

test('GET sends bearer auth and accept header', async () => {
  const fetch = fakeFetch([{ status: 200, body: { data: [] } }]);
  const c = makeClient(fetch);
  const out = await c.pages.list();
  assert.deepEqual(out, { data: [] });
  const call = lastCall(fetch);
  assert.equal(call.url, 'https://cms.test/api/v1/external/builder/pages');
  assert.equal(call.init.method, 'GET');
  assert.equal(call.init.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(call.init.headers.Accept, 'application/json');
});

test('POST json body with content-type', async () => {
  const fetch = fakeFetch([{ status: 201, body: { id: 5, permalink: 'about' } }]);
  const c = makeClient(fetch);
  const out = await c.pages.create({ name: 'About', permalink: 'about', html: '<p>x</p>' });
  assert.equal(out.id, 5);
  const call = lastCall(fetch);
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers['Content-Type'], 'application/json');
  assert.deepEqual(parseJsonBody(call), { name: 'About', permalink: 'about', html: '<p>x</p>' });
});

test('resource helpers build the right paths', async () => {
  const fetch = fakeFetch(Array(30).fill({ status: 200, body: {} }));
  const c = makeClient(fetch);
  const expectations = [
    [() => c.site.get(), 'GET', '/site'],
    [() => c.site.update({ head_js: 'x' }), 'PUT', '/site'],
    [() => c.pages.get(7), 'GET', '/builder/pages/7'],
    [() => c.pages.getByPermalink('our/approach'), 'GET', '/builder/pages/permalink/our/approach'],
    [() => c.pages.update(7, { html: '' }), 'PUT', '/builder/pages/7'],
    [() => c.pages.remove(7), 'DELETE', '/builder/pages/7'],
    [() => c.components.list(), 'GET', '/builder/components'],
    [() => c.components.getByPermalink('navigation'), 'GET', '/builder/components/permalink/navigation'],
    [() => c.components.create({ name: 'Nav' }), 'POST', '/builder/components'],
    [() => c.redirects.list(), 'GET', '/builder/redirects'],
    [() => c.redirects.create({ from_permalink: 'a', to_permalink: 'b' }), 'POST', '/builder/redirects'],
    [() => c.redirects.remove(3), 'DELETE', '/builder/redirects/3'],
    [() => c.media.list(), 'GET', '/media'],
    [() => c.media.remove(9), 'DELETE', '/media/9'],
    [() => c.bookings.get(), 'GET', '/bookings'],
    [() => c.bookings.update({ max_advance_days: 30 }), 'PUT', '/bookings'],
    [() => c.bookings.createEvent({ name: 'x' }), 'POST', '/bookings/events'],
    [() => c.bookings.updateEvent(3, { name: 'y' }), 'PUT', '/bookings/events/3'],
    [() => c.bookings.deleteEvent(3), 'DELETE', '/bookings/events/3'],
    [() => c.posts.list(2), 'GET', '/posts?page=2'],
    [() => c.posts.get(4), 'GET', '/posts/4'],
    [() => c.posts.create({ title: 't', body: 'b' }), 'POST', '/posts'],
    [() => c.posts.update(4, { title: 't' }), 'PUT', '/posts/4'],
  ];
  for (const [run, method, path] of expectations) {
    await run();
    const call = lastCall(fetch);
    assert.equal(call.init.method, method, `${method} ${path}`);
    assert.equal(call.url, 'https://cms.test/api/v1/external' + path);
  }
});

test('non-2xx responses throw ApiError with status and parsed body', async () => {
  const fetch = fakeFetch([{ status: 422, body: { message: 'Validation failed', errors: { permalink: ['taken'] } } }]);
  const c = makeClient(fetch);
  await assert.rejects(() => c.pages.create({ name: 'x' }), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 422);
    assert.deepEqual(err.body.errors, { permalink: ['taken'] });
    assert.match(err.message, /422/);
    return true;
  });
});

test('non-json error bodies are kept as text', async () => {
  const fetch = fakeFetch([{ status: 502, body: '<html>Bad gateway</html>', contentType: 'text/html' }]);
  const c = makeClient(fetch);
  await assert.rejects(() => c.site.get(), (err) => err.status === 502 && /Bad gateway/.test(err.body));
});

test('media upload from a local path sends multipart with the file and optional name', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rsmcp-'));
  const file = join(dir, 'hero.png');
  writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const fetch = fakeFetch([{ status: 201, body: { id: 1, url: 'https://cdn/hero.png' } }]);
  const c = makeClient(fetch);
  const out = await c.media.upload({ path: file, name: 'Hero' });
  assert.equal(out.url, 'https://cdn/hero.png');

  const call = lastCall(fetch);
  assert.equal(call.url, 'https://cms.test/api/v1/external/media');
  assert.equal(call.init.method, 'POST');
  assert.ok(call.init.body instanceof FormData, 'body is FormData');
  assert.equal(call.init.headers['Content-Type'], undefined, 'lets fetch set the multipart boundary');
  const sent = call.init.body.get('file');
  assert.equal(sent.name, 'hero.png');
  assert.equal(sent.size, 4);
  assert.equal(call.init.body.get('name'), 'Hero');
});

test('media upload from a url downloads then uploads', async () => {
  const fetch = fakeFetch([
    { status: 200, body: 'PNGDATA', contentType: 'image/png' },
    { status: 201, body: { id: 2, url: 'https://cdn/remote.png' } },
  ]);
  const c = makeClient(fetch);
  const out = await c.media.upload({ url: 'https://example.com/assets/remote.png' });
  assert.equal(out.id, 2);
  assert.equal(fetch.calls[0].url, 'https://example.com/assets/remote.png');
  assert.equal(fetch.calls[0].init.headers?.Authorization, undefined, 'never leaks the api key to third parties');
  const sent = fetch.calls[1].init.body.get('file');
  assert.equal(sent.name, 'remote.png');
});

test('media upload requires path or url', async () => {
  const c = makeClient(fakeFetch());
  await assert.rejects(() => c.media.upload({}), /path or url/);
});

test('429 responses are retried after the server-provided delay', async () => {
  const fetch = fakeFetch([
    { status: 429, body: { message: 'Too Many Attempts.' } , contentType: 'application/json' },
    { status: 200, body: { data: ['ok'] } },
  ]);
  const waits = [];
  const c = new RedStudioClient({ apiKey: KEY, baseUrl: 'https://cms.test/api/v1/external', fetchImpl: fetch, sleep: async (ms) => { waits.push(ms); } });
  const out = await c.pages.list();
  assert.deepEqual(out, { data: ['ok'] });
  assert.equal(fetch.calls.length, 2);
  assert.ok(waits[0] >= 1000, 'waits before retrying');
});

test('429 gives up after the retry budget and surfaces the error', async () => {
  const fetch = fakeFetch(Array(10).fill({ status: 429, body: { message: 'Too Many Attempts.' } }));
  const c = new RedStudioClient({ apiKey: KEY, baseUrl: 'https://cms.test/api/v1/external', fetchImpl: fetch, sleep: async () => {}, maxRetries: 3 });
  await assert.rejects(() => c.pages.list(), (err) => err instanceof ApiError && err.status === 429);
  assert.equal(fetch.calls.length, 4, 'initial attempt plus three retries');
});

test('a 429 with a long retry-after fails fast with a clear message instead of sleeping', async () => {
  const fetch = fakeFetch([{ status: 429, body: { message: 'Rate limit exceeded.', retry_after: 2119 } }]);
  const waits = [];
  const c = new RedStudioClient({ apiKey: KEY, baseUrl: 'https://cms.test/api/v1/external', fetchImpl: fetch, sleep: async (ms) => { waits.push(ms); } });
  await assert.rejects(() => c.pages.list(), (err) => err instanceof ApiError && err.status === 429 && /36 minutes/.test(err.message));
  assert.deepEqual(waits, [], 'does not sleep for half an hour inside one call');
  assert.equal(fetch.calls.length, 1);
});
