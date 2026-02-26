const { cors, json, supa, pickQueryParam } = require("./_shared.js");
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors(), body: "" };
  if (event.httpMethod !== "GET") return json(405, { ok:false, error:"Use GET" });

  const gmin = pickQueryParam(event.queryStringParameters, "gmin", "").replace(/[^0-9]/g, "");
  if (!gmin) return json(400, { ok:false, found:false, error:"Missing gmin" });

  try{
    const db = supa();
    const { data: row, error } = await db
      .from("gmin_directory")
      .select("gmin,worker,legal_name,work_shift,plant,manager_name,manager_gmin,hire_date,length_of_service_years")
      .eq("gmin", Number(gmin))
      .maybeSingle();
    if (error) return json(500, { ok:false, found:false, error: error.message });
    if (!row) return json(200, { ok:true, found:false });

    const { data: mgr } = await db
      .from("managers")
      .select("gmin,manager,area,turno")
      .eq("gmin", Number(gmin))
      .maybeSingle();

    const name = row.worker || row.legal_name || "";
    return json(200, {
      ok:true,
      found:true,
      person: {
        gmin: String(row.gmin),
        name,
        plant: row.plant || "",
        shift: row.work_shift || "",
        manager: row.manager_name || "",
        manager_gmin: row.manager_gmin ? String(row.manager_gmin) : "",
        hireDate: row.hire_date ? String(row.hire_date) : "",
        lengthOfServiceYears: (row.length_of_service_years ?? null)
      },
      managerMeta: mgr ? { area: mgr.area || "", turno: mgr.turno || "", isManager: true } : { isManager:false }
    });
  }catch(e){
    return json(500, { ok:false, found:false, error: String(e?.message || e) });
  }
}
