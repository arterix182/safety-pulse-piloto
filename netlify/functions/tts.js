const { cors, json, requireEnv } = require("./_shared.js");
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors(), body: "" };
  if (event.httpMethod !== "POST") return json(405, { ok:false, error:"Use POST" });

  try{
    const apiKey = requireEnv("OPENAI_API_KEY");
    const body = JSON.parse(event.body || "{}");
    const text = String(body.text || "").trim();
    if (!text) return json(400, { ok:false, error:"Missing text" });

    const model = process.env.TTS_MODEL || "gpt-4o-mini-tts";
    const voice = process.env.TTS_VOICE || "alloy";
    const instructions = (process.env.TTS_STYLE || "anime; clear; confident; friendly; energetic but professional").slice(0, 800);

    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        voice,
        input: text,
        format: "mp3",
        instructions
      })
    });

    if (!r.ok){
      const t = await r.text().catch(()=>"");
      return json(r.status, { ok:false, error:"TTS failed", detail: t.slice(0, 800) });
    }

    const buf = Buffer.from(await r.arrayBuffer());
    return {
      statusCode: 200,
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
        ...cors()
      },
      body: buf.toString("base64"),
      isBase64Encoded: true
    };
  }catch(e){
    return json(500, { ok:false, error: String(e?.message || e) });
  }
}
