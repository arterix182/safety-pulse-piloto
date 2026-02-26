// netlify/functions/incidents-list.js (CommonJS)
const { json, cors, supa } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if (event.httpMethod !== 'GET') return json(405, { ok:false, error:'Method not allowed' });

  try {
    const limit = Math.max(1, Math.min(5000, parseInt(event.queryStringParameters?.limit || '2000', 10) || 2000));
    const gmin = (event.queryStringParameters?.gmin || '').toString().trim();

    const client = supa();
    if (!client) return json(200, { ok:true, source:'local', items: [] });

    let q = client.from('incidents').select('*').order('created_at', { ascending: false }).limit(limit);
    if (gmin) q = q.eq('gmin', gmin);
    const { data, error } = await q;
    if (error) return json(200, { ok:false, error: error.message });
    return json(200, { ok:true, items: data || [] });
  } catch (e) {
    return json(200, { ok:false, error:'incidents-list failed', detail: String(e && e.message ? e.message : e) });
  }
};
