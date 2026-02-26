const { ok, bad, sbFetch, isOptions, readJson } = require('./_shared');

exports.handler = async (event) => {
  if (isOptions(event)) return ok({ ok: true });
  if (event.httpMethod !== 'POST') return bad(405, 'Method not allowed');

  try {
    const body = readJson(event);
    if (!body) return bad(400, 'Invalid JSON');

    const nowIso = new Date().toISOString();

    // Save as { raw, created_at mirror fields for filtering }
    const row = {
      raw: body,
      type: body.type || null,
      plant: body.plant || null,
      turno: body.turno || null,
      user_gmin: body.user_gmin || null,
      acto_inseguro: body.acto_inseguro || null,
      condicion_insegura: body.condicion_insegura || null,
      created_at: body.createdAt || nowIso,
    };

    const inserted = await sbFetch('incidents', { method: 'POST', body: row });
    const one = Array.isArray(inserted) ? inserted[0] : inserted;

    return ok({ ok: true, id: one?.id || null });
  } catch (e) {
    return bad(e.status || 500, e.message || 'Server error', { details: e.data });
  }
};
