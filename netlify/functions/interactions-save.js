// netlify/functions/interactions-save.js
// Guarda interacciones en Supabase vía REST (sin deps)

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
    if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Use POST" });

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, {
        ok: false,
        error: "Missing env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (e) {
      return json(400, { ok: false, error: "Invalid JSON body" });
    }

    // Ajusta estos campos a lo que mandes desde el frontend
    const row = {
      gmin: payload.gmin ?? null,
      user_name: payload.userName ?? payload.user_name ?? null,
      manager: payload.manager ?? null,
      area: payload.area ?? null,
      turno: payload.turno ?? null,
      message_user: payload.texto ?? payload.message_user ?? payload.userText ?? null,
      message_ai: payload.respuesta ?? payload.message_ai ?? payload.aiText ?? null,
      meta: payload.meta ?? null,
      created_at: payload.createdAt ?? new Date().toISOString(),
    };

    // Inserta en tabla "interactions"
    const url = `${SUPABASE_URL}/rest/v1/interactions`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });

    const text = await r.text();

    if (!r.ok) {
      return json(r.status, { ok: false, error: text });
    }

    return json(200, { ok: true, saved: text ? JSON.parse(text) : true });
  } catch (err) {
    return json(500, { ok: false, error: String(err?.message || err) });
  }
};
