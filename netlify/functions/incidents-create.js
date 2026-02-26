// netlify/functions/incidents-create.js (CommonJS)
const { json, cors, supa } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return json(405, { ok:false, error:'Method not allowed' });

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const client = supa();
    if (!client) {
      // modo local: no guardamos en nube
      return json(200, { ok:true, saved:false, source:'local' });
    }
    const { data, error } = await client.from('incidents').insert(body).select('*').single();
    if (error) return json(200, { ok:false, error: error.message });
    return json(200, { ok:true, saved:true, incident: data });
  } catch (e) {
    return json(200, { ok:false, error:'incidents-create failed', detail: String(e && e.message ? e.message : e) });
  }
};
