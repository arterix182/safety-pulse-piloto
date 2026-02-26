// netlify/functions/incidents-list.js (CommonJS)
function json(statusCode, obj){
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  try{
    const limit = Math.min(Number(event.queryStringParameters?.limit || 2000), 5000);

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if(!url || !key) return json(501, { ok:false, error:"supabase_not_configured" });

    // Ajusta el nombre de tabla/columnas si tu tabla se llama distinto
    const endpoint = `${url}/rest/v1/incidents?select=*&order=created_at.desc&limit=${limit}`;

    const r = await fetch(endpoint, {
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Accept": "application/json",
      }
    });

    const data = await r.json().catch(()=>null);
    if(!r.ok) return json(r.status, { ok:false, error:"supabase_error", detail:data });

    return json(200, { ok:true, rows: data });
  }catch(err){
    return json(500, { ok:false, error:"incidents_list_failed", detail: String(err?.message || err) });
  }
};
