import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { buildTools } from '../src/tools.js';
import { ApiError } from '../src/client.js';

function stubClient(log) {
  const rec = (name) => (...args) => { log.push([name, ...args]); return Promise.resolve({ ok: name }); };
  return {
    site: { get: rec('site.get'), update: rec('site.update'), setFavicon: rec('site.setFavicon'), setLogo: rec('site.setLogo') },
    pages: { list: rec('pages.list'), get: rec('pages.get'), getByPermalink: rec('pages.getByPermalink'), create: rec('pages.create'), update: rec('pages.update'), remove: rec('pages.remove') },
    components: { list: rec('components.list'), get: rec('components.get'), getByPermalink: rec('components.getByPermalink'), create: rec('components.create'), update: rec('components.update'), remove: rec('components.remove') },
    redirects: { list: rec('redirects.list'), create: rec('redirects.create'), remove: rec('redirects.remove') },
    media: { list: rec('media.list'), upload: rec('media.upload'), remove: rec('media.remove') },
    bookings: { get: rec('bookings.get'), update: rec('bookings.update'), createEvent: rec('bookings.createEvent'), updateEvent: rec('bookings.updateEvent'), deleteEvent: rec('bookings.deleteEvent') },
    posts: { list: rec('posts.list'), get: rec('posts.get'), create: rec('posts.create'), update: rec('posts.update') },
  };
}

function toolMap(log = []) {
  const tools = buildTools(stubClient(log));
  return { log, byName: Object.fromEntries(tools.map((t) => [t.name, t])), tools };
}

test('exposes the expected tool set with descriptions and schemas', () => {
  const { tools } = toolMap();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    'create_component', 'create_meeting_type', 'create_page', 'create_post', 'create_redirect',
    'delete_component', 'delete_media', 'delete_meeting_type', 'delete_page', 'delete_redirect',
    'get_booking_setup', 'get_component', 'get_page', 'get_post', 'get_site',
    'list_components', 'list_media', 'list_pages', 'list_posts', 'list_redirects',
    'set_favicon', 'set_logo',
    'update_booking_setup', 'update_component', 'update_meeting_type', 'update_page', 'update_post', 'update_site', 'upload_media',
  ]);
  for (const t of tools) {
    assert.ok(t.description.length > 20, `${t.name} has a description`);
    assert.equal(typeof t.inputSchema, 'object', `${t.name} has a schema`);
    assert.equal(typeof t.handler, 'function');
  }
});

test('get_page accepts either id or permalink', async () => {
  const { log, byName } = toolMap();
  await byName.get_page.handler({ id: 3 });
  await byName.get_page.handler({ permalink: 'home' });
  assert.deepEqual(log, [['pages.get', 3], ['pages.getByPermalink', 'home']]);
  const res = await byName.get_page.handler({});
  assert.equal(res.isError, true);
});

test('create_page passes through content fields', async () => {
  const { log, byName } = toolMap();
  const args = { name: 'About', permalink: 'about', html: '<p>a</p>', css: 'p{}', js: 'x()', title: 'About us' };
  const res = await byName.create_page.handler(args);
  assert.deepEqual(log[0], ['pages.create', args]);
  assert.equal(res.content[0].type, 'text');
  assert.deepEqual(JSON.parse(res.content[0].text), { ok: 'pages.create' });
});

test('update_page sends only provided fields', async () => {
  const { log, byName } = toolMap();
  await byName.update_page.handler({ id: 9, html: '<p>new</p>' });
  assert.deepEqual(log[0], ['pages.update', 9, { html: '<p>new</p>' }]);
});

test('schemas reject bad input before calling the client', () => {
  const { byName } = toolMap();
  const schema = z.object(byName.create_redirect.inputSchema);
  assert.equal(schema.safeParse({ from_permalink: 'a', to_permalink: 'b', http_code: 307 }).success, false);
  assert.equal(schema.safeParse({ from_permalink: 'a', to_permalink: 'b', http_code: 302 }).success, true);
  const page = z.object(byName.create_page.inputSchema);
  assert.equal(page.safeParse({ name: 'x' }).success, false, 'permalink required');
  const comp = z.object(byName.create_component.inputSchema);
  assert.equal(comp.safeParse({ name: 'Card' }).success, true, 'component permalink optional');
});

test('upload_media forwards path, url and name', async () => {
  const { log, byName } = toolMap();
  await byName.upload_media.handler({ path: '/tmp/a.png', name: 'A' });
  await byName.upload_media.handler({ url: 'https://x/y.jpg' });
  assert.deepEqual(log, [['media.upload', { path: '/tmp/a.png', name: 'A' }], ['media.upload', { url: 'https://x/y.jpg' }]]);
});

test('api errors become isError results with the server message', async () => {
  const tools = buildTools({
    pages: { create: async () => { throw new ApiError(422, { message: 'Validation failed', errors: { permalink: ['The permalink has already been taken.'] } }); } },
  });
  const create = tools.find((t) => t.name === 'create_page');
  const res = await create.handler({ name: 'x', permalink: 'home' });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /422/);
  assert.match(res.content[0].text, /already been taken/);
});

test('js field descriptions do not claim eval/Function stripping any more', () => {
  const { byName } = toolMap();
  for (const name of ['create_page', 'update_page', 'create_component', 'update_component']) {
    const desc = byName[name].inputSchema.js.description || '';
    assert.doesNotMatch(desc, /stripped|eval\(/i, `${name}.js description`);
  }
});

test('booking tools forward weekly hours and meeting type edits', async () => {
  const { log, byName } = toolMap();
  await byName.update_booking_setup.handler({ max_advance_days: 30, availability: { MONDAY: [['09:00', '17:00']] } });
  await byName.update_meeting_type.handler({ id: 4, length: '00:30' });
  assert.deepEqual(log, [
    ['bookings.update', { max_advance_days: 30, availability: { MONDAY: [['09:00', '17:00']] } }],
    ['bookings.updateEvent', 4, { length: '00:30' }],
  ]);
});
