# Gestor de Gastos 2.0 — app (PWA)

Sitio estático: no necesita compilar nada. Se publica tal cual (GitHub Pages, Netlify, Cloudflare Pages…).

- `config.js`: URL del proyecto y clave **pública** (sb_publishable_…). Nunca la clave secreta.
- `index.html`, `app.js`, `api.js`, `estilos.css`: la app.
- `vendor/`: librerías locales (supabase-js MIT, SheetJS Apache-2.0, jsPDF MIT, jsPDF-AutoTable MIT).
- `demo/motor_demo.js`: modo demo (abre la app con `?demo=1`); usa la lógica real de la función con datos ficticios.
- `sw.js` + `manifest.webmanifest` + `iconos/`: para instalarla en el celular.

Ingreso con correo y contraseña (el correo por defecto de Supabase solo llega a miembros del equipo y máximo 2 por hora,
así que no se usan enlaces ni códigos por correo). Cada quien cambia su contraseña en Más → Contraseña.
