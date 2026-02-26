const { ok, bad, isOptions, readJson } = require('./_shared');

// POST { text, voice?, format? }
exports.handler = async (event) => {
  if (isOptions(event)) return ok({ ok: true });
  if (event.httpMethod !== 'POST') return bad(405, 'Method not allowed');

  try {
    const body = readJson(event) || {};
    const text = String(body.text || '').trim();
    if (!text) return bad(400, 'Missing text');

    const key = process.env.OPENAI_API_KEY;
    if (!key) return bad(503, 'IA not configured (missing OPENAI_API_KEY)');

    // Voice: OpenAI voices are limited; “anime” style is a prompt-level vibe.
    const voice = body.voice || 'alloy';
    const format = body.format || 'mp3';

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice,
        format,
        // Put “anime vibe” in instruction — depends on model capabilities.
        input: text,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return bad(res.status, `TTS error`, { details: err });
    }

    const audio = Buffer.from(await res.arrayBuffer());
    return {
      statusCode: 200,
      headers: {
        'content-type': format === 'wav' ? 'audio/wav' : 'audio/mpeg',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      },
      body: audio.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (e) {
    return bad(500, e.message || 'Server error');
  }
};
