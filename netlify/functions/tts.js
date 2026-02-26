// netlify/functions/tts.js (CommonJS)
// Simple TTS endpoint using OpenAI Audio API.

const { json, cors } = require('./_shared');

async function fetchWithTimeout(url, opts, timeoutMs){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeoutMs);
  try{
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok:false, error:'Method not allowed' });

  try{
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return json(200, { ok:false, error:'Missing OPENAI_API_KEY' });

    const body = event.body ? JSON.parse(event.body) : {};
    const text = (body.text || '').toString().trim();
    if (!text) return json(400, { ok:false, error:'Missing text' });

    const voice = (process.env.OPENAI_TTS_VOICE || body.voice || 'alloy').toString();
    const model = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';

    const payload = {
      model,
      voice,
      input: text.slice(0, 1200),
      format: 'mp3',
    };

    const doCall = async () => {
      const res = await fetchWithTimeout('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }, 18000);
      return res;
    };

    let res = await doCall();
    if (!res.ok && (res.status === 429 || res.status >= 500)){
      await new Promise(r=>setTimeout(r, 350));
      res = await doCall();
    }

    if (!res.ok){
      const err = await res.text().catch(()=> '');
      return json(200, { ok:false, error:`TTS error ${res.status}`, detail: err.slice(0,400) });
    }

    const buf = Buffer.from(await res.arrayBuffer());
    return {
      statusCode: 200,
      headers: {
        ...cors(),
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
      body: buf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (e) {
    return json(200, { ok:false, error:'TTS failed', detail: String(e && e.message ? e.message : e) });
  }
};
