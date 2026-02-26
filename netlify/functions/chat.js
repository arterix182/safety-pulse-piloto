const { json, requireEnv, supa } = require("./_shared.js");
function isGreeting(txt){
  const t = String(txt||"").trim().toLowerCase();
  return /^(hola|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|que\s+tal|hey|saludos)(\b|!|\.|,|$)/i.test(t);
}
function isMetaAboutSecurito(txt){
  const t = String(txt||"").toLowerCase();
  return /(por\s+qu[eé]\s+hablas\s+as[ií]|por\s+qu[eé]\s+respondes\s+as[ií]|qu[eé]\s+eres|qu[eé]\s+haces|para\s+qu[eé]\s+sirves)/i.test(t);
}

function isSafetyTopic(txt){
  const t = String(txt||"").toLowerCase();
  const kws = [
    "seguridad","safety","acto","condición","condicion","riesgo","peligro","ppe","epp",
    "casco","lentes","guantes","chaleco","arnés","arnes","lockout","loto","montacargas",
    "forklift","peatonal","zona","derrame","resbal","caída","caida",
    "incidente","lesión","lesion","near miss","casi accidente","5s","ergonom","postura",
    "extintor","evacu","fuego","químic","quimic","quimico","eléctr","electric",
    "guardas","protección","proteccion","barandal","andamio","escalera","altura"
  ];
  return kws.some(k=>t.includes(k));
}

async function openaiChat(messages, tools){

  const key = process.env.OPENAI_API_KEY;
  if(!key) throw new Error("IA_NOT_CONFIGURED");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.2,
      max_tokens: 190,
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

exports.handler = async (event) => {
  try{
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: {"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type"}, body: "" };
    if (event.httpMethod !== "POST") return json(405, { ok:false, error:"Method not allowed" });

    const body = JSON.parse(event.body || "{}");
    const question = (body?.question || "").toString().trim();

    if (!question) return json(400, { ok:false, error:"Pregunta vacía" });
      if (isMetaAboutSecurito(question)){
        return json(200, { ok:true, answer:`Hablo así para ser **claro y accionable** en seguridad. 😄\n\nDime qué hallazgo tienes (EPP/acto/condición/zona) y te digo qué hacer.` });
      }

      // Allow short follow-ups like "por favor" if we have prior safety context
      if (meta?.followUp && meta?.lastSafetyQuestion){
        // allow: handled below by effectiveQuestion merge
      } else {
        return json(200, { ok:true, answer:`${who}, yo solo apoyo con **seguridad industrial** (EPP, actos/condiciones inseguras, LOTO, ergonomía, prevención).\n\nSi me dices tu situación de seguridad (¿qué viste y en dónde?), te ayudo con pasos concretos.` });
      }
    }


    
    const meta = body?.meta || {};
    let effectiveQuestion = question;
    if (meta?.followUp && meta?.lastSafetyQuestion){
      effectiveQuestion = `${meta.lastSafetyQuestion}\n\n[El usuario insiste/da seguimiento]: ${question}`;
    }

    // Fast-path for EPP/PPE to reduce latency on mobile (no OpenAI call)
    if (/(\bepp\b|\bppe\b|equipo de protecci[oó]n personal|casco|lentes|guantes|chaleco|arn[eé]s|calzado)/i.test(effectiveQuestion)){
      const line = (body?.user?.linea || body?.user?.line || body?.user?.area || "").toString().trim();
      const trip = (body?.user?.turno || body?.user?.trip || "").toString().trim();
      const plant = (body?.user?.plant || "").toString().trim();
      const ctx = [plant && `Planta: ${plant}`, line && `Línea/Área: ${line}`, trip && `Tripulación/Turno: ${trip}`].filter(Boolean).join(" • ");
      const answer =
        `Para **EPP correcto** (${ctx || "según tu área"}), aplica esto:\n\n`+
        `1) **Casco**: ajuste firme, sin grietas; barbiquejo si aplica.\n`+
        `2) **Lentes**: siempre en piso (no en la frente); limpios y sin rayas fuertes.\n`+
        `3) **Guantes**: el tipo correcto (corte/abrasión/químico). Cambia si están rotos o contaminados.\n`+
        `4) **Calzado**: punta y suela en buen estado; amarre completo.\n`+
        `5) **Alta visibilidad**: chaleco visible, sin piezas sueltas.\n`+
        `6) **Regla de oro**: si el riesgo cambia, **cambia el EPP**.\n\n`+
        `Dime **qué operación** (torque, altura, químicos, montacargas, etc.) y te digo el EPP exacto y los 3 errores típicos a corregir.`;
      return json(200, { ok:true, answer });
    }
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

    const system = `Eres Securito, un asistente virtual amable y rápido para una planta automotriz. Tu especialidad es seguridad industrial (EHS), pero puedes ayudar con cualquier tema. Cuando sea posible, sugiere buenas prácticas de seguridad.\n`+
      `Responde en español (MX) claro y humano, con tono amable y pro. Sé breve (2–5 frases), y usa el nombre del usuario si se conoce.\n`+
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
    const msg = e?.message || String(e);
    const status = msg === "IA_NOT_CONFIGURED" ? 503 : 500;
    return json(status, { ok:false, error: msg });
  }
}
