const { json, supa, pickQueryParam } = require("./_shared.js");
function groupCount(rows, key){
  const m = new Map();
  for (const r of rows){
    const k = (r?.[key] || "").toString().trim();
    if (!k) continue;
    m.set(k, (m.get(k)||0)+1);
  }
  return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]).map(([label,count])=>({label,count}));
}

exports.handler = async (event) => {
  try{
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: {"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type"}, body: "" };
    if (event.httpMethod !== "GET") return json(405, { ok:false, error:"Method not allowed" });
    const qs = event.queryStringParameters || {};
    const range = pickQueryParam(qs, "range", "day");
    const plant = pickQueryParam(qs, "plant", "all");
    const turno = pickQueryParam(qs, "turno", "all");

    const now = Date.now();
    const ms = range === "week" ? 7*24*60*60*1000 : 24*60*60*1000;
    const fromISO = new Date(now - ms).toISOString();

    const sb = supa();
    let q = sb.from("incidents")
      .select("acto_inseguro, condicion_insegura, plant, turno, created_at")
      .gte("created_at", fromISO)
      .order("created_at", { ascending:false })
      .limit(2000);
    if (plant !== "all") q = q.eq("plant", plant);
    if (turno !== "all") q = q.eq("turno", turno);
    const { data, error } = await q;
    if (error) return json(500, { ok:false, error: error.message });

    const actos = groupCount(data||[], "acto_inseguro").slice(0,10);
    const condiciones = groupCount(data||[], "condicion_insegura").slice(0,10);
    return json(200, { ok:true, range, from: fromISO, total: (data||[]).length, actos, condiciones });
  }catch(e){
    return json(500, { ok:false, error: e.message || String(e) });
  }
}
