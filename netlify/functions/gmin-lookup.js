// netlify/functions/gmin-lookup.js (CommonJS)
const { json, cors, supa } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if (event.httpMethod !== 'GET') return json(405, { ok:false, error:'Method not allowed' });

  try {
    const gmin = (event.queryStringParameters?.gmin || '').toString().trim();
    if (!gmin) return json(400, { ok:false, error:'Missing gmin' });

    const client = supa();
    if (!client) {
      // Modo local/piloto: sin Supabase, responde vacío sin romper UI.
      return json(200, { ok:true, found:false, source:'local' });
    }

    const { data, error } = await client
      .from('gmin_profiles')
      .select('*')
      .eq('gmin', gmin)
      .maybeSingle();

    if (error) return json(200, { ok:false, error: error.message });
    if (!data) return json(200, { ok:true, found:false });

    return json(200, { ok:true, found:true, profile: data });
  } catch (e) {
    return json(200, { ok:false, error:'Lookup failed', detail: String(e && e.message ? e.message : e) });
  }
};
