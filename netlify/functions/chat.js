const { ok, bad, isOptions, readJson } = require('./_shared');

function isGreeting(txt){
  const t = String(txt||'').trim().toLowerCase();
  return /^(hola|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|que\s+tal|hey|saludos)(\b|!|\.|,|$)/i.test(t);
}

async function openaiChat({ model, messages, temperature=0.5, max_tokens=220 }){
  const key = process.env.OPENAI_API_KEY;
  if(!key) {
    const err = new Error('IA_NOT_CONFIGURED');
    err.status = 503;
    throw err;
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ 'content-type':'application/json', 'authorization':`Bearer ${key}` },
    body: JSON.stringify({ model, temperature, max_tokens, messages })
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok){
    const err = new Error(data?.error?.message || `OpenAI error (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data?.choices?.[0]?.message?.content || '';
}

exports.handler = async (event) => {
  if (isOptions(event)) return ok({ ok: true });
  if (event.httpMethod !== 'POST') return bad(405, 'Method not allowed');

  try {
    const body = readJson(event) || {};
    const question = String(body.question || '').trim();
    const user = body.user || {};
    const name = (user.name || '').trim();

    if (!question) return bad(400, 'Pregunta vacía');

    // Super-fast greeting path (no IA) to feel snappy on celular
    if (isGreeting(question)){
      const who = name ? `¡Hola, ${name}!` : '¡Hola!';
      return ok({ ok:true, answer: `${who} 👋 Soy Securito. Dime qué necesitas y te ayudo.` });
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

    const context = [
      user.gmin ? `GMIN: ${user.gmin}` : null,
      user.plant ? `Planta: ${user.plant}` : null,
      user.linea ? `Línea: ${user.linea}` : (user.line ? `Línea: ${user.line}` : null),
      user.turno ? `Turno: ${user.turno}` : null,
      user.manager ? `Manager: ${user.manager}` : null,
      user.area ? `Área: ${user.area}` : null,
    ].filter(Boolean).join(' • ');

    const system =
      `Eres Securito, un asistente virtual amable, rápido y con humor ligero. `+
      `Respondes en español (MX) claro y profesional. `+
      `Si es tema de seguridad industrial, da acciones concretas (campañas, contención, corrección, prevención). `+
      `Si no es de seguridad, igual ayuda sin ponerte rígido. `+
      `Sé breve (2–6 frases) y pregunta 1 cosa para afinar.`;

    const messages = [
      { role:'system', content: system },
      { role:'user', content: `${context ? context + "\n" : ''}${name ? `Usuario: ${name}. ` : ''}Pregunta: ${question}` }
    ];

    const answer = await openaiChat({ model, messages });
    return ok({ ok:true, answer });
  } catch (e) {
    // Fallback ultra estable: nunca “crashea”, siempre contesta.
    const status = e.status || 500;
    if (String(e.message||'') === 'IA_NOT_CONFIGURED'){
      return ok({ ok:true, answer: 'Ahorita no tengo IA activa (falta configurar la llave). Pero puedo seguir registrando recorridos e interacciones sin problema.' });
    }
    return ok({ ok:true, answer: 'Se me fue el aire un segundo 😅. Intenta de nuevo. Si persiste, revisa la llave de IA y el deploy de Netlify Functions.' });
  }
};
