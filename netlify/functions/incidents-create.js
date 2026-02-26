import { json, supa } from "./_shared.js";

export async function handler(event){
  try{
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: {"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type"}, body: "" };
    if (event.httpMethod !== "POST") return json(405, { ok:false, error:"Method not allowed" });

    const body = JSON.parse(event.body || "{}");
    const rec = body?.record;
    if (!rec) return json(400, { ok:false, error:"Missing record" });

    // Minimal normalization
    const payload = {
      client_id: rec.id,
      type: rec.type,
      created_at: rec.createdAt,
      user_gmin: rec.user?.gmin || null,
      user_name: rec.user?.name || null,
      audited_gmin: rec.audited?.gmin || null,
      audited_name: rec.audited?.name || null,
      plant: rec.audited?.plant || null,
      turno: rec.audited?.turno || null,
      linea: rec.audited?.linea || null,
      manager: rec.audited?.manager || null,
      hazard_mode: rec.hazardMode || null,
      acto_inseguro: rec.findings?.acto || null,
      condicion_insegura: rec.findings?.condicion || null,
      comment: rec.comment || null,
      raw: rec
    };

    const sb = supa();
    const { data, error } = await sb
      .from("incidents")
      .insert(payload)
      .select("id, created_at")
      .single();

    if (error) return json(500, { ok:false, error: error.message });
    return json(200, { ok:true, id: data.id, created_at: data.created_at });
  }catch(e){
    return json(500, { ok:false, error: e.message || String(e) });
  }
}
