const { ok, bad, sbFetch, isOptions } = require('./_shared');

function startISO(range){
  const now = new Date();
  const d = new Date(now);
  if (range === 'week') d.setUTCDate(d.getUTCDate() - 7);
  else if (range === 'month') d.setUTCMonth(d.getUTCMonth() - 1);
  else d.setUTCDate(d.getUTCDate() - 1); // day default
  return d.toISOString();
}

function inc(map, key){
  if(!key) return;
  const k = String(key).trim();
  if(!k) return;
  map[k] = (map[k] || 0) + 1;
}

exports.handler = async (event) => {
  if (isOptions(event)) return ok({ ok: true });
  if (event.httpMethod !== 'GET') return bad(405, 'Method not allowed');

  try {
    const range = (event.queryStringParameters?.range || 'day').toLowerCase();
    const from = startISO(range);

    const data = await sbFetch('incidents', {
      query: `select=id,created_at,raw&created_at=gte.${encodeURIComponent(from)}&order=created_at.desc&limit=2000`,
    });

    const acts = {}, conds = {}, areas = {}, turnos = {};
    for (const r of (Array.isArray(data) ? data : [])) {
      const raw = r.raw || {};
      inc(acts, raw.acto_inseguro);
      inc(conds, raw.condicion_insegura);
      inc(areas, raw.area);
      inc(turnos, raw.turno);
    }

    function topN(map, n=8){
      return Object.entries(map)
        .sort((a,b)=>b[1]-a[1])
        .slice(0,n)
        .map(([label,value])=>({ label, value }));
    }

    return ok({
      ok: true,
      range,
      from,
      totals: { records: Array.isArray(data) ? data.length : 0 },
      topActs: topN(acts),
      topConds: topN(conds),
      topAreas: topN(areas),
      topTurnos: topN(turnos),
    });
  } catch (e) {
    return bad(e.status || 500, e.message || 'Server error', { details: e.data });
  }
};
