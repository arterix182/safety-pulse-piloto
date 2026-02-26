const { ok, bad, sbFetch, isOptions } = require('./_shared');

function qp(qs, k, d=''){
  const v = qs?.[k];
  return (v === undefined || v === null || v === '') ? d : String(v);
}

exports.handler = async (event) => {
  if (isOptions(event)) return ok({ ok: true });
  if (event.httpMethod !== 'GET') return bad(405, 'Method not allowed');

  try {
    const qs = event.queryStringParameters || {};
    const from = qp(qs,'from','');
    const to = qp(qs,'to','');
    const type = qp(qs,'type','all');
    const plant = qp(qs,'plant','all');
    const turno = qp(qs,'turno','all');
    const user_gmin = qp(qs,'user_gmin','');
    const acto = qp(qs,'acto','all');
    const cond = qp(qs,'cond','all');
    const limit = Math.min(parseInt(qp(qs,'limit','500'),10) || 500, 2000);

    const parts = [];
    parts.push('select=id,created_at,raw');
    parts.push(`order=created_at.desc`);
    parts.push(`limit=${limit}`);

    if (from) parts.push(`created_at=gte.${encodeURIComponent(from + 'T00:00:00Z')}`);
    if (to) parts.push(`created_at=lte.${encodeURIComponent(to + 'T23:59:59Z')}`);
    if (type !== 'all') parts.push(`type=eq.${encodeURIComponent(type)}`);
    if (plant !== 'all') parts.push(`plant=eq.${encodeURIComponent(plant)}`);
    if (turno !== 'all') parts.push(`turno=eq.${encodeURIComponent(turno)}`);
    if (user_gmin) parts.push(`user_gmin=eq.${encodeURIComponent(user_gmin)}`);
    if (acto !== 'all') parts.push(`acto_inseguro=eq.${encodeURIComponent(acto)}`);
    if (cond !== 'all') parts.push(`condicion_insegura=eq.${encodeURIComponent(cond)}`);

    const data = await sbFetch('incidents', { query: parts.join('&') });

    const records = (Array.isArray(data) ? data : []).map(r => ({
      ...(r.raw || {}),
      cloudId: r.id,
      createdAt: (r.raw && r.raw.createdAt) ? r.raw.createdAt : r.created_at,
    }));

    return ok({ ok: true, records });
  } catch (e) {
    return bad(e.status || 500, e.message || 'Server error', { details: e.data });
  }
};
