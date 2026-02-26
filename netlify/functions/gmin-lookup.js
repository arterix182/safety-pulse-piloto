// netlify/functions/gmin-lookup.js (CommonJS)
// Looks up GMID/GMIn directory record from Supabase.
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Table expected: gmin_directory
// Query: ?gmin=530447361
function json(statusCode, obj) {
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
  try {
    const gmin = (event.queryStringParameters?.gmin || "").trim();
    if (!gmin) return json(400, { ok: false, error: "missing_gmin" });

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      return json(501, { ok: false, error: "supabase_not_configured" });
    }

    // REST query
    const endpoint = `${url}/rest/v1/gmin_directory?gmin=eq.${encodeURIComponent(gmin)}&select=gmin,manager,area,turno,linea,tripulacion,planta,antiguedad`;
    const r = await fetch(endpoint, {
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Accept": "application/json",
      },
    });

    const data = await r.json().catch(() => null);
    if (!r.ok) return json(r.status, { ok: false, error: "supabase_error", detail: data });

    const rec = Array.isArray(data) ? data[0] : null;
    if (!rec) return json(404, { ok: false, error: "not_found" });

    return json(200, { ok: true, record: rec });
  } catch (err) {
    return json(500, { ok: false, error: "lookup_failed", detail: String(err?.message || err) });
  }
};
