// Shared helpers (no external deps)

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization, apikey',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function ok(body) { return json(200, body); }
function bad(statusCode, message, extra = {}) { return json(statusCode, { ok: false, error: message, ...extra }); }

function pickSupabaseCreds() {
  const url = process.env.SUPABASE_URL;
  // Prefer service role (server-side only), fallback to anon.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  return { url, key };
}

async function sbFetch(path, { method = 'GET', body, query = '' } = {}) {
  const { url, key } = pickSupabaseCreds();
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE key');

  const full = `${url.replace(/\/$/, '')}/rest/v1/${path}${query ? (query.startsWith('?') ? query : `?${query}`) : ''}`;
  const headers = {
    apikey: key,
    authorization: `Bearer ${key}`,
  };
  let payload;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    headers['prefer'] = 'return=representation';
    payload = JSON.stringify(body);
  }

  const res = await fetch(full, { method, headers, body: payload });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.message) ? data.message : `Supabase REST error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function isOptions(event) {
  return event.httpMethod === 'OPTIONS';
}

function readJson(event) {
  if (!event.body) return null;
  try { return JSON.parse(event.body); } catch { return null; }
}

module.exports = { json, ok, bad, sbFetch, isOptions, readJson };
