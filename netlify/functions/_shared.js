const { createClient } = require("@supabase/supabase-js");

function cors(){
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type, authorization"
  };
}

function json(statusCode, body){
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8", ...cors() },
    body: JSON.stringify(body)
  };
}

function requireEnv(name){
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function supa(){
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function pickQueryParam(qs, key, fallback=""){
  try{ return (qs?.[key] ?? fallback).toString(); }catch{ return fallback; }
}

module.exports = { cors, json, requireEnv, supa, pickQueryParam };
