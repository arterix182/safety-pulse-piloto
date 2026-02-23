# Safety Pulse (Piloto) — Opción A
PWA instalable, modo offline-first y despliegue en GitHub Pages.

## Estructura
- index.html / styles.css / app.js
- data/directory.json (generado desde Excel)
- data/actos.json / data/condiciones.json
- sw.js (cache offline)
- manifest.webmanifest

## Cómo correr local
1. Abre una terminal en esta carpeta
2. Usa un servidor estático (ej: VSCode Live Server) y abre `index.html`

## GitHub Pages
1. Sube estos archivos a un repo (branch `main`)
2. Settings → Pages → Deploy from branch (root)
3. Abre el link y "Instalar" desde Chrome/Edge (PWA)

## Actualizar directorio (Excel)
Reemplaza `data/directory.json` por uno nuevo generado a partir del Excel.
