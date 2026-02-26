import { json } from "./_shared.js";

export async function handler(event){
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: {"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type"}, body: "" };
  return json(200, { ok:true, service:"securito-cloud", version:"v40" });
}
