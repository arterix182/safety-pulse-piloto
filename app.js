const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const VIEWS = {
  welcome: $("#viewWelcome"),
  login: $("#viewLogin"),
  home: $("#viewHome"),
  form: $("#viewForm"),
  dashboard: $("#viewDashboard"),
  manual: $("#viewManual")
};

const state = {
  directory: null,
  actos: [],
  condiciones: [],
  user: null,
  formType: "recorrido" // or "interaccion"
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
  // bottom bar active
  $$(".navbtn").forEach(b => b.classList.remove("active"));
  const map = {home:"home", dashboard:"dashboard", manual:"manual"};
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
    $("#hintDir").textContent = `Directorio listo: ${dir.count} registros`;
  }catch(e){
    $("#hintDir").textContent = "Directorio: ERROR al cargar (revisa data/directory.json)";
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
    shift: person.shift
  };
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
}

// --------------------- Form
const formEls = {
  title: $("#formTitle"),
  pill: $("#formTypePill"),
  auditedGmin: $("#auditedGmin"),
  autoDate: $("#autoDate"),
  auditedName: $("#auditedName"),
  auditedPlant: $("#auditedPlant"),
  auditedLos: $("#auditedLos"),
  auditedMgr: $("#auditedMgr"),
  actoInput: $("#actoInput"),
  actoCombo: $("#actoCombo"),
  condInput: $("#condInput"),
  condCombo: $("#condCombo"),
  comment: $("#commentInput"),
  saveMsg: $("#saveMsg"),
};

function openForm(type){
  state.formType = type;
  formEls.title.textContent = type === "recorrido" ? "Recorrido de seguridad" : "Interacciones de seguridad";
  formEls.pill.textContent = type === "recorrido" ? "RECORRIDO" : "INTERACCIÓN";
  formEls.autoDate.textContent = fmtDT(nowISO());
  formEls.auditedGmin.value = "";
  formEls.auditedName.textContent = "—";
  formEls.auditedPlant.textContent = "—";
  formEls.auditedLos.textContent = "—";
  formEls.auditedMgr.textContent = "—";
  formEls.actoInput.value = "";
  formEls.condInput.value = "";
  formEls.comment.value = "";
  formEls.saveMsg.textContent = "";
  setView("form");
}

$("#formBack").addEventListener("click", () => setView("home"));

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
    formEls.auditedName.textContent = g ? "No encontrado" : "—";
    formEls.auditedPlant.textContent = "—";
    formEls.auditedLos.textContent = "—";
    formEls.auditedMgr.textContent = "—";
    return;
  }
  formEls.auditedName.textContent = p.name;
  formEls.auditedPlant.textContent = p.plant || "—";
  formEls.auditedLos.textContent = losLabel(p);
  formEls.auditedMgr.textContent = p.manager || "—";
});

async function saveRecord(andNew=false){
  const msg = formEls.saveMsg;
  const audited = safe(formEls.auditedGmin.value);
  if (!audited) return toast(msg, "Falta GMIN auditado.");
  const auditedPerson = dirLookup(audited);
  if (!auditedPerson) return toast(msg, "GMIN auditado no existe en directorio.");
  const acto = safe(formEls.actoInput.value);
  const cond = safe(formEls.condInput.value);
  if (!acto) return toast(msg, "Selecciona Acto inseguro.");
  if (!cond) return toast(msg, "Selecciona Condición insegura.");

  const createdAt = nowISO();
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
    findings: { acto, condicion: cond },
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
  $("#dbTotal").textContent = all.length;

  const countBy = (keyFn) => {
    const m = new Map();
    for (const r of all){
      const k = keyFn(r);
      if (!k) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  };

  const topOf = (m) => {
    let best = null, bestV = -1;
    for (const [k,v] of m.entries()){
      if (v > bestV){ bestV=v; best=k; }
    }
    return best || "—";
  };

  $("#dbActoTop").textContent = topOf(countBy(r => r.findings?.acto));
  $("#dbCondTop").textContent = topOf(countBy(r => r.findings?.condicion));

  // recent
  const recent = all.slice().sort((a,b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 12);
  const list = $("#recentList");
  list.innerHTML = "";
  if (!recent.length){
    list.innerHTML = `<div class="item"><div class="itemTitle">Sin registros aún</div><div class="itemMeta">Registra un recorrido o interacción.</div></div>`;
  }else{
    for (const r of recent){
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="itemTop">
          <div class="itemTitle">${r.type === "recorrido" ? "🛡️ Recorrido" : "🤝 Interacción"} • ${r.audited?.name || "—"}</div>
          <div class="itemMeta">${fmtDT(r.createdAt)}</div>
        </div>
        <div class="itemMeta">Acto: <b>${r.findings?.acto || "—"}</b> • Condición: <b>${r.findings?.condicion || "—"}</b></div>
        <div class="itemMeta">Registró: ${r.user?.name || "—"} (${r.user?.gmin || "—"}) • Plant: ${r.user?.plant || "—"}</div>
      `;
      list.appendChild(div);
    }
  }

  setView("dashboard");
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
