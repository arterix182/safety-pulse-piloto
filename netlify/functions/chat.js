import { json, requireEnv, supa } from "./_shared.js";

async function openaiChat(messages, tools){
  const key = requireEnv("OPENAI_API_KEY");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.2,
      messages,
      tools,
      tool_choice: tools?.length ? "auto" : undefined
    })
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI error (${res.status})`);
  return data;
}

async function getTop(range, filters){
  const now = Date.now();
  const ms = range === "week" ? 7*24*60*60*1000 : 24*60*60*1000;
  const fromISO = new Date(now - ms).toISOString();

  const sb = supa();
  let q = sb.from("incidents")
    .select("acto_inseguro, condicion_insegura, plant, turno, created_at")
    .gte("created_at", fromISO)
    .order("created_at", { ascending:false })
    .limit(2000);
  if (filters?.plant && filters.plant !== "all") q = q.eq("plant", filters.plant);
  if (filters?.turno && filters.turno !== "all") q = q.eq("turno", filters.turno);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const group = (rows, key) => {
    const m = new Map();
    for (const r of rows){
      const k = (r?.[key] || "").toString().trim();
      if (!k) continue;
      m.set(k, (m.get(k)||0)+1);
    }
    return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([label,count])=>({label,count}));
  };

  return {
    range,
    from: fromISO,
    total: (data||[]).length,
    actos: group(data||[], "acto_inseguro"),
    condiciones: group(data||[], "condicion_insegura")
  };
}

async function getRecent(limit=20){
  const sb = supa();
  const { data, error } = await sb
    .from("incidents")
    .select("created_at, plant, turno, acto_inseguro, condicion_insegura, user_name, audited_name")
    .order("created_at", { ascending:false })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error) throw new Error(error.message);
  return data || [];
}

export async function handler(event){
  try{
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: {"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type"}, body: "" };
    if (event.httpMethod !== "POST") return json(405, { ok:false, error:"Method not allowed" });

    const body = JSON.parse(event.body || "{}");
    const question = (body?.question || "").toString().trim();
    const user = body?.user || {};
    if (!question) return json(400, { ok:false, error:"Missing question" });

    const tools = [
      {
        type: "function",
        function: {
          name: "get_top",
          description: "Obtiene el top de Actos/Condiciones del día o semana con datos reales de la base de datos.",
          parameters: {
            type: "object",
            properties: {
              range: { type: "string", enum: ["day","week"], description: "day=últimas 24h, week=últimos 7 días" },
              filters: {
                type: "object",
                properties: {
                  plant: { type: "string" },
                  turno: { type: "string" }
                }
              }
            },
            required: ["range"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_recent",
          description: "Obtiene registros recientes para dar contexto a recomendaciones.",
          parameters: {
            type: "object",
            properties: {
              limit: { type: "integer", minimum: 1, maximum: 50 }
            }
          }
        }
      }
    ];

    const system = `Eres Securito, un asistente de seguridad industrial para planta automotriz.\n`+
      `Reglas: responde en español claro, directo y accionable.\n`+
      `Si te piden TOP del día/semana, debes usar get_top y basarte solo en datos reales.`;

    const messages = [
      { role: "system", content: system },
      { role: "user", content: `Usuario: ${user?.name||""} (${user?.gmin||""}). Pregunta: ${question}` }
    ];

    // First pass
    const first = await openaiChat(messages, tools);
    const msg = first?.choices?.[0]?.message;
    const toolCalls = msg?.tool_calls || [];

    if (toolCalls.length){
      // Execute tools
      for (const tc of toolCalls){
        const name = tc?.function?.name;
        const args = JSON.parse(tc?.function?.arguments || "{}");
        let result = null;
        if (name === "get_top") result = await getTop(args.range, args.filters);
        else if (name === "get_recent") result = await getRecent(args.limit || 20);
        else result = { error: "Unknown tool" };

        messages.push(msg);
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
      }

      const second = await openaiChat(messages, tools);
      const out = second?.choices?.[0]?.message?.content || "";
      return json(200, { ok:true, answer: out });
    }

    return json(200, { ok:true, answer: msg?.content || "" });
  }catch(e){
    return json(500, { ok:false, error: e.message || String(e) });
  }
}
