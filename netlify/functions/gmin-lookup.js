const { ok, bad, sbFetch, isOptions } = require('./_shared');

// GET /.netlify/functions/gmin-lookup?gmin=530447361
exports.handler = async (event) => {
  if (isOptions(event)) return ok({ ok: true });
  try {
    const gmin = (event.queryStringParameters?.gmin || '').trim();
    if (!gmin) return bad(400, 'Missing gmin');

    // Table: gmin_directory (columns: gmin, manager, area, turno, linea, tripulacion, antiguedad?)
    const rows = await sbFetch('gmin_directory', {
      query: `select=*&gmin=eq.${encodeURIComponent(gmin)}&limit=1`,
    });

    const row = Array.isArray(rows) ? rows[0] : null;
    return ok({ ok: true, data: row || null });
  } catch (e) {
    return bad(e.status || 500, e.message || 'Server error', { details: e.data });
  }
};
