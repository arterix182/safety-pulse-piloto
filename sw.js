const CACHE = "safety-pwa-v40_v42_3";
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/logo.png",
  "./assets/logo.webp",
  "./assets/securito_idle.png",
  "./assets/securito_listening.png",
  "./assets/securito_thinking.png",
  "./assets/securito_speaking.png",
  "./data/directory.json",
  "./data/actos.json",
  "./data/condiciones.json",
  "./data/securito_playbook.json"
];

self.addEventListener("install", (e)=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE && caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", (e)=>{
  const req = e.request;
  const url = new URL(req.url);

  // Network-first for API calls (none currently), cache-first for static
  if (url.origin === location.origin){
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res=>{
        const copy = res.clone();
        caches.open(CACHE).then(c=>c.put(req, copy));
        return res;
      }).catch(()=>hit))
    );
  }
});
