// netlify/functions/_shared.js (CommonJS)
// Minimal shared helpers. Keeps dependencies optional (Supabase is optional).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function cors(){
  return { ...corsHeaders };
}

function json(statusCode, body){
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
    body: JSON.stringify(body),
  };
}

function requireEnv(name){
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// Optional Supabase client (only if @supabase/supabase-js is installed).
function supa(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try{
    // eslint-disable-next-line global-require
    const { createClient } = require('@supabase/supabase-js');
    return createClient(url, key, { auth: { persistSession: false } });
  }catch(e){
    return null;
  }
}

module.exports = { cors, json, requireEnv, supa };
