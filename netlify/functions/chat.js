// netlify/functions/chat.js (CommonJS)
// Uses OpenAI Responses API via fetch (no SDK required).
function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function pickText(respJson) {
  // Responses API: output_text convenience may exist; otherwise parse output array.
  if (typeof respJson?.output_text === "string" && respJson.output_text.trim()) return respJson.output_text.trim();
  const out = respJson?.output;
  if (!Array.isArray(out)) return "";
  for (const item of out) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c?.type === "output_text" && typeof c?.text === "string" && c.text.trim()) return c.text.trim();
    }
  }
  return "";
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
    if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return json(500, { ok: false, error: "OPENAI_API_KEY missing" });

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

    const message = String(body.message || body.text || "").slice(0, 6000);
    const model = String(body.model || process.env.OPENAI_MODEL || "gpt-4.1-mini");

    const system = String(body.system || process.env.SECURITO_SYSTEM_PROMPT || "").trim() || (
      "Eres Securito, un asistente amable y profesional. Responde con naturalidad, sin repetir frases. " +
      "Si el usuario saluda, saluda y pregunta en qué puede ayudar. Sé breve y claro."
    );

    // Keep responses quick on mobile.
    const max_output_tokens = Number(body.max_output_tokens || process.env.OPENAI_MAX_OUTPUT_TOKENS || 220);
    const temperature = Number(body.temperature ?? process.env.OPENAI_TEMPERATURE ?? 0.7);

    const payload = {
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: message || "Hola" },
      ],
      max_output_tokens,
      temperature,
    };

    const controller = new AbortController();
    const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 20000);
    const t = setTimeout(() => controller.abort(), timeoutMs);

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(t));

    const txt = await r.text();
    let data = {};
    try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

    if (!r.ok) {
      return json(r.status, {
        ok: false,
        error: "openai_error",
        status: r.status,
        detail: data?.error?.message || data?.message || "Request failed",
      });
    }

    const answer = pickText(data) || "Te escucho. ¿En qué te ayudo?";
    return json(200, { ok: true, text: answer });
  } catch (err) {
    const msg = String(err?.name === "AbortError" ? "timeout" : (err?.message || err));
    return json(500, { ok: false, error: "chat_failed", detail: msg });
  }
};
