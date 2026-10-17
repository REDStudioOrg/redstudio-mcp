/**
 * Fake fetch that records calls and replays canned responses.
 */
export function fakeFetch(responses = []) {
  const calls = [];
  const queue = [...responses];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const next = queue.shift() ?? { status: 200, body: {} };
    const bodyText = typeof next.body === 'string' ? next.body : JSON.stringify(next.body);
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      headers: { get: (k) => (k.toLowerCase() === 'content-type' ? (next.contentType ?? 'application/json') : null) },
      text: async () => bodyText,
      json: async () => JSON.parse(bodyText),
    };
  };
  fn.calls = calls;
  return fn;
}

export function lastCall(fetch) {
  return fetch.calls[fetch.calls.length - 1];
}

export function parseJsonBody(call) {
  return JSON.parse(call.init.body);
}
