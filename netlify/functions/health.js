// netlify/functions/health.js (CommonJS)
// Simple health endpoint to verify functions are alive.
exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      ok: true,
      service: "securito-cloud",
      version: process.env.APP_VERSION || "v42.8.2",
      ts: new Date().toISOString(),
    }),
  };
};
