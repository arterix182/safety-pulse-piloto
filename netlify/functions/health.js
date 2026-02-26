exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    },
    body: JSON.stringify({ ok: true, service: 'securito-cloud', version: 'v42.9' }),
  };
};
