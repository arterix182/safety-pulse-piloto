const { json, supa, pickQueryParam } = require("./_shared.js");
exports.handler = async (event) => {
  try{
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: {"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type"}, body: "" };
    if (event.httpMethod !== "GET") return json(405, { ok:false, error:"Method not allowed" });

    const qs = event.queryStringParameters || {};
    const from = pickQueryParam(qs, "from");
    const to = pickQueryParam(qs, "to");
    const type = pickQueryParam(qs, "type", "all");
    const plant = pickQueryParam(qs, "plant", "all");
    const turno = pickQueryParam(qs, "turno", "all");
    const user_gmin = pickQueryParam(qs, "user_gmin", "");
    const acto = pickQueryParam(qs, "acto", "all");
    const cond = pickQueryParam(qs, "cond", "all");
    const limit = Math.min(parseInt(pickQueryParam(qs, "limit", "500"),10) || 500, 2000);

    const sb = supa();
    let q = sb.from("incidents").select("id,created_at,raw").order("created_at", { ascending:false }).limit(limit);
    if (from) q = q.gte("created_at", new Date(from + "T00:00:00Z").toISOString());
    if (to) q = q.lte("created_at", new Date(to + "T23:59:59Z").toISOString());
    if (type !== "all") q = q.eq("type", type);
    if (plant !== "all") q = q.eq("plant", plant);
    if (turno !== "all") q = q.eq("turno", turno);
    if (user_gmin) q = q.eq("user_gmin", user_gmin);
    if (acto !== "all") q = q.eq("acto_inseguro", acto);
    if (cond !== "all") q = q.eq("condicion_insegura", cond);

    const { data, error } = await q;
    if (error) return json(500, { ok:false, error: error.message });

    // Return raw payloads as the front-end expects
    const records = (data || []).map(r => ({
      ...r.raw,
      cloudId: r.id,
      createdAt: r.raw?.createdAt || r.created_at
    }));

    return json(200, { ok:true, records });
  }catch(e){
    return json(500, { ok:false, error: e.message || String(e) });
  }
}
