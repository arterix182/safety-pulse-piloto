import { createClient } from "@supabase/supabase-js";

export function cors(){
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type, authorization"
  };
}

export function json(statusCode, body){
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8", ...cors() },
    body: JSON.stringify(body)
  };
}

export function requireEnv(name){
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function supa(){
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export function pickQueryParam(qs, key, fallback=""){
  try{ return (qs?.[key] ?? fallback).toString(); }catch{ return fallback; }
}
