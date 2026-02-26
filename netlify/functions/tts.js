// netlify/functions/tts.js (CommonJS)
// OpenAI TTS via fetch. Returns audio/mpeg as base64.
// Request body: { text: "...", voice?: "...", format?: "mp3"|"wav"|"opus" }
function res(statusCode, headers, body, isBase64Encoded=false) {
  return { statusCode, headers, body, isBase64Encoded };
}
function json(statusCode, obj) {
  return res(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
  }, JSON.stringify(obj));
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
    if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return json(500, { ok: false, error: "OPENAI_API_KEY missing" });

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

    const text = String(body.text || body.message || "").trim();
    if (!text) return json(400, { ok: false, error: "missing_text" });

    const model = String(body.model || process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts");
    const voice = String(body.voice || process.env.OPENAI_TTS_VOICE || "alloy"); // change to your preferred
    const format = String(body.format || process.env.OPENAI_TTS_FORMAT || "mp3"); // mp3 by default

    const payload = {
      model,
      voice,
      input: text.slice(0, 3000),
      format,
    };

    const controller = new AbortController();
    const timeoutMs = Number(process.env.OPENAI_TTS_TIMEOUT_MS || 25000);
    const t = setTimeout(() => controller.abort(), timeoutMs);

    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(t));

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      let data = {};
      try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
      return json(r.status, {
        ok: false,
        error: "openai_tts_error",
        status: r.status,
        detail: data?.error?.message || data?.message || "TTS failed",
      });
    }

    const arrayBuf = await r.arrayBuffer();
    const b64 = Buffer.from(arrayBuf).toString("base64");

    // Return audio as base64. Client should create Blob/Audio from it.
    const mime = format === "wav" ? "audio/wav"
      : format === "opus" ? "audio/opus"
      : "audio/mpeg";

    return res(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    }, JSON.stringify({ ok: true, mime, audio_b64: b64 }), false);
  } catch (err) {
    const msg = String(err?.name === "AbortError" ? "timeout" : (err?.message || err));
    return json(500, { ok: false, error: "tts_failed", detail: msg });
  }
};
