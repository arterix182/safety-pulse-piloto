const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const VIEWS = {
  welcome: $("#viewWelcome"),
  login: $("#viewLogin"),
  home: $("#viewHome"),
  form: $("#viewForm"),
  dashboard: $("#viewDashboard"),
  manual: $("#viewManual"),
  securito: $("#viewSecurito")
};

const state = {
  directory: null,
  actos: [],
  condiciones: [],
  user: null,
  formType: "recorrido", // or "interaccion"
  hazardMode: "acto" // 'acto' or 'cond'
};

// --------------------- IndexedDB (tiny wrapper)
const DB_NAME = "safety_pulse_db";
const DB_VER = 1;

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("records")){
        const store = db.createObjectStore("records", { keyPath: "id" });
        store.createIndex("byType", "type", { unique:false });
        store.createIndex("byUserGmin", "user.gmin", { unique:false });
        store.createIndex("byCreatedAt", "createdAt", { unique:false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPutRecord(rec){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records","readwrite");
    tx.objectStore("records").put(rec);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function dbGetAll(){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records","readonly");
    const req = tx.objectStore("records").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbClear(){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records","readwrite");
    tx.objectStore("records").clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

// --------------------- Utils
function nowISO(){
  return new Date().toISOString();
}

function deriveTurnoLinea(manager, fallbackShift, fallbackLine){
  const m = (manager || "").toString().trim().toLowerCase();
  // Reglas piloto (puedes expandir un catálogo de managers -> línea/turno)
  if (m.includes("arturo ampudia pacheco") || m.includes("arturo ampudia")){
    return { turno: "Tripulación A", linea: "Chasis 1" };
  }
  return { turno: (fallbackShift || ""), linea: (fallbackLine || "") };
}


function fmtDT(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString("es-MX", {year:"numeric", month:"short", day:"2-digit", hour:"2-digit", minute:"2-digit"});
  }catch{return iso}
}
function safe(s){ return (s ?? "").toString().trim(); }

function losLabel(person){
  const yrs = person?.lengthOfServiceYears;
  const hire = person?.hireDate;
  if (typeof yrs === "number" && !Number.isNaN(yrs)){
    const y = Math.round(yrs*100)/100;
    if (hire) return `${y} años (desde ${hire})`;
    return `${y} años`;
  }
  if (hire) return `Desde ${hire}`;
  return "—";
}

function setView(name){
  Object.values(VIEWS).forEach(v => v.classList.remove("active"));
  VIEWS[name].classList.add("active");
  // Securito free conversation mode only inside its view
  __secFreeMode = (name === "securito");
  if (!__secFreeMode){ try{ stopListening(); }catch(e){} }

  // bottom bar active
  $$(".navbtn").forEach(b => b.classList.remove("active"));
  const map = {home:"home", dashboard:"dashboard", manual:"manual", securito:"securito"};
  if (map[name]) $(`.navbtn[data-nav="${map[name]}"]`)?.classList.add("active");
  // show/hide actions
  const logged = !!state.user;
  $("#exportBtn").style.display = logged ? "" : "none";
  $("#logoutBtn").style.display = logged ? "" : "none";
}

function toast(el, msg, good=false){
  el.textContent = msg;
  el.style.color = good ? "rgba(34,197,94,.95)" : "rgba(231,238,252,.82)";
}

// --------------------- Data loading
async function loadJSON(path){
  const res = await fetch(path, {cache:"no-store"});
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  return await res.json();
}

async function boot(){
  // SW
  if ("serviceWorker" in navigator){
    try{ await navigator.serviceWorker.register("./sw.js"); }catch{}
  }

  try{
    const dir = await loadJSON("./data/directory.json");
    state.directory = dir;
      }catch(e){
      }

  try{ state.actos = await loadJSON("./data/actos.json"); }catch{ state.actos=[]; }
  try{ state.condiciones = await loadJSON("./data/condiciones.json"); }catch{ state.condiciones=[]; }

  // restore session
  const saved = localStorage.getItem("sp_user");
  if (saved){
    try{ state.user = JSON.parse(saved); }catch{}
  }
  if (state.user){
    await refreshHomeKPIs();
    renderUserHeader();
    setView("home");
  }else{
    setView("welcome");
  }
}

function dirLookup(gmin){
  const g = safe(gmin);
  return state.directory?.byGmin?.[g] || null;
}

// --------------------- Login
$("#goLogin").addEventListener("click", () => setView("login"));
$("#backWelcome").addEventListener("click", () => setView("welcome"));

$("#loginBtn").addEventListener("click", async () => {
  const gmin = safe($("#gminInput").value);
  const msg = $("#loginMsg");
  if (!gmin) return toast(msg, "Ingresa tu GMIN.");
  const person = dirLookup(gmin);
  if (!person) return toast(msg, "GMIN no encontrado en el directorio. Verifica o solicita alta.");
  // Save user session
  state.user = {
    gmin: person.gmin,
    name: person.name,
    plant: person.plant,
    org: person.org,
    manager: person.manager,
    shift: person.shift,
    line: ""
  };

  // Reglas piloto (personalizadas)
  if ((state.user.manager || "").trim().toLowerCase() === "arturo ampudia"){
    state.user.shift = "Tripulación A";
    state.user.line = "Chasis 1";
  }
  localStorage.setItem("sp_user", JSON.stringify(state.user));
  toast(msg, "Listo. Bienvenido.", true);
  renderUserHeader();
  await refreshHomeKPIs();
  setView("home");
});

function logout(){
  state.user = null;
  localStorage.removeItem("sp_user");
  $("#gminInput").value = "";
  $("#loginMsg").textContent = "";
  setView("welcome");
}
$("#logoutBtn").addEventListener("click", logout);

// Brand click to home
$("#brandBtn").addEventListener("click", () => {
  if (state.user) setView("home");
  else setView("welcome");
});

// --------------------- Home
function renderUserHeader(){
  const u = state.user;
  $("#userBadge").textContent = `${u.gmin} • ${u.plant || "Plant —"}`;
  $("#hello").textContent = `Hola, ${u.name}`;
  const meta = [
    u.org ? `Org: ${u.org}` : null,
    u.manager ? `Manager: ${u.manager}` : null,
    u.shift ? `Shift: ${u.shift}` : null
  ].filter(Boolean).join(" • ");
  $("#userMeta").textContent = meta || "—";
}

async function refreshHomeKPIs(){
  const all = await dbGetAll();
  const rec = all.filter(r => r.type === "recorrido").length;
  const inter = all.filter(r => r.type === "interaccion").length;
  $("#kpiRec").textContent = rec;
  $("#kpiInt").textContent = inter;
}

// tiles nav
$$(".tile").forEach(btn => btn.addEventListener("click", () => {
  const go = btn.getAttribute("data-go");
  nav(go);
}));
$("#quickRecord").addEventListener("click", () => nav("recorrido"));

// bottom nav
$$(".navbtn").forEach(btn => btn.addEventListener("click", () => {
  nav(btn.getAttribute("data-nav"));
}));

function nav(target){
  if (!state.user){
    setView("login");
    return;
  }
  if (target === "home") return setView("home");
  if (target === "dashboard") return openDashboard();
  if (target === "manual") return setView("manual");
  if (target === "recorrido") return openForm("recorrido");
  if (target === "interaccion") return openForm("interaccion");
  if (target === "securito") return openSecurito();
}

// --------------------- Form
const formEls = {
  title: $("#formTitle"),
  pill: $("#formTypePill"),
  auditedGmin: $("#auditedGmin"),
  autoLine: $("#autoLine"),
  autoShift: $("#autoShift"),
  auditedName: $("#auditedName"),
  auditedPlant: $("#auditedPlant"),
  auditedLos: $("#auditedLos"),
  auditedMgr: $("#auditedMgr"),
  actoWrap: $("#actoWrap"),
  condWrap: $("#condWrap"),
  pickActo: $("#pickActo"),
  pickCond: $("#pickCond"),
  actoInput: $("#actoInput"),
  actoCombo: $("#actoCombo"),
  condInput: $("#condInput"),
  condCombo: $("#condCombo"),
  comment: $("#commentInput"),
  saveMsg: $("#saveMsg"),
};

function openForm(type){
  state.formType = type;
  state.hazardMode = "acto";
  formEls.title.textContent = type === "recorrido" ? "Recorrido de seguridad" : "Interacciones de seguridad";
  formEls.pill.textContent = type === "recorrido" ? "RECORRIDO" : "INTERACCIÓN";
  formEls.autoLine.textContent = (state.audited?.linea || "—");
  formEls.autoShift.textContent = (state.audited?.turno || "—");
formEls.auditedGmin.value = "";
  formEls.auditedName.textContent = "—";
  formEls.auditedPlant.textContent = "—";
  formEls.auditedLos.textContent = "—";
  formEls.auditedMgr.textContent = "—";
  formEls.actoInput.value = "";
  formEls.condInput.value = "";
  // default selection: Acto
  formEls.actoWrap.style.display = "block";
  formEls.condWrap.style.display = "none";
  formEls.pickActo.classList.add("active");
  formEls.pickCond.classList.remove("active");
  formEls.comment.value = "";
  formEls.saveMsg.textContent = "";
  setView("form");
}

$("#formBack").addEventListener("click", () => setView("home"));

// Toggle Acto vs Condición (solo una a la vez)
formEls.pickActo.addEventListener("click", () => {
  state.hazardMode = "acto";
  formEls.actoWrap.style.display = "block";
  formEls.condWrap.style.display = "none";
  formEls.pickActo.classList.add("active");
  formEls.pickCond.classList.remove("active");
  formEls.condInput.value = "";
  formEls.condCombo.classList.remove("show");
  formEls.saveMsg.textContent = "";
});
formEls.pickCond.addEventListener("click", () => {
  state.hazardMode = "cond";
  formEls.actoWrap.style.display = "none";
  formEls.condWrap.style.display = "block";
  formEls.pickCond.classList.add("active");
  formEls.pickActo.classList.remove("active");
  formEls.actoInput.value = "";
  formEls.actoCombo.classList.remove("show");
  formEls.saveMsg.textContent = "";
});


function renderCombo(comboEl, items, onPick){
  comboEl.innerHTML = "";
  if (!items.length){
    comboEl.classList.remove("show");
    return;
  }
  items.slice(0, 40).forEach(it => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = it;
    b.addEventListener("click", () => onPick(it));
    comboEl.appendChild(b);
  });
  comboEl.classList.add("show");
}

function filterList(list, q){
  const s = safe(q).toLowerCase();
  if (!s) return list;
  return list.filter(x => x.toLowerCase().includes(s));
}

formEls.actoInput.addEventListener("input", () => {
  const items = filterList(state.actos, formEls.actoInput.value);
  renderCombo(formEls.actoCombo, items, (pick) => {
    formEls.actoInput.value = pick;
    formEls.actoCombo.classList.remove("show");
  });
});

formEls.condInput.addEventListener("input", () => {
  const items = filterList(state.condiciones, formEls.condInput.value);
  renderCombo(formEls.condCombo, items, (pick) => {
    formEls.condInput.value = pick;
    formEls.condCombo.classList.remove("show");
  });
});

// audited lookup
formEls.auditedGmin.addEventListener("input", () => {
  const g = safe(formEls.auditedGmin.value);
  const p = g ? dirLookup(g) : null;
  if (!p){
    state.audited = null;
    formEls.auditedName.textContent = g ? "No encontrado" : "—";
    formEls.auditedPlant.textContent = "—";
    formEls.auditedLos.textContent = "—";
    formEls.auditedMgr.textContent = "—";
    formEls.autoLine.textContent = "—";
    formEls.autoShift.textContent = "—";
    return;
  }

  // Guardar perfil auditado en estado (para que se vaya al registro)
  state.audited = {
    gmin: p.gmin,
    name: p.name,
    plant: p.plant || "",
    org: p.org || "",
    manager: p.manager || "",
    shift: p.shift || "",
    turno: "",
    linea: ""
  };

  const fallbackLine = (p.org || p.costCenter || "");
  const tl = deriveTurnoLinea(state.audited.manager, p.shift, fallbackLine);
  state.audited.turno = tl.turno || p.shift || "";
  state.audited.linea = tl.linea || "";

  formEls.auditedName.textContent = p.name;
  formEls.auditedPlant.textContent = p.plant || "—";
  formEls.auditedLos.textContent = losLabel(p);
  formEls.auditedMgr.textContent = p.manager || "—";
  formEls.autoLine.textContent = state.audited.linea || "—";
  formEls.autoShift.textContent = state.audited.turno || "—";
});

async function saveRecord(andNew=false){
  const msg = formEls.saveMsg;
  const audited = safe(formEls.auditedGmin.value);
  if (!audited) return toast(msg, "Falta GMIN auditado.");
  const auditedPerson = dirLookup(audited);
  if (!auditedPerson) return toast(msg, "GMIN auditado no existe en directorio.");
  const acto = safe(formEls.actoInput.value);
  const cond = safe(formEls.condInput.value);

  // Solo una selección: Acto o Condición
  if (state.hazardMode === "acto"){
    if (!acto) return toast(msg, "Selecciona Acto inseguro.");
  } else {
    if (!cond) return toast(msg, "Selecciona Condición insegura.");
  }

  const createdAt = nowISO();
  const tl2 = deriveTurnoLinea(state.audited?.manager || state.audited?.mgr || state.audited?.managerName || state.audited?.manager, state.audited?.shift);
  if (state.audited){ state.audited.turno = tl2.turno || state.audited.turno || ""; state.audited.linea = tl2.linea || state.audited.linea || ""; }
  const rec = {
    id: `${createdAt}_${Math.random().toString(16).slice(2)}`,
    type: state.formType,
    createdAt,
    user: {...state.user},
    audited: {
      gmin: auditedPerson.gmin,
      name: auditedPerson.name,
      plant: auditedPerson.plant,
      manager: auditedPerson.manager,
      managerGmin: auditedPerson.managerGmin,
      lengthOfServiceYears: auditedPerson.lengthOfServiceYears,
      hireDate: auditedPerson.hireDate
    },
    hazardMode: state.hazardMode,
    findings: { acto: state.hazardMode === "acto" ? acto : "", condicion: state.hazardMode === "cond" ? cond : "" },
    comment: safe(formEls.comment.value)
  };

  await dbPutRecord(rec);
  toast(msg, "Guardado. Quedó asociado a tu usuario.", true);
  await refreshHomeKPIs();

  if (andNew){
    openForm(state.formType);
  }else{
    setView("home");
  }
}

$("#saveBtn").addEventListener("click", () => saveRecord(false));
$("#saveNewBtn").addEventListener("click", () => saveRecord(true));

// --------------------- Dashboard
$("#dashBack").addEventListener("click", () => setView("home"));
$("#manualBack").addEventListener("click", () => setView("home"));

async function openDashboard(){
  const all = await dbGetAll();

  // Build filter option lists (from data + records)
  const plants = Array.from(new Set(all.map(r => r.audited?.plant).filter(Boolean))).sort();
  const shifts = Array.from(new Set(all.map(r => (r.audited?.turno || "")).filter(Boolean))).sort();

  const fPlant = $("#fPlant");
  const fShift = $("#fShift");
  const fActo = $("#fActo");
  const fCond = $("#fCond");

  if (fPlant && fPlant.options.length <= 1){
    for (const p of plants){
      const o = document.createElement("option"); o.value = p; o.textContent = p; fPlant.appendChild(o);
    }
  }
  if (fShift && fShift.options.length <= 1){
    for (const s of shifts){
      const o = document.createElement("option"); o.value = s; o.textContent = s; fShift.appendChild(o);
    }
  }
  if (fActo && fActo.options.length <= 1){
    for (const a of state.actos){
      const o = document.createElement("option"); o.value = a; o.textContent = a; fActo.appendChild(o);
    }
  }
  if (fCond && fCond.options.length <= 1){
    for (const c of state.condiciones){
      const o = document.createElement("option"); o.value = c; o.textContent = c; fCond.appendChild(o);
    }
  }

  const apply = () => {
    const type = $("#fType")?.value || "all";
    const from = $("#fFrom")?.value || "";
    const to = $("#fTo")?.value || "";
    const plant = $("#fPlant")?.value || "all";
    const shift = $("#fShift")?.value || "all";
    const user = safe($("#fUser")?.value || "");
    const acto = $("#fActo")?.value || "all";
    const cond = $("#fCond")?.value || "all";

    const fromT = from ? new Date(from + "T00:00:00").getTime() : -Infinity;
    const toT = to ? new Date(to + "T23:59:59").getTime() : Infinity;

    const filtered = all.filter(r => {
      if (type !== "all" && r.type !== type) return false;
      const t = new Date(r.createdAt).getTime();
      if (t < fromT || t > toT) return false;
      if (plant !== "all" && (r.audited?.plant || "") !== plant) return false;
      if (shift !== "all" && ((r.audited?.turno || "") !== shift)) return false;
      if (user && (r.user?.gmin || "") !== user) return false;
      if (acto !== "all" && (r.findings?.acto || "") !== acto) return false;
      if (cond !== "all" && (r.findings?.condicion || "") !== cond) return false;
      return true;
    });

    $("#dbTotal").textContent = filtered.length;

    const countBy = (keyFn) => {
      const mm = new Map();
      for (const r of filtered){
        const k = keyFn(r);
        if (!k) continue;
        mm.set(k, (mm.get(k) || 0) + 1);
      }
      return mm;
    };
    const topOf = (mm) => {
      let best = null, bestV = -1;
      for (const [k,v] of mm.entries()){
        if (v > bestV){ bestV=v; best=k; }
      }
      return best || "—";
    };

    $("#dbActoTop").textContent = topOf(countBy(r => r.findings?.acto));
    $("#dbCondTop").textContent = topOf(countBy(r => r.findings?.condicion));

    renderRecent(filtered);
    drawAllCharts(filtered);
  };

  $("#applyFilters")?.addEventListener("click", apply);

  apply();
  setView("dashboard");
}

function renderRecent(records){
  const recent = records.slice().sort((a,b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 12);
  const list = $("#recentList");
  list.innerHTML = "";
  if (!recent.length){
    list.innerHTML = `<div class="item"><div class="itemTitle">Sin registros con estos filtros</div><div class="itemMeta">Ajusta filtros o registra nuevos eventos.</div></div>`;
    return;
  }
  for (const r of recent){
    const div = document.createElement("div");
    div.className = "item";
    const acto = r.findings?.acto ? `Acto: <b>${r.findings.acto}</b>` : "";
    const cond = r.findings?.condicion ? `Condición: <b>${r.findings.condicion}</b>` : "";
    const mid = [acto, cond].filter(Boolean).join(" • ");
    div.innerHTML = `
      <div class="itemTop">
        <div class="itemTitle">${r.type === "recorrido" ? "🛡️ Recorrido" : "🤝 Interacción"} • ${r.audited?.name || "—"}</div>
        <div class="itemMeta">${fmtDT(r.createdAt)}</div>
      </div>
      <div class="itemMeta">${mid || "—"}</div>
      <div class="itemMeta">Registró: ${r.user?.name || "—"} (${r.user?.gmin || "—"}) • Turno: ${(r.audited?.turno || r.user?.shift) || "—"} • Línea: ${(r.audited?.linea || r.user?.line) || "—"} • Plant auditado: ${r.audited?.plant || "—"}</div>
    `;
    list.appendChild(div);
  }
}

// ---- Tiny charts (no libs)
function drawBar(canvasId, labels, values){
  const c = document.getElementById(canvasId);
  if (!c) return;
  const ctx = c.getContext("2d");
  const w = c.width = c.clientWidth * devicePixelRatio;
  const h0 = (c.getAttribute("height") ? parseInt(c.getAttribute("height")) : 300);
  const h = c.height = h0 * devicePixelRatio;
  ctx.clearRect(0,0,w,h);

  const padL = 22*devicePixelRatio;
  const padR = 14*devicePixelRatio;
  const padT = 14*devicePixelRatio;
  const padB = 130*devicePixelRatio; // more room so labels never cut
  const maxV = Math.max(1, ...values);
  const n = Math.max(1, values.length);
  const barW = (w - padL - padR) / n;

  // baseline
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "rgba(9,16,31,.55)";
  ctx.lineWidth = 1*devicePixelRatio;
  ctx.beginPath();
  ctx.moveTo(padL, h-padB);
  ctx.lineTo(w-padR, h-padB);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // If too many bars, skip some labels; otherwise show all
  let step = 1;
  if (n > 10){
    const maxLabels = Math.max(4, Math.floor((w/devicePixelRatio) / 90));
    step = Math.max(1, Math.ceil(n / maxLabels));
  }

  const wrap2 = (text) => {
    const t = (text || "").trim();
    if (!t) return ["", ""];
    const parts = t.split(" ");
    if (parts.length === 1) return [t, ""];
    const mid = Math.ceil(parts.length/2);
    return [parts.slice(0, mid).join(" "), parts.slice(mid).join(" ")];
  };

  // Dynamic label font size based on max label length
  const maxLen = Math.max(1, ...labels.map(s => (s||"").length));
  const labelPx = Math.max(9, Math.min(12, Math.round(12 - (maxLen>18 ? 2 : maxLen>14 ? 1 : 0))));
  const labelFont = `${labelPx*devicePixelRatio}px system-ui`;

  for (let i=0;i<n;i++){
    const v = values[i] || 0;
    const bh = (h - padT - padB) * (v / maxV);
    const x = padL + i*barW + barW*0.12;
    const y = (h - padB) - bh;
    const bw = barW*0.76;

    // bar
    ctx.fillStyle = "rgba(9,16,31,.82)";
    ctx.fillRect(x, y, bw, bh);

    // value
    ctx.fillStyle = "rgba(9,16,31,.92)";
    ctx.font = `${12*devicePixelRatio}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(String(v), x + bw/2, y - (6*devicePixelRatio));

    // label
    if (i % step === 0){
      const raw = labels[i] || "";
      const [l1, l2] = wrap2(raw);

      ctx.fillStyle = "rgba(9,16,31,.92)";
      ctx.font = labelFont;
      const lx = x + bw/2;
      const ly = h - (28*devicePixelRatio);

      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(-Math.PI/6); // -30°
      ctx.textAlign = "center";
      ctx.fillText(l1, 0, 0);
      if (l2) ctx.fillText(l2, 0, 14*devicePixelRatio);
      ctx.restore();
    }
  }
}

function drawTrend(canvasId, daily){
  const c = document.getElementById(canvasId);
  if (!c) return;
  const ctx = c.getContext("2d");
  const w = c.width = c.clientWidth * devicePixelRatio;
  const h0 = (c.getAttribute("height") ? parseInt(c.getAttribute("height")) : 180);
  const h = c.height = h0 * devicePixelRatio;
  ctx.clearRect(0,0,w,h);

  const padL = 18*devicePixelRatio;
  const padR = 12*devicePixelRatio;
  const padT = 12*devicePixelRatio;
  const padB = 34*devicePixelRatio;

  const labels = daily.map(d => d.day);
  const values = daily.map(d => d.count);
  const maxV = Math.max(1, ...values);

  // grid
  ctx.strokeStyle = "rgba(9,16,31,.20)";
  ctx.lineWidth = 1*devicePixelRatio;
  for (let i=0;i<4;i++){
    const y = padT + i*(h-padT-padB)/3;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w-padR, y);
    ctx.stroke();
  }

  // line
  ctx.strokeStyle = "rgba(9,16,31,.85)";
  ctx.lineWidth = 2.2*devicePixelRatio;
  ctx.beginPath();
  values.forEach((v,i) => {
    const x = padL + i*(w-padL-padR)/Math.max(1, values.length-1);
    const y = (h-padB) - (h-padT-padB)*(v/maxV);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // dots
  ctx.fillStyle = "rgba(9,16,31,.85)";
  values.forEach((v,i) => {
    const x = padL + i*(w-padL-padR)/Math.max(1, values.length-1);
    const y = (h-padB) - (h-padT-padB)*(v/maxV);
    ctx.beginPath(); ctx.arc(x,y,3.2*devicePixelRatio,0,Math.PI*2); ctx.fill();
  });

  // labels density control
  const maxLabels = Math.max(4, Math.floor((w/devicePixelRatio) / 70));
  const step = Math.max(1, Math.ceil(labels.length / maxLabels));

  ctx.fillStyle = "rgba(9,16,31,.92)";
  ctx.font = `${11*devicePixelRatio}px system-ui`;
  ctx.textAlign = "center";
  labels.forEach((lab,i) => {
    if (i % step !== 0) return;
    const x = padL + i*(w-padL-padR)/Math.max(1, labels.length-1);
    ctx.fillText(lab, x, h - (10*devicePixelRatio));
  });
}

function topN(mm, n=6){
  return Array.from(mm.entries()).sort((a,b) => b[1]-a[1]).slice(0,n);
}

function drawAllCharts(records){
const mA = new Map();
  const mC = new Map();
  for (const r of records){
    const a = r.findings?.acto || "";
    const c = r.findings?.condicion || "";
    if (a) mA.set(a, (mA.get(a)||0)+1);
    if (c) mC.set(c, (mC.get(c)||0)+1);
  }
  const topA = topN(mA, 6);
  const topC = topN(mC, 6);

  drawBar("chartActos", topA.map(x=>x[0]), topA.map(x=>x[1]));
  drawBar("chartConds", topC.map(x=>x[0]), topC.map(x=>x[1]));
}


$("#wipeBtn").addEventListener("click", async () => {
  await dbClear();
  $("#wipeMsg").textContent = "Datos del piloto borrados.";
  await refreshHomeKPIs();
  await openDashboard();
});

// --------------------- Export CSV
function csvEscape(v){
  const s = (v ?? "").toString();
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"','""')}"`;
  return s;
}

async function exportCSV(){
  const all = await dbGetAll();
  const cols = [
    "createdAt","type",
    "userGmin","userName","userPlant","userManager",
    "auditedGmin","auditedName","auditedPlant","auditedManager",
    "acto","condicion","comment"
  ];
  const rows = [cols.join(",")];
  for (const r of all){
    const row = [
      r.createdAt, r.type,
      r.user?.gmin, r.user?.name, r.user?.plant, r.user?.manager,
      r.audited?.gmin, r.audited?.name, r.audited?.plant, r.audited?.manager,
      r.findings?.acto, r.findings?.condicion, r.comment
    ].map(csvEscape).join(",");
    rows.push(row);
  }
  const csv = rows.join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `safety_pulse_export_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
$("#exportBtn").addEventListener("click", exportCSV);

// --------------------- Init
boot();


// --- Securito (offline playbook) ---
let securitoPlaybook = null;

async function loadSecuritoPlaybook(){
  if (securitoPlaybook) return securitoPlaybook;
  try{
    const r = await fetch("./data/securito_playbook.json");
    securitoPlaybook = await r.json();
  }catch(e){
    securitoPlaybook = {};
  }
  return securitoPlaybook;
}

function topContextFromRecords(records){
  const acts = {};
  const conds = {};
  records.forEach(r=>{
    if (r.acto) acts[r.acto] = (acts[r.acto]||0)+1;
    if (r.condicion) conds[r.condicion] = (conds[r.condicion]||0)+1;
  });
  const topA = Object.entries(acts).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const topC = Object.entries(conds).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const fmt = (arr)=> arr.length ? arr.map(([k,v])=>`• ${k}: ${v}`).join("\n") : "—";
  return { topA, topC, text: `Top Actos:\n${fmt(topA)}\n\nTop Condiciones:\n${fmt(topC)}` };
}

function secLog(who, txt){
  const log = document.getElementById("secLog");
  if (!log) return;
  const row = document.createElement("div");
  row.className = "msg";
  row.innerHTML = `<div class="who">${who}</div><div class="txt"></div>`;
  row.querySelector(".txt").textContent = txt;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

async function securitoAnswer(question, records){
  const pb = await loadSecuritoPlaybook();
  const ctx = topContextFromRecords(records);
  const q = (question||"").toLowerCase();

  // Try to match a known hallazgo keyword
  const keys = Object.keys(pb);
  const hit = keys.find(k => q.includes(k.toLowerCase())) || (ctx.topA[0]?.[0] || null);

  if (!hit){
    return `Necesito más datos.\n\n${ctx.text}\n\nDime cuál hallazgo quieres atacar (ej: 'uso de celular', 'casco de seguridad') y el objetivo (reducir %, semana, área).`;
  }

  const item = pb[hit] || {};
  const camp = item["campaña"] || `Campaña enfocada a: ${hit}`;
  const acciones = (item["acciones"]||[]).map(x=>`- ${x}`).join("\n") || "- Observación dirigida + plática corta + refuerzo visual.";
  const contra = (item["contramedidas"]||[]).map(x=>`- ${x}`).join("\n") || "- Estandarizar método + poka-yoke.";

  return `Objetivo sugerido: Reducir '${hit}' en 30% en 2 semanas.\n\nCampaña: ${camp}\n\nAcciones (rápidas):\n${acciones}\n\nContramedidas (raíz):\n${contra}\n\nContexto actual:\n${ctx.text}`;
}

async function openSecurito(){
  __secFreeMode = true;
  __secActiveUntil = Date.now() + 3600*1000; // keep window alive while inside view

  setView("securito");
  const all = await dbGetAll();
  const ctx = topContextFromRecords(all);
  const box = document.getElementById("secTopContext");
  if (box) box.textContent = ctx.text;
  const log = document.getElementById("secLog");
  if (log && !log.dataset.init){
    log.dataset.init = "1";
    secLog("Securito", "Estoy listo. Dime el hallazgo y tu objetivo. Te doy campaña, acciones y contramedidas.");
  }

  // Start natural idle blink
  try{ startSecuritoBlink(); }catch(e){}
  // Auto-listen when entering Securito (no button needed)
  try{ enableSecuritoAutoListen(true); }catch(e){}
}


document.addEventListener("click", (e)=>{
  const t = e.target;
  if (!t) return;
  if (t.id === "secRefresh"){
    const all = loadRecords();
    const ctx = topContextFromRecords(all);
    const box = document.getElementById("secTopContext");
    if (box) box.textContent = ctx.text;
  }
  if (t.id === "secSend"){
    const inp = document.getElementById("secInput");
    const q = inp ? inp.value.trim() : "";
    if (!q) return;
    if (inp) inp.value = "";
    sendToSecurito(q);
  }
});

document.addEventListener("keydown", (e)=>{
  if (e.key !== "Enter") return;
  const inp = document.getElementById("secInput");
  if (document.activeElement === inp){
    const btn = document.getElementById("secSend");
    if (btn) btn.click();
  }
});


function speak(text, anime=true){
  try{
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.onstart = ()=>toggleSecuritoTalking(true);
    u.onend = ()=>toggleSecuritoTalking(false);
    u.onerror = ()=>toggleSecuritoTalking(false);
    u.lang = "es-MX";
    u.rate = anime ? 1.08 : 1.0;
    u.pitch = anime ? 1.2 : 1.0;
    // Try to pick a Spanish voice if available
    const voices = speechSynthesis.getVoices();
    const v = voices.find(v=>/es/i.test(v.lang)) || voices[0];
    if (v) u.voice = v;
    speechSynthesis.cancel();
    toggleSecuritoTalking(false);
    speechSynthesis.speak(u);
  }catch(e){}
}

document.addEventListener("click", (e)=>{
  const t = e.target;
  if (t && t.id === "hdrSecurito"){
    openSecurito();
  }
});

// --- Securito UI actions (async DB) ---
async function refreshSecuritoContext(){
  const all = await dbGetAll();
  const ctx = topContextFromRecords(all);
  const box = document.getElementById("secTopContext");
  if (box) box.textContent = ctx.text;
  return {all, ctx};
}


let __secActiveUntil = 0;         // conversation window after wake-word
let __secLastUserAt = 0;
let __secFreeMode = false;      // if true, respond without wake-word (inside Securito view)


function __norm(t){
  return String(t||"")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9\s]/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function __lev(a,b){
  a=__norm(a); b=__norm(b);
  const n=a.length, m=b.length;
  if (!n) return m; if (!m) return n;
  const dp = new Array(m+1);
  for (let j=0;j<=m;j++) dp[j]=j;
  for (let i=1;i<=n;i++){
    let prev=dp[0]; dp[0]=i;
    for (let j=1;j<=m;j++){
      const tmp=dp[j];
      const cost = a[i-1]===b[j-1] ? 0 : 1;
      dp[j]=Math.min(dp[j]+1, dp[j-1]+1, prev+cost);
      prev=tmp;
    }
  }
  return dp[m];
}
function __sim(a,b){
  const A=__norm(a), B=__norm(b);
  const L=Math.max(A.length,B.length)||1;
  return 1-(__lev(A,B)/L);
}
function __canon(tok){
  // light phonetic-ish normalization for Spanish/EN ASR weirdness
  const t = __norm(tok)
    .replace(/h/g,"")
    .replace(/[cqk]/g,"k")
    .replace(/[vw]/g,"b")
    .replace(/z/g,"s")
    .replace(/x/g,"ks")
    .replace(/rr/g,"r");
  // remove vowels to compare consonant skeleton
  return t.replace(/[aeiou]/g,"");
}
function __wakeScoreToken(tok){
  const trg = ["securito","segurito","security","sekurito","sekurity"];
  let best = 0;
  for (const w of trg){
    best = Math.max(best, __sim(tok,w), __sim(__canon(tok), __canon(w)));
  }
  return best;
}

function __hasWake(raw){
  const t = __norm(raw);
  if (!t) return false;

  if (t.includes("securito") || t.includes("segurito") || t.includes("security")) return true;

  const tokens = t.split(" ").filter(Boolean);

  let best = 0;
  for (let i=0;i<tokens.length;i++){
    best = Math.max(best, __wakeScoreToken(tokens[i]));
    if (i < tokens.length-1){
      best = Math.max(best, __wakeScoreToken(tokens[i] + tokens[i+1]));
    }
  }
  return best >= 0.70;
}
function __stripWake(raw){
  const t = __norm(raw);
  const parts = t.split(" ").filter(Boolean);
  if (!parts.length) return "";

  let bestI = -1, bestLen = 1, bestS = 0;
  for (let i=0;i<parts.length;i++){
    const s1 = __wakeScoreToken(parts[i]);
    if (s1 > bestS){ bestS=s1; bestI=i; bestLen=1; }
    if (i < parts.length-1){
      const bi = parts[i] + parts[i+1];
      const s2 = __wakeScoreToken(bi);
      if (s2 > bestS){ bestS=s2; bestI=i; bestLen=2; }
    }
  }

  if (bestS >= 0.70 && bestI >= 0){
    const rest = parts.slice(0, bestI).concat(parts.slice(bestI+bestLen));
    return rest.join(" ").trim();
  }

  return raw.replace(/^securito\b[\s,:-]*/i,"").trim();
}

async function sendToSecurito(q, opts={}){
  if (!q) return;
  const raw = String(q).trim();
  const now = Date.now();

  const woke = __hasWake(raw);
  const inWindow = now < __secActiveUntil;

  // If no wake and not in active window, ignore (but don't spam hints for partial ASR)
  if (!__secFreeMode && !woke && !inWindow){
    if (!opts.silentHint){
      secLog("Securito", "Para activarme di: **SECURITO** + tu solicitud. Ej: \"SECURITO campaña uso de casco\".");
    }
    return;
  }

  // Open/extend active window when wake is detected
  if (woke) __secActiveUntil = now + 20000;
  if (__secFreeMode) __secActiveUntil = now + 3600*1000;

  const cleaned = (woke ? __stripWake(raw) : __norm(raw)).trim();
  if (!cleaned){
    secLog("Securito", "Te escucho. Dime tu hallazgo y objetivo.");
    return;
  }

  __secLastUserAt = now;

  const inp = document.getElementById("secInput");
  if (inp) inp.value = "";
  secLog("Tú", woke ? raw : cleaned);

  try{ setSecuritoState("thinking"); }catch(e){}

  const all = await dbGetAll();
  const ans = await securitoAnswer(cleaned, all);

  secLog("Securito", ans);

  const voiceOn = document.getElementById("secVoice");
  const anime = document.getElementById("secAnime");
  if (voiceOn?.checked){
    speak(ans, anime?.checked);
  } else {
    try{ setSecuritoState("idle"); startSecuritoBlink(); }catch(e){}
  }
}

document.addEventListener("click", (e)=>{
  const t = e.target;
  if (!t) return;
  if (t.id === "secRefresh"){
    refreshSecuritoContext();
  }
  if (t.id === "secSend"){
    const inp = document.getElementById("secInput");
    sendToSecurito(inp ? inp.value.trim() : "");
  }
  if (t.id === "secTalk"){
    const inp = document.getElementById("secInput");
    if (!inp) return;
    const ok = startListening((txt, isFinal)=>{
      inp.value = txt;
      if (isFinal){
        sendToSecurito(txt.trim());
      }
    });
    if (!ok){
      secLog("Securito", "Tu navegador no soporta dictado por voz. Escribe tu pregunta y te respondo con voz.");
    }
  }
  if (t.id === "secStop"){
    stopListening();
  }
});

document.addEventListener("keydown", (e)=>{
  if (e.key !== "Enter") return;
  const inp = document.getElementById("secInput");
  if (document.activeElement === inp){
    const btn = document.getElementById("secSend");
    if (btn) btn.click();
  }
});


// V22: Securito listening UI + mic level meter + speech-to-text (browser)
window.__secRec = window.__secRec || null;
let __secAudioStream = null;
let __secAudioCtx = null;
let __secAnalyser = null;
let __secRaf = null;

function secSetListening(on){
  const btn = document.getElementById("secTalk");
  const label = document.getElementById("secListenLabel");
  if (btn) btn.classList.toggle("listening", !!on);
  if (label) label.textContent = on ? "Escuchando…" : "Listo";
  try{ if (__secState !== "speaking") setSecuritoState(on ? "listening" : "idle"); }catch(e){}
}

// V23: wrappers used by UI buttons (fix ReferenceError)
window.__secRec = window.__secRec || null;


// ---------- Voice (ASR) engine (stable, auto-send) ----------
window.__secRec = window.__secRec || null;
let __secAutoListen = false;
let __secAsrRunning = false;
let __secAsrRestartT = null;
let __secAsrDebounceT = null;
let __secAsrLastText = "";
let __secAsrLastAt = 0;

function enableSecuritoAutoListen(on){
  __secAutoListen = !!on;
  if (__secAutoListen){
    // Try to start immediately (will prompt mic permission on first user gesture)
    startListening((txt, isFinal)=>{ __secHandleAsrText(txt, isFinal); });
  } else {
    stopListening();
  }
}

function __secHandleAsrText(text, isFinal){
  const t = String(text||"").trim();
  if (!t) return;

  __secAsrLastText = t;
  __secAsrLastAt = Date.now();

  // Live transcription into input (so user sees what's happening)
  const inp = document.getElementById("secInput");
  if (inp) inp.value = t;

  // Debounce: if user pauses ~900ms, treat as final
  if (__secAsrDebounceT) clearTimeout(__secAsrDebounceT);
  __secAsrDebounceT = setTimeout(()=>{
    // If we haven't received new text recently, auto-send
    const age = Date.now() - __secAsrLastAt;
    if (age > 750 && __secAsrLastText){
      const toSend = __secAsrLastText;
      __secAsrLastText = "";
      if (inp) inp.value = "";
      sendToSecurito(toSend, {silentHint:false});
    }
  }, 900);

  // If browser marks it final, auto-send immediately
  if (isFinal){
    if (__secAsrDebounceT) clearTimeout(__secAsrDebounceT);
    __secAsrDebounceT = null;
    const toSend = t;
    __secAsrLastText = "";
    if (inp) inp.value = "";
    sendToSecurito(toSend, {silentHint:false});
  }
}

function startListening(onText){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return false;

  try{
    // prevent rapid re-entrancy
    if (__secAsrRunning) return true;

    secSetListening(true);
    secStartMicLevel();

    if (window.__secRec) { try{ window.__secRec.stop(); }catch(e){} }

    const r = new SR();
    window.__secRec = r;

    r.lang = "es-MX";              // force Spanish (Mexico)
    r.interimResults = true;
    r.continuous = true;           // keep session open to avoid UI flicker
    r.maxAlternatives = 3;

    __secAsrRunning = true;

    r.onresult = (ev)=>{
      let finalText = "";
      let interim = "";
      for (let i=ev.resultIndex; i<ev.results.length; i++){
        const res = ev.results[i];
        const txt = (res[0]?.transcript || "").trim();
        if (!txt) continue;
        if (res.isFinal) finalText += (finalText ? " " : "") + txt;
        else interim += (interim ? " " : "") + txt;
      }
      const combined = (finalText || interim).trim();
      if (combined && onText) onText(combined, !!finalText);
    };

    r.onerror = ()=>{
      __secAsrRunning = false;
      secSetListening(false);
      // Auto-restart only if auto-listen is enabled
      if (__secAutoListen){
        if (__secAsrRestartT) clearTimeout(__secAsrRestartT);
        __secAsrRestartT = setTimeout(()=> startListening(onText), 700);
      } else {
        secStopMicLevel();
      }
    };

    r.onend = ()=>{
      __secAsrRunning = false;
      // If auto listen is enabled, restart with a small cooldown to avoid rapid loops
      if (__secAutoListen){
        secSetListening(true); // keep UI steady
        if (__secAsrRestartT) clearTimeout(__secAsrRestartT);
        __secAsrRestartT = setTimeout(()=> startListening(onText), 450);
      } else {
        secSetListening(false);
        secStopMicLevel();
      }
    };

    r.start();
    return true;
  }catch(e){
    __secAsrRunning = false;
    secSetListening(false);
    return false;
  }
}

function stopListening(){
  __secAutoListen = false;
  try{ if (window.__secRec) window.__secRec.stop(); }catch(e){}
  window.__secRec = null;
  __secAsrRunning = false;
  if (__secAsrRestartT) clearTimeout(__secAsrRestartT);
  __secAsrRestartT = null;
  if (__secAsrDebounceT) clearTimeout(__secAsrDebounceT);
  __secAsrDebounceT = null;
  secSetListening(false);
  secStopMicLevel();
}

async function secStartMicLevel(){
  try{
    if (__secAudioStream) return;
    __secAudioStream = await navigator.mediaDevices.getUserMedia({audio:true});
    __secAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = __secAudioCtx.createMediaStreamSource(__secAudioStream);
    __secAnalyser = __secAudioCtx.createAnalyser();
    __secAnalyser.fftSize = 1024;
    src.connect(__secAnalyser);

    const data = new Uint8Array(__secAnalyser.fftSize);
    const tick = ()=>{
      if (!__secAnalyser) return;
      __secAnalyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i=0;i<data.length;i++){
        const v = (data[i]-128)/128;
        sum += v*v;
      }
      const rms = Math.sqrt(sum/data.length); // 0..1
      const pct = Math.max(0, Math.min(100, Math.round(rms*180)));
      const fill = document.getElementById("secMicFill");
      if (fill) fill.style.width = pct + "%";
      __secRaf = requestAnimationFrame(tick);
    };
    tick();
  }catch(e){
    const label = document.getElementById("secListenLabel");
    if (label) label.textContent = "Mic bloqueado";
  }
}

function secStopMicLevel(){
  try{ if (__secRaf) cancelAnimationFrame(__secRaf); }catch(e){}
  __secRaf = null;
  try{
    if (__secAudioStream) __secAudioStream.getTracks().forEach(t=>t.stop());
  }catch(e){}
  __secAudioStream = null;
  try{ if (__secAudioCtx) __secAudioCtx.close(); }catch(e){}
  __secAudioCtx = null;
  __secAnalyser = null;
  const fill = document.getElementById("secMicFill");
  if (fill) fill.style.width = "0%";
}

function secCreateSpeechRec(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = "es-MX";
  r.interimResults = true;
  r.continuous = false;
  return r;
}

window.addEventListener("DOMContentLoaded", ()=>{
  const talk = document.getElementById("secTalk");
  const stop = document.getElementById("secStop");
  const input = document.getElementById("secInput");

  if (talk){
    talk.addEventListener("click", async ()=>{
      secSetListening(true);
      await secStartMicLevel();

      if (window.__secRec){ try{ window.__secRec.stop(); }catch(e){} }
      window.__secRec = secCreateSpeechRec();
      if (!window.__secRec){
        secSetListening(false);
        // fallback message (keep it short)
        if (typeof secLog === "function") secLog("Securito", "Tu navegador no soporta dictado. Escribe y te respondo con voz.");
        return;
      }

      let finalText = "";
      window.__secRec.onresult = (ev)=>{
        let interim = "";
        for (let i=ev.resultIndex;i<ev.results.length;i++){
          const txt = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) finalText += txt;
          else interim += txt;
        }
        if (input) input.value = (finalText + interim).trim();
      };
      window.__secRec.onerror = ()=>{ secSetListening(false); };
      window.__secRec.onend = ()=>{ secSetListening(false); try{ const v=input?.value?.trim(); if(v){ document.getElementById("secSend")?.click(); } }catch(e){} };

      try{ window.__secRec.start(); }catch(e){ secSetListening(false); }
    });
  }

  if (stop){
    stop.addEventListener("click", ()=>{
      try{ if (window.__secRec) window.__secRec.stop(); }catch(e){}
      window.__secRec = null;
      secSetListening(false);
      try{ setSecuritoState("idle");
    startSecuritoBlink(); startSecuritoBlink(); }catch(e){}
      secStopMicLevel();
    });
  }
});


function toggleSecuritoTalking(on){
  // Tie TTS to avatar states
  if (on){
    try{ stopSecuritoBlink();
    setSecuritoState("speaking"); }catch(e){}
    try{ startSecuritoSpeakingAnim(); }catch(e){}
  }else{
    try{ stopSecuritoSpeakingAnim(); }catch(e){}
    try{ setSecuritoState("idle");
    startSecuritoBlink(); }catch(e){}
  }
}



function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, s=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[s]));
}

// ===== V25 SECURITO CONTROLLER =====
(function(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function log(role, text){
    const logEl = document.getElementById("secLog");
    if (!logEl) return;
    const row = document.createElement("div");
    row.className = "chatMsg";
    row.innerHTML = `<b>${role}:</b> ${text}`;
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setListening(on){
    const btn = document.getElementById("secTalk");
    const label = document.getElementById("secListenLabel");
    if (btn) btn.classList.toggle("listening", !!on);
    if (label) label.textContent = on ? "Escuchando…" : "Listo";
  }

  async function refreshContext(){
    const box = document.getElementById("secTopContext");
    try{
      const all = await dbGetAll();
      const ctx = topContextFromRecords(all);
      if (box) box.textContent = ctx.text;
      return ctx;
    }catch(e){
      if (box) box.textContent = "Sin datos aún.";
      return { topActs:[], topConds:[], text:"Sin datos aún." };
    }
  }

  function respond(userText, ctx){
    const focus = (ctx.topActs?.[0]?.name) || (ctx.topConds?.[0]?.name) || "seguridad";
    return [
      `Enfoque: ${focus}. Objetivo: reducir recurrencia en 2 semanas.`,
      "Campaña: 'Cero Excusas, Cero Riesgo' (micro-mensajes diarios + verificación rápida).",
      "Acciones (semana 1):",
      "• Walk & Talk de 3 minutos por área (1 corrección + 1 reconocimiento).",
      "• Auditoría express 5x5 al inicio de turno.",
      "Contramedidas:",
      "• PPE: checklist visual + reposición inmediata en punto de uso.",
      "• Celular/alimentos: zona definida + refuerzo de líderes.",
      "Métrica: % cumplimiento por turno + top reincidencias (coaching)."
    ].join("\n");
  }

  function talk(text){
    const voiceOn = document.getElementById("secVoice")?.checked;
    if (!voiceOn) return;
    speak(text, { anime: document.getElementById("secAnime")?.checked });
  }

  function hook(){
    const talkBtn = document.getElementById("secTalk");
    const stopBtn = document.getElementById("secStop");
    const sendBtn = document.getElementById("secSend");
    const refreshBtn = document.getElementById("secRefresh");
    const input = document.getElementById("secInput");

    refreshBtn?.addEventListener("click", refreshContext);

    sendBtn?.addEventListener("click", async ()=>{
      const msg = input?.value?.trim();
      if (!msg) return;
      log("Tú", escapeHtml(msg));
      try{ setSecuritoState("thinking"); }catch(e){}
      if (input) input.value = "";
      const ctx = await refreshContext();
      const ans = respond(msg, ctx);
      log("Securito", escapeHtml(ans).replace(/\n/g,"<br>"));
      talk(ans);
    });

    talkBtn?.addEventListener("click", ()=>{
      setListening(true);
      secStartMicLevel();

      if (!SR){
        setListening(false);
        return;
      }
      const r = new SR();
      window.__secRec = r;
      r.lang = "es-MX";
      r.interimResults = true;
      r.continuous = false;
      let finalText = "";
      r.onresult = (ev)=>{
        let interim = "";
        for (let i=ev.resultIndex; i<ev.results.length; i++){
          const txt = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) finalText += txt;
          else interim += txt;
        }
        if (input) input.value = (finalText + interim).trim();
      };
      r.onerror = ()=>{ setListening(false); };
      r.onend = ()=>{ setListening(false); };
      try{ r.start(); }catch(e){ setListening(false); }
    });

    stopBtn?.addEventListener("click", ()=>{
      try{ window.__secRec?.stop?.(); }catch(e){}
      window.__secRec = null;
      setListening(false);
      secStopMicLevel();
    });
  }

  window.addEventListener("DOMContentLoaded", async ()=>{
    hook();
    await refreshContext();
    const logEl = document.getElementById("secLog");
    if (logEl && !logEl.dataset.init){
      logEl.dataset.init="1";
      log("Securito", "Estoy listo. Dime el hallazgo y tu objetivo. Te doy campaña, acciones y contramedidas.");
    }
  });
})();


/* V29: Securito state machine */
let __secState = "idle";
let __secSpeakBlink = null;

function setSecuritoState(state){
  __secState = state || "idle";
  const wrap = document.querySelector(".securitoAvatarWrap");
  if (!wrap) return;
  wrap.dataset.state = __secState;
  const imgs = wrap.querySelectorAll(".securitoRobot[data-secstate]");
  imgs.forEach(img => img.classList.toggle("is-active", img.dataset.secstate === __secState));
}

function startSecuritoSpeakingAnim(){
  stopSecuritoSpeakingAnim();
  const wrap = document.querySelector(".securitoAvatarWrap");
  if (!wrap) return;

  // ✅ Natural-ish mouth movement (no pulsing/zoom). We only swap frames.
  const tick = () => {
    if (__secState !== "speaking") return;
    const speaking = wrap.querySelector('.securitoRobot[data-secstate="speaking"]');
    const idle = wrap.querySelector('.securitoRobot[data-secstate="idle"]');
    if (!speaking || !idle) return;

    // Random cadence: faster on "speech", occasional micro-pauses
    const pause = Math.random() < 0.12; // 12% chance: brief closed-mouth pause
    const nextDelay = pause ? (170 + Math.random()*140) : (85 + Math.random()*65);

    const speakOn = speaking.classList.contains("is-active");
    // If pausing, force mouth closed (idle on). Else alternate.
    if (pause){
      speaking.classList.remove("is-active");
      idle.classList.add("is-active");
    } else {
      speaking.classList.toggle("is-active", !speakOn);
      idle.classList.toggle("is-active", speakOn);
    }

    __secSpeakBlink = setTimeout(tick, nextDelay);
  };

  tick();
}

function stopSecuritoSpeakingAnim(){
  if (__secSpeakBlink){ clearTimeout(__secSpeakBlink); __secSpeakBlink = null; }
  // restore to a stable frame
  const wrap = document.querySelector(".securitoAvatarWrap");
  if (!wrap) return;
  const speaking = wrap.querySelector('.securitoRobot[data-secstate="speaking"]');
  const idle = wrap.querySelector('.securitoRobot[data-secstate="idle"]');
  if (speaking) speaking.classList.remove("is-active");
  if (idle) idle.classList.add("is-active");
}



/* V33+: natural blink (human timing) */
let __secBlinkTimer = null;

function startSecuritoBlink(){
  stopSecuritoBlink();

  const loop = () => {
    const wrap = document.querySelector(".securitoAvatarWrap");
    // If view not mounted yet, retry shortly instead of dying forever
    if (!wrap){
      __secBlinkTimer = setTimeout(loop, 500);
      return;
    }

    // Don't blink while speaking flap is running
    if (__secState !== "speaking"){
      // Blink without changing the global state machine (avoids fighting with ASR/listening UI)
      const thinking = wrap.querySelector('.securitoRobot[data-secstate="thinking"]');
      const active = wrap.querySelector('.securitoRobot.is-active');
      if (thinking && active){
        const prevEl = active;
        thinking.classList.add("is-active");
        prevEl.classList.remove("is-active");
        const dur = 150 + Math.random()*60; // 150–210ms
        setTimeout(() => {
          if (__secState !== "speaking"){
            thinking.classList.remove("is-active");
            prevEl.classList.add("is-active");
          }
        }, dur);
      }
    }

    const next = 4800 + Math.random()*3400; // 4.8s – 8.2s
    __secBlinkTimer = setTimeout(loop, next);
  };

  // First blink after a short natural delay
  __secBlinkTimer = setTimeout(loop, 2400 + Math.random()*1800);
}

function stopSecuritoBlink(){
  if (__secBlinkTimer){ clearTimeout(__secBlinkTimer); __secBlinkTimer = null; }
}

