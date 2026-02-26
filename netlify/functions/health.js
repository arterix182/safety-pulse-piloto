// netlify/functions/health.js (CommonJS)
const { json, cors } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  return json(200, { ok: true, service: 'securito-cloud', version: 'v42.3.2' });
};
