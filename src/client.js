import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const DEFAULT_BASE_URL = 'https://redstudio.ie/api/v1/external';
const MAX_WAIT_SECONDS = 120;

export class ApiError extends Error {
  constructor(status, body, method, path) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body);
    super(`RedStudio API ${status} on ${method} ${path}: ${detail}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Thin client over the RedStudio CMS external API. One method per endpoint,
 * grouped by resource. Throws ApiError on any non-2xx response.
 */
export class RedStudioClient {
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, fetchImpl = globalThis.fetch, sleep = defaultSleep, maxRetries = 5 } = {}) {
    if (!apiKey) {
      throw new Error('RedStudio API key is required (REDSTUDIO_API_KEY).');
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetch = fetchImpl;
    this.sleep = sleep;
    this.maxRetries = maxRetries;

    this.site = {
      get: () => this.request('GET', '/site'),
      update: (data) => this.request('PUT', '/site', { json: data }),
      setFavicon: (opts) => this.uploadFile('/site/favicon', opts),
      setLogo: (opts) => this.uploadFile('/site/logo', opts),
    };

    this.pages = this.builderResource('/builder/pages');
    this.components = this.builderResource('/builder/components');

    this.redirects = {
      list: () => this.request('GET', '/builder/redirects'),
      create: (data) => this.request('POST', '/builder/redirects', { json: data }),
      remove: (id) => this.request('DELETE', `/builder/redirects/${id}`),
    };

    this.media = {
      list: () => this.request('GET', '/media'),
      upload: (opts) => this.uploadMedia(opts),
      remove: (id) => this.request('DELETE', `/media/${id}`),
    };

    this.bookings = {
      get: () => this.request('GET', '/bookings'),
      update: (data) => this.request('PUT', '/bookings', { json: data }),
      createEvent: (data) => this.request('POST', '/bookings/events', { json: data }),
      updateEvent: (id, data) => this.request('PUT', `/bookings/events/${id}`, { json: data }),
      deleteEvent: (id) => this.request('DELETE', `/bookings/events/${id}`),
    };

    this.posts = {
      list: (page = 1) => this.request('GET', `/posts?page=${encodeURIComponent(page)}`),
      get: (id) => this.request('GET', `/posts/${id}`),
      create: (data) => this.request('POST', '/posts', { json: data }),
      update: (id, data) => this.request('PUT', `/posts/${id}`, { json: data }),
    };
  }

  builderResource(prefix) {
    return {
      list: () => this.request('GET', prefix),
      get: (id) => this.request('GET', `${prefix}/${id}`),
      getByPermalink: (permalink) => this.request('GET', `${prefix}/permalink/${permalink}`),
      create: (data) => this.request('POST', prefix, { json: data }),
      update: (id, data) => this.request('PUT', `${prefix}/${id}`, { json: data }),
      remove: (id) => this.request('DELETE', `${prefix}/${id}`),
    };
  }

  async request(method, path, { json, form } = {}) {
    const headers = { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' };
    const init = { method, headers };

    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(json);
    } else if (form !== undefined) {
      init.body = form; // fetch sets the multipart boundary itself
    }

    // The API group is throttled per IP (60/min) on top of the per-key limit.
    // Bulk runs (media uploads, page imports) trip it, so wait and retry.
    for (let attempt = 0; ; attempt++) {
      const response = await this.fetch(this.baseUrl + path, init);
      const body = await parseBody(response);

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after') || body?.retry_after || 0);
        if (retryAfter > MAX_WAIT_SECONDS) {
          // The per-key hourly limit, not the per-minute burst limit: tell the caller instead of hanging.
          const minutes = Math.ceil(retryAfter / 60);
          throw new ApiError(429, `${typeof body === 'string' ? body : body?.message || 'Rate limited.'} The API key's hourly limit is exhausted; it resets in about ${minutes} minutes.`, method, path);
        }
        if (attempt < this.maxRetries) {
          await this.sleep((retryAfter > 0 ? retryAfter : 15) * 1000);
          continue;
        }
      }

      if (!response.ok) {
        throw new ApiError(response.status, body, method, path);
      }

      return body;
    }
  }

  async uploadFile(endpoint, { path, url } = {}) {
    const form = await this.formForFile({ path, url });
    return this.request('POST', endpoint, { form });
  }

  async uploadMedia({ path, url, name } = {}) {
    const form = await this.formForFile({ path, url });
    if (name) {
      form.append('name', name);
    }

    return this.request('POST', '/media', { form });
  }

  async formForFile({ path, url } = {}) {
    if (!path && !url) {
      throw new Error('upload requires a local path or url.');
    }

    let bytes;
    let fileName;
    let mime;

    if (path) {
      bytes = await readFile(path);
      fileName = basename(path);
    } else {
      const res = await this.fetch(url, { method: 'GET' });
      if (!res.ok) {
        throw new ApiError(res.status, await parseBody(res), 'GET', url);
      }
      bytes = Buffer.from(await (res.arrayBuffer ? res.arrayBuffer() : textToBuffer(res)));
      fileName = basename(new URL(url).pathname) || 'upload';
      mime = res.headers.get('content-type') || undefined;
    }

    const form = new FormData();
    form.append('file', new Blob([bytes], mime ? { type: mime } : undefined), fileName);
    return form;
  }
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseBody(response) {
  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

async function textToBuffer(res) {
  return Buffer.from(await res.text());
}
