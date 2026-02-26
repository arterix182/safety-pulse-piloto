// netlify/functions/chat.js (CommonJS)
// Chat endpoint for Securito. Accepts optional `history` to keep conversation context.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
    body: JSON.stringify(body),
  };
}

function safeString(x) {
  return (typeof x === 'string' ? x : '').trim();
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const out = [];
  for (const m of history) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'assistant' ? 'assistant' : (m.role === 'user' ? 'user' : null);
    const content = safeString(m.content);
    if (!role || !content) continue;
    out.push({ role, content });
  }
  // Keep it tight: last 12 messages (6 turns)
  return out.slice(-12);
}

async function fetchWithTimeout(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const question = safeString(body.question);
    const user = body.user && typeof body.user === 'object' ? body.user : {};
    const userName = safeString(user.name || user.displayName || user.fullName || '');
    const gmin = safeString(user.gmin || '');
    const history = normalizeHistory(body.history);

    if (!question) return json(400, { error: 'Missing question' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json(200, {
        ok: false,
        reply: 'IA no disponible en este momento (falta OPENAI_API_KEY).',
      });
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

    // System prompt: friendly, concise, and uses context.
    const system = [
      'Eres Securito, un asistente virtual amigable y "vivo".',
      'Hablas español natural (México), directo y con buena vibra.',
      'Puedes hablar de cualquier tema; si el tema es seguridad, eres especialmente proactivo y práctico.',
      'Mantén el contexto de la conversación. No repitas tu presentación en cada mensaje.',
      'Cuando falte información, haz 1 pregunta concreta.',
      'Si te saludan, saluda de regreso y usa el nombre si está disponible.',
      'Si te piden un plan o ayuda general, responde con pasos claros y accionables.',
      'Evita texto excesivamente largo: prioriza bullets y acciones.',
    ].join(' ');

    const metaLine = (() => {
      const parts = [];
      if (userName) parts.push(`Nombre: ${userName}`);
      if (gmin) parts.push(`GMIN: ${gmin}`);
      return parts.length ? `Contexto usuario: ${parts.join(' | ')}` : '';
    })();

    const messages = [
      { role: 'system', content: system },
      ...(metaLine ? [{ role: 'system', content: metaLine }] : []),
      ...history,
      { role: 'user', content: question },
    ];

    const payload = {
      model,
      messages,
      temperature: 0.6,
      max_tokens: 220,
      presence_penalty: 0.2,
      frequency_penalty: 0.2,
    };

    // Try once, retry once on transient failures.
    const doCall = async () => {
      const res = await fetchWithTimeout(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
        14000
      );
      const data = await res.json().catch(() => ({}));
      return { res, data };
    };

    let { res, data } = await doCall();
    if (!res.ok) {
      // One quick retry for 429/5xx/timeouts
      const status = res.status || 0;
      if (status === 429 || status >= 500) {
        await new Promise((r) => setTimeout(r, 350));
        ({ res, data } = await doCall());
      }
    }

    if (!res.ok) {
      const msg = (data && (data.error?.message || data.message)) || 'Error al consultar IA.';
      return json(200, {
        ok: false,
        reply:
          'Ahorita estoy teniendo bronca para conectarme a la IA. ' +
          'Intenta otra vez en 10 segundos. Si sigue igual, revisa OPENAI_API_KEY en Netlify.',
        debug: { status: res.status, message: msg },
      });
    }

    const reply =
      safeString(data?.choices?.[0]?.message?.content) ||
      'Te escucho. ¿Qué necesitas?';

    return json(200, { ok: true, reply, model });
  } catch (err) {
    return json(200, {
      ok: false,
      reply: 'Se me atoró algo al responder. Intenta de nuevo.',
      debug: { message: String(err && err.message ? err.message : err) },
    });
  }
};
