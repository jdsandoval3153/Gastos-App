// Gráficos en SVG sin librerías. Reglas: un solo eje Y, marcas finas, líneas de 2px, barras con punta
// redondeada, grilla tenue, leyenda cuando hay 2+ series y tooltip al pasar/tocar.
// Colores (validados para daltonismo sobre fondo blanco): serie 1 azul, 2 naranja, 3 aqua.
export const COLORES = { gasto: "#2a78d6", reembolso: "#eb6834", promedio: "#1baf7a", referencia: "#6b7571" };

const NS = "http://www.w3.org/2000/svg";
const s = (tag, attrs = {}, ...hijos) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
  hijos.flat().forEach((c) => c !== null && c !== undefined && el.append(c instanceof Node ? c : document.createTextNode(String(c))));
  return el;
};
const fmtCorto = (x) => (Math.abs(x) >= 1000 ? `${(x / 1000).toLocaleString("es-PE", { maximumFractionDigits: 1 })}k` : Math.round(x).toString());

/** Escala "bonita" para el eje Y: 0 a un máximo redondo, con 4 líneas de grilla. */
function escalaY(max) {
  if (!(max > 0)) max = 1;
  const paso0 = max / 4, mag = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= paso0);
  return { max: paso * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * paso) };
}

function marco(alto, ticksY, escY, ancho, izq, der, arr, aba) {
  const g = s("g", { class: "grilla" });
  for (const t of ticksY) {
    const y = escY(t);
    g.append(s("line", { x1: izq, x2: ancho - der, y1: y, y2: y, stroke: t === 0 ? "#c9c7bf" : "#eceae4", "stroke-width": 1 }),
      s("text", { x: izq - 6, y: y + 4, "text-anchor": "end", class: "eje" }, fmtCorto(t)));
  }
  return g;
}

function tooltip(cont) {
  const t = document.createElement("div"); t.className = "tip"; t.hidden = true; cont.append(t);
  return {
    mostrar(html, x, y) { t.innerHTML = html; t.hidden = false;
      const w = cont.clientWidth, tw = t.offsetWidth; t.style.left = `${Math.min(Math.max(4, x - tw / 2), w - tw - 4)}px`; t.style.top = `${Math.max(0, y - t.offsetHeight - 10)}px`; },
    ocultar() { t.hidden = true; },
  };
}

function leyenda(items) {
  const l = document.createElement("div"); l.className = "leyenda";
  for (const it of items) {
    const i = document.createElement("span");
    i.innerHTML = `<i style="background:${it.color};${it.guion ? "height:0;border-top:2px dashed " + it.color + ";background:none" : ""}"></i>`;
    i.append(it.nombre); l.append(i);
  }
  return l;
}

/**
 * Líneas sobre un eje X numérico (p. ej. día del mes).
 * series: [{ nombre, color, puntos: [[x, y], ...], etiqueta?: true }]
 * refs: [{ y, nombre }] líneas horizontales punteadas (meta).
 */
export function lineas({ series, refs = [], xMin = 1, xMax, etiquetaX = (x) => x, formato = (y) => y, alto = 220, titulo }) {
  const cont = document.createElement("figure"); cont.className = "grafico";
  const ancho = 640, izq = 40, der = 64, arr = 14, aba = 26;
  const maxY = Math.max(1, ...series.flatMap((se) => se.puntos.map((p) => p[1])), ...refs.map((r) => r.y));
  const { max, ticks } = escalaY(maxY * 1.05);
  const escX = (x) => izq + ((x - xMin) / Math.max(1, xMax - xMin)) * (ancho - izq - der);
  const escY = (y) => arr + (1 - y / max) * (alto - arr - aba);
  const svg = s("svg", { viewBox: `0 0 ${ancho} ${alto}`, role: "img", "aria-label": titulo || series.map((x) => x.nombre).join(", ") });
  svg.append(marco(alto, ticks, escY, ancho, izq, der, arr, aba));
  const pasosX = Math.min(6, xMax - xMin);
  for (let i = 0; i <= pasosX; i++) {
    const x = Math.round(xMin + (i * (xMax - xMin)) / Math.max(1, pasosX));
    svg.append(s("text", { x: escX(x), y: alto - 8, "text-anchor": "middle", class: "eje" }, etiquetaX(x)));
  }
  for (const r of refs) {
    const y = escY(r.y);
    svg.append(s("line", { x1: izq, x2: ancho - der, y1: y, y2: y, stroke: COLORES.referencia, "stroke-width": 1.5, "stroke-dasharray": "5 4" }),
      s("text", { x: ancho - der + 4, y: y + 4, class: "eti-ref" }, r.nombre));
  }
  for (const se of series) {
    if (!se.puntos.length) continue;
    const d = se.puntos.map((p, i) => `${i ? "L" : "M"}${escX(p[0]).toFixed(1)},${escY(p[1]).toFixed(1)}`).join("");
    svg.append(s("path", { d, fill: "none", stroke: se.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": se.guion ? "6 4" : null }));
    const ult = se.puntos[se.puntos.length - 1];
    svg.append(s("circle", { cx: escX(ult[0]), cy: escY(ult[1]), r: 4, fill: se.color, stroke: "#fff", "stroke-width": 2 }));
    if (se.etiqueta) svg.append(s("text", { x: escX(ult[0]) + 7, y: escY(ult[1]) + 4, class: "eti-serie" }, fmtCorto(ult[1])));
  }
  // capa de hover: línea vertical + valores de todas las series en ese x
  const cruz = s("line", { y1: arr, y2: alto - aba, stroke: "#9a9890", "stroke-width": 1, visibility: "hidden" });
  const zona = s("rect", { x: izq, y: 0, width: ancho - izq - der, height: alto, fill: "transparent" });
  svg.append(cruz, zona);
  cont.append(svg);
  const tip = tooltip(cont);
  const mover = (ev) => {
    const caja = svg.getBoundingClientRect(), px = ((ev.clientX - caja.left) / caja.width) * ancho;
    const x = Math.round(xMin + ((px - izq) / (ancho - izq - der)) * (xMax - xMin));
    if (x < xMin || x > xMax) return;
    cruz.setAttribute("x1", escX(x)); cruz.setAttribute("x2", escX(x)); cruz.setAttribute("visibility", "visible");
    const filas = series.map((se) => { const p = se.puntos.find((q) => q[0] === x); return p ? `<div><i style="background:${se.color}"></i>${se.nombre}: <b>${formato(p[1])}</b></div>` : ""; }).join("");
    tip.mostrar(`<div class="tip-t">${etiquetaX(x)}</div>${filas || "<div>sin datos</div>"}`, ((escX(x)) / ancho) * caja.width, ((arr + 10) / alto) * caja.height);
  };
  zona.addEventListener("pointermove", mover); zona.addEventListener("pointerdown", mover);
  zona.addEventListener("pointerleave", () => { cruz.setAttribute("visibility", "hidden"); tip.ocultar(); });
  if (series.length > 1 || refs.length) cont.append(leyenda([...series, ...refs.map((r) => ({ nombre: r.nombre, color: COLORES.referencia, guion: true }))]));
  return cont;
}

/**
 * Barras verticales. barras: [{ etiqueta, valor, marca?: número (p. ej. la meta de ese mes), detalle?: html }]
 */
export function barras({ barras: datos, color = COLORES.gasto, nombreMarca, formato = (y) => y, alto = 220, titulo, nombre }) {
  const cont = document.createElement("figure"); cont.className = "grafico";
  const ancho = 640, izq = 40, der = 10, arr = 14, aba = 26;
  const maxY = Math.max(1, ...datos.map((d) => Math.max(d.valor, d.marca || 0)));
  const { max, ticks } = escalaY(maxY * 1.05);
  const escY = (y) => arr + (1 - y / max) * (alto - arr - aba);
  const banda = (ancho - izq - der) / Math.max(1, datos.length), w = Math.max(4, banda * 0.62);
  const svg = s("svg", { viewBox: `0 0 ${ancho} ${alto}`, role: "img", "aria-label": titulo || nombre || "barras" });
  svg.append(marco(alto, ticks, escY, ancho, izq, der, arr, aba));
  const tip = tooltip(cont);
  datos.forEach((d, i) => {
    const x = izq + i * banda + (banda - w) / 2, y = escY(d.valor), h = Math.max(0, escY(0) - y), r = Math.min(4, w / 2, h);
    // barra con las esquinas de arriba redondeadas y la base recta
    const path = `M${x},${escY(0)}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${escY(0)}Z`;
    const g = s("g", { class: "barra-g" }, s("path", { d: h > 0 ? path : "", fill: color }));
    if (d.marca) g.append(s("line", { x1: x - 4, x2: x + w + 4, y1: escY(d.marca), y2: escY(d.marca), stroke: "#1f2a27", "stroke-width": 2.5, "stroke-linecap": "round" }));
    const golpe = s("rect", { x: izq + i * banda, y: arr, width: banda, height: alto - arr - aba, fill: "transparent" });
    const ver = () => {
      const caja = svg.getBoundingClientRect();
      tip.mostrar(`<div class="tip-t">${d.etiqueta}</div><div>${nombre || "Valor"}: <b>${formato(d.valor)}</b></div>` +
        (d.marca ? `<div>${nombreMarca}: <b>${formato(d.marca)}</b></div>` : "") + (d.detalle || ""),
      ((x + w / 2) / ancho) * caja.width, (Math.min(y, d.marca ? escY(d.marca) : y) / alto) * caja.height);
    };
    golpe.addEventListener("pointerenter", ver); golpe.addEventListener("pointerdown", ver);
    golpe.addEventListener("pointerleave", () => tip.ocultar());
    g.append(golpe); svg.append(g);
    if (datos.length <= 14 || i % 2 === 0) svg.append(s("text", { x: x + w / 2, y: alto - 8, "text-anchor": "middle", class: "eje" }, d.etiqueta));
  });
  cont.prepend(svg);
  if (nombreMarca) cont.append(leyenda([{ nombre, color }, { nombre: nombreMarca, color: "#1f2a27" }]));
  return cont;
}
