// netlify/functions/top.js (CommonJS)
// Returns top KPIs for dashboard. If Supabase is not configured, returns empty arrays.

const { json, cors, supa } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if (event.httpMethod !== 'GET') return json(405, { ok:false, error:'Method not allowed' });

  const range = (event.queryStringParameters?.range || 'day').toString();
  const gmin = (event.queryStringParameters?.gmin || '').toString();

  try {
    const client = supa();
    if (!client) {
      return json(200, { ok:true, range, gmin, source:'local', rows: [] });
    }

    // Example table name. If your schema differs, adjust here.
    const { data, error } = await client
      .from('kpi_top')
      .select('*')
      .eq('range', range)
      .maybeSingle();

    if (error) return json(200, { ok:false, error: error.message });
    return json(200, { ok:true, range, gmin, source:'supabase', rows: data ? [data] : [] });
  } catch (e) {
    return json(200, { ok:false, error:'top failed', detail: String(e && e.message ? e.message : e) });
  }
};
