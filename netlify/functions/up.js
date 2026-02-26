// Compatibility alias: some frontends call /.netlify/functions/up?gmin=...
module.exports.handler = async (event, context) => {
  const fn = require('./gmin-lookup');
  return fn.handler(event, context);
};
