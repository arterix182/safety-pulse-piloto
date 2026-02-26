// netlify/functions/openai-proxy.js (CommonJS)
// Optional passthrough proxy (kept for compatibility). Not required for normal use.

const { json, cors } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok:false, error:'Method not allowed' });

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return json(200, { ok:false, error:'Missing OPENAI_API_KEY' });

    const body = event.body ? JSON.parse(event.body) : {};
    const url = body.url || 'https://api.openai.com/v1/chat/completions';
    const payload = body.payload || {};

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(()=>({}));
    return json(200, { ok: res.ok, status: res.status, data });
  } catch (e) {
    return json(200, { ok:false, error:'proxy failed', detail: String(e && e.message ? e.message : e) });
  }
};
