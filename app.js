// Gestor de Gastos 2.0 — app (PWA). Sin compilación: módulos ES y librerías locales en vendor/.
import { CONFIG } from "./config.js";
import { barras, COLORES, lineas } from "./graficos.js";

const VERSION = "2.1.0";
const DEMO = new URLSearchParams(location.search).has("demo") || !CONFIG.CLAVE_PUBLICA;
const api = DEMO ? (await import("./demo/motor_demo.js")).crearApiDemo() : (await import("./api.js")).crearApi(CONFIG);

// ───────────── utilidades ─────────────
const $ = (s, el = document) => el.querySelector(s);
function h(tag, attrs = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of hijos.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const fmt = new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const soles = (x) => `S/ ${fmt.format(x || 0)}`;
const monto = (m, moneda) => (moneda && moneda !== "PEN" ? `${moneda} ${fmt.format(m)}` : soles(m));
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
const hoyLima = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
function finDeMes(ym) { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }
function moverMes(ym, n) { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); }
const esEntrada = (t) => t === "Reembolso" || t === "Ingreso ocasional";
const guardarLocal = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
const leerLocal = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

function toast(texto, accion) {
  const t = h("div", { class: "toast", role: "status" }, h("span", {}, texto));
  if (accion) t.append(h("button", { class: "toast-accion", onclick: accion.fn }, accion.texto));
  $("#toasts").replaceChildren(t);
  if (!accion?.persistente) setTimeout(() => t.remove(), 4000);
  return t;
}
function modal(titulo, cuerpo, botones) {
  return new Promise((ok) => {
    const fondo = h("div", { class: "modal-fondo" });
    const cerrar = (v) => { fondo.remove(); ok(v); };
    fondo.append(h("div", { class: "modal", role: "dialog", "aria-label": titulo },
      h("h3", {}, titulo), cuerpo,
      h("div", { class: "fila-botones" }, botones.map((b) => h("button", { class: b.clase || "secundario", onclick: () => cerrar(b.valor) }, b.texto)))));
    fondo.addEventListener("click", (e) => { if (e.target === fondo) cerrar(null); });
    document.body.append(fondo);
  });
}
const confirmar = (titulo, texto, si = "Sí") =>
  modal(titulo, h("p", {}, texto), [{ texto: "Cancelar", valor: false }, { texto: si, valor: true, clase: "primario" }]);
function cargando(btn, on, texto) {
  if (on) { btn.dataset.t = btn.textContent; btn.textContent = texto || "Procesando…"; btn.disabled = true; }
  else { btn.textContent = btn.dataset.t; btn.disabled = false; }
}

// ───────────── estado ─────────────
const E = { base: null, tab: "dictar", mes: hoyLima().slice(0, 7), email: "", dictado: null, deshacer: null };
const tcVigente = (moneda, fecha = hoyLima()) => moneda === "PEN" ? 1
  : (E.base.tiposCambio.filter((t) => t.moneda === moneda && t.fecha <= fecha).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0]?.valor ?? null);

// ───────────── arranque e ingreso ─────────────
async function iniciar() {
  if ("serviceWorker" in navigator && !DEMO && location.protocol === "https:") {
    // Si llega una versión nueva de la app, recarga una vez para usarla
    const habiaControl = !!navigator.serviceWorker.controller;
    let recargado = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (habiaControl && !recargado) { recargado = true; location.reload(); }
    });
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" }).then((r) => r.update()).catch(() => {});
  }
  const s = await api.sesion();
  if (s) { E.email = s.email; await entrarApp(); } else pantallaIngreso();
}

function pantallaIngreso(error) {
  const email = h("input", { type: "email", id: "email", autocomplete: "username", placeholder: "tu@correo.com", required: true });
  const clave = h("input", { type: "password", id: "clave", autocomplete: "current-password", placeholder: "Contraseña", required: true });
  const btn = h("button", { class: "primario ancho", type: "submit" }, "Entrar");
  const err = h("p", { class: "error", id: "error-ingreso" }, error || "");
  const form = h("form", { class: "tarjeta ingreso", onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ""; cargando(btn, true, "Entrando…");
    try { await api.entrar(email.value, clave.value); E.email = email.value.trim(); await entrarApp(); }
    catch (x) { err.textContent = x.message; cargando(btn, false); }
  } },
  h("h1", {}, "Gastos"), h("p", { class: "suave" }, "Dicta tus gastos; la app los ordena y valida."),
  h("label", {}, "Correo", email), h("label", {}, "Contraseña", clave), err, btn,
  DEMO ? h("p", { class: "aviso" }, "Modo demo: cualquier correo y contraseña (4+ caracteres). Nada es real.") : null);
  $("#app").replaceChildren(form);
}

async function entrarApp() {
  $("#app").replaceChildren(h("p", { class: "centro suave" }, "Cargando tu libro…"));
  try { E.base = await api.cargarBase(); }
  catch (x) { pantallaIngreso(x.message); return; }
  dibujarMarco();
  irA(E.tab);
}

// ───────────── marco: cabecera y pestañas ─────────────
const TABS = [["dictar", "🎙", "Dictar"], ["movimientos", "📒", "Movimientos"], ["analisis", "📈", "Análisis"],
  ["reembolsos", "🧾", "Reembolsos"], ["mas", "⋯", "Más"]];
function dibujarMarco() {
  $("#app").replaceChildren(
    h("header", { class: "cabecera" }, h("div", {}, h("strong", {}, "Gastos"), h("span", { class: "suave" }, ` · ${E.base.libro.nombre}`)),
      DEMO ? h("span", { class: "chip demo" }, "DEMO") : null),
    h("main", { id: "vista" }),
    h("nav", { class: "pestanas" }, TABS.map(([id, ico, txt]) =>
      h("button", { "data-tab": id, onclick: () => irA(id), "aria-label": txt }, h("span", { class: "ico" }, ico), h("span", {}, txt)))));
}
function irA(tab) {
  E.tab = tab;
  document.querySelectorAll(".pestanas button").forEach((b) => b.classList.toggle("activa", b.dataset.tab === tab));
  const v = $("#vista"); v.replaceChildren(); window.scrollTo(0, 0);
  ({ dictar: vistaDictar, movimientos: vistaMovimientos, analisis: vistaAnalisis, reembolsos: vistaReembolsos,
    recorrido: (x) => { x.append(h("button", { class: "enlace", onclick: () => irA("mas") }, "‹ Volver a Más")); vistaRecorrido(x); },
    mas: vistaMas })[tab](v);
  document.querySelectorAll(".pestanas button").forEach((b) => b.classList.toggle("activa", b.dataset.tab === (tab === "recorrido" ? "mas" : tab)));
}

// ───────────── DICTAR ─────────────
function avisoRespaldo() {
  const ult = leerLocal("gg-ultimo-respaldo");
  const dias = ult ? Math.floor((Date.now() - Number(ult)) / 864e5) : null;
  if (dias !== null && dias < 7) return null;
  return h("div", { class: "aviso clic", onclick: () => irA("mas") },
    dias === null ? "Aún no descargas un respaldo de tu libro. Toca aquí." : `Tu último respaldo fue hace ${dias} días. Toca aquí para descargar uno.`);
}

function vistaDictar(v) {
  const d = E.dictado;
  if (d?.fase === "ficha") return v.append(fichaDictado(d));
  if (d?.fase === "formulario") return v.append(formularioMovimientos(d.filas, d.marcados, d.motivo));
  const texto = h("textarea", { id: "texto", rows: 5, maxlength: 2000,
    placeholder: "Toca aquí y dicta con el micrófono del teclado.\nEj.: «taxi al aeropuerto 28 con Yape, paga Pedelta, viaje a Sapillica»" });
  const btn = h("button", { class: "primario ancho", id: "procesar", onclick: async () => {
    if (!texto.value.trim()) return texto.focus();
    cargando(btn, true, "Leyendo el dictado…");
    try {
      const r = await api.funcion({ accion: "dictar", texto: texto.value.trim() });
      if (r._status !== 200) throw new Error(r.error || `Error ${r._status}`);
      E.dictado = { fase: "ficha", res: r, texto: texto.value.trim() };
      irA("dictar");
    } catch (x) { toast(x.message); cargando(btn, false); }
  } }, "Procesar");
  v.append(...[avisoRespaldo(),
    h("section", { class: "tarjeta" }, h("h2", {}, "¿Qué gastaste?"), texto, btn,
      h("button", { class: "enlace", id: "a-mano", onclick: () => { E.dictado = { fase: "formulario", filas: [filaVacia()], marcados: [] }; irA("dictar"); } },
        "Registrar a mano"))].filter(Boolean));
  if (E.deshacer) v.append(E.deshacer.nodoAviso());
}

function etiquetaFila(f) {
  const det = f.cantidad && f.precio_unitario && (f.unidad === "kg" || f.cantidad !== 1)
    ? ` (${f.cantidad} ${f.unidad || "und"} × ${fmt.format(f.precio_unitario)})` : "";
  return h("li", { class: "fila-ficha" },
    h("div", { class: "linea1" }, h("span", {}, `${ddmm(f.fecha_gasto)} · ${f.descripcion}${det}`),
      h("strong", { class: esEntrada(f.tipo) ? "positivo" : "" }, monto(f.monto_original, f.moneda))),
    h("div", { class: "linea2 suave" },
      [f.tipo !== "Gasto" ? f.tipo : null, f.categoria && `${f.categoria} / ${f.subcategoria}`, f.metodo_pago || "¿método?",
        f.moneda !== "PEN" && f.monto_pen ? `≈ ${soles(f.monto_pen)}` : null].filter(Boolean).join(" · ")),
    f.reembolsable ? h("div", { class: "chip reemb" }, `Reembolsable · ${f.proyecto || "¿proyecto?"}${f.concepto ? " · " + f.concepto : ""}`) : null);
}
function listaMensajes(res) {
  return h("ul", { class: "mensajes" },
    res.errores.map((e) => h("li", { class: "error" }, "✗ ", e)),
    res.dudas.map((e) => h("li", { class: "duda" }, "? ", e)),
    res.notas.map((e) => h("li", { class: "nota" }, "i ", e)));
}

function fichaDictado(d) {
  const r = d.res;
  const cont = h("section", { class: "tarjeta" },
    h("p", { class: "suave pequeño" }, `«${d.texto}»`),
    h("ul", { class: "ficha" }, r.filas.map(etiquetaFila)),
    r.filas.length > 1 ? h("p", { class: "derecha" }, "Total: ", h("strong", {}, soles(r.filas.reduce((s, f) => s + (f.monto_pen || 0), 0)))) : null,
    listaMensajes(r));
  const descartar = h("button", { class: "secundario", onclick: () => { E.dictado = null; irA("dictar"); } }, "Descartar");
  if (r.resultado === "listo") {
    const ok = h("button", { class: "primario", id: "confirmar", onclick: async () => {
      cargando(ok, true, "Guardando…");
      try {
        const g = await api.funcion({ accion: "guardar", recorrido_id: r.recorrido_id });
        if (g._status !== 200) throw new Error(g.error || `Error ${g._status}`);
        E.dictado = null; prepararDeshacer(g.lote_id, g.guardados); irA("dictar");
      } catch (x) { toast(x.message); cargando(ok, false); }
    } }, "Confirmar y guardar");
    cont.append(h("div", { class: "fila-botones" }, descartar, ok));
  } else if (r.resultado === "con_dudas") {
    const resp = h("textarea", { id: "respuesta", rows: 2, placeholder: "Responde por voz o texto (ej.: «con Yape», «fue 4.20»)" });
    const env = h("button", { class: "primario", id: "responder", onclick: async () => {
      if (!resp.value.trim()) return resp.focus();
      cargando(env, true, "Revisando…");
      try {
        const r2 = await api.funcion({ accion: "responder", recorrido_id: r.recorrido_id, respuesta: resp.value.trim() });
        if (r2._status !== 200) throw new Error(r2.error || `Error ${r2._status}`);
        if (r2.resultado === "listo") E.dictado = { fase: "ficha", res: r2, texto: `${d.texto} → ${resp.value.trim()}` };
        else E.dictado = { fase: "formulario", filas: r2.filas.length ? r2.filas.map(desdeFicha) : [filaVacia()],
          marcados: r2.campos_en_duda, motivo: [...r2.errores, ...r2.dudas] };
        irA("dictar");
      } catch (x) { toast(x.message); cargando(env, false); }
    } }, "Enviar respuesta");
    const aMano = h("button", { class: "secundario", onclick: () => {
      E.dictado = { fase: "formulario", filas: r.filas.length ? r.filas.map(desdeFicha) : [filaVacia()], marcados: r.campos_en_duda,
        motivo: [...r.errores, ...r.dudas] }; irA("dictar");
    } }, "Completar a mano");
    cont.append(h("label", { class: "bloque" }, "Una sola respuesta para resolver lo marcado:", resp),
      h("div", { class: "fila-botones" }, descartar, aMano, env));
  } else {
    cont.append(h("div", { class: "fila-botones" }, descartar,
      h("button", { class: "primario", onclick: () => { E.dictado = { fase: "formulario", filas: r.filas.length ? r.filas.map(desdeFicha) : [filaVacia()],
        marcados: r.campos_en_duda, motivo: [...r.errores, ...r.dudas] }; irA("dictar"); } }, "Completar a mano")));
  }
  return cont;
}

function prepararDeshacer(lote, n) {
  const hasta = Date.now() + 5 * 60_000;
  const nodo = h("div", { class: "deshacer", id: "deshacer" });
  const pintar = () => {
    const s = Math.max(0, Math.round((hasta - Date.now()) / 1000));
    if (!s) { E.deshacer = null; nodo.remove(); clearInterval(t); return; }
    nodo.replaceChildren(h("span", {}, `✓ ${n === 1 ? "Gasto guardado" : `${n} movimientos guardados`}`),
      h("button", { class: "enlace", onclick: async () => {
        const r = await api.funcion({ accion: "deshacer", lote_id: lote });
        clearInterval(t); E.deshacer = null; nodo.remove();
        toast(r._status === 200 ? "Se deshizo lo guardado" : r.error || "No se pudo deshacer");
      } }, `Deshacer (${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")})`));
  };
  const t = setInterval(pintar, 1000); pintar();
  E.deshacer = { nodoAviso: () => nodo };
}

// ───────────── formulario (manual, prellenado o edición) ─────────────
function filaVacia() {
  return { fecha_gasto: hoyLima(), tipo: "Gasto", categoria_id: "", descripcion: "", moneda: "PEN", monto_original: "",
    tipo_cambio: 1, metodo_pago_id: "", reembolsable: false, proyecto_id: "", concepto: "", lugar: "" };
}
function desdeFicha(f) {
  const c = E.base.categorias.find((x) => x.categoria === f.categoria && x.subcategoria === f.subcategoria);
  return { fecha_gasto: f.fecha_gasto, tipo: f.tipo, categoria_id: c?.id ?? f.categoria_id ?? "", descripcion: f.descripcion,
    moneda: f.moneda, monto_original: f.monto_original, tipo_cambio: f.tipo_cambio ?? tcVigente(f.moneda, f.fecha_gasto),
    metodo_pago_id: f.metodo_pago_id ?? "", reembolsable: f.reembolsable, proyecto_id: f.proyecto_id ?? "",
    concepto: f.concepto ?? "", lugar: f.lugar ?? "", producto: f.producto ?? null, cantidad: f.cantidad ?? null, unidad: f.unidad ?? "und",
    precio_unitario: f.precio_unitario ?? null };
}
function selectCategorias(valor) {
  const grupos = {};
  for (const c of E.base.categorias) (grupos[c.categoria] ||= []).push(c);
  return h("select", { name: "categoria_id" }, h("option", { value: "" }, "— elegir —"),
    Object.entries(grupos).map(([g, cs]) => h("optgroup", { label: g },
      cs.map((c) => h("option", { value: c.id, selected: String(c.id) === String(valor) }, c.subcategoria)))));
}
function selectLista(nombre, lista, valor, vacio) {
  return h("select", { name: nombre }, h("option", { value: "" }, vacio),
    lista.map((x) => h("option", { value: x.id, selected: String(x.id) === String(valor) }, x.nombre)));
}

function bloqueFila(f, marcados, i, quitar) {
  const campo = (clave, etiqueta, control) =>
    h("label", { class: `campo ${marcados.includes(clave) ? "en-duda" : ""}`, "data-campo": clave }, etiqueta, control);
  const tc = h("input", { name: "tipo_cambio", type: "number", step: "0.0000000001", min: "0", value: f.tipo_cambio ?? "" });
  const filaTc = campo("moneda", "Tipo de cambio (S/ por unidad)", tc);
  const moneda = h("select", { name: "moneda", onchange: () => {
    filaTc.hidden = moneda.value === "PEN"; tc.value = tcVigente(moneda.value) ?? "";
  } }, ["PEN", "USD", "COP"].map((m) => h("option", { value: m, selected: m === f.moneda }, m)));
  filaTc.hidden = f.moneda === "PEN";
  const reemb = h("input", { type: "checkbox", name: "reembolsable", checked: !!f.reembolsable });
  const extraReemb = h("div", { class: "sub" },
    campo("proyecto", "Proyecto", selectLista("proyecto_id", E.base.proyectos, f.proyecto_id, "— proyecto —")),
    h("label", { class: "campo" }, "Concepto", h("input", { name: "concepto", value: f.concepto || "", placeholder: "viaje de obra, salida tarde…" })));
  extraReemb.hidden = !f.reembolsable;
  reemb.addEventListener("change", () => { extraReemb.hidden = !reemb.checked; });
  // Detalle de la compra (opcional): lugar, producto, cantidad y precio unitario
  const num = (n, v, paso, ph) => h("input", { name: n, type: "number", step: paso, min: "0", inputmode: "decimal", value: v ?? "", placeholder: ph || "" });
  const cant = num("cantidad", f.cantidad, "0.001"), pu = num("precio_unitario", f.precio_unitario, "0.0001");
  const unidad = h("select", { name: "unidad" }, [["und", "und"], ["kg", "kg"], ["L", "L"]]
    .map(([v, t]) => h("option", { value: v, selected: v === (f.unidad || "und") }, t)));
  const hayDetalle = !!(f.lugar || f.producto || f.precio_unitario || (f.cantidad && f.cantidad !== 1));
  const detalle = h("details", { class: "detalle-compra", open: hayDetalle || marcados.includes("monto_original") },
    h("summary", {}, "Detalle de la compra (lugar, producto, precio)"),
    h("label", { class: "campo" }, "Lugar", h("input", { name: "lugar", value: f.lugar || "", placeholder: "Plaza Vea, Tottus, mercado…" })),
    h("label", { class: "campo" }, "Producto", h("input", { name: "producto", value: f.producto || "", placeholder: "Leche Gloria 400 g" })),
    h("div", { class: "tres" },
      campo("monto_original", "Cantidad", cant), h("label", { class: "campo" }, "Unidad", unidad),
      campo("monto_original", "Precio unitario", pu)),
    h("p", { class: "suave pequeño" }, "Si pones cantidad y precio, el monto se calcula solo. Al peso: pon el monto y el precio por kg, y la cantidad se calcula."));
  const bloque = h("fieldset", { class: "fila-form", "data-i": i },
    h("legend", {}, `Movimiento ${i + 1}`, quitar ? h("button", { type: "button", class: "enlace", onclick: quitar }, "Quitar") : null),
    h("div", { class: "dos" },
      campo("fecha_gasto", "Fecha", h("input", { name: "fecha_gasto", type: "date", value: f.fecha_gasto, max: hoyLima(), required: true })),
      h("label", { class: "campo" }, "Tipo", h("select", { name: "tipo" },
        ["Gasto", "Reembolso", "Ingreso ocasional", "Inversión"].map((t) => h("option", { value: t, selected: t === f.tipo }, t))))),
    campo("clasificacion", "Categoría", selectCategorias(f.categoria_id)),
    campo("descripcion", "Descripción", h("input", { name: "descripcion", value: f.descripcion || "", required: true })),
    h("div", { class: "dos" },
      campo("monto_original", "Monto", h("input", { name: "monto_original", type: "number", step: "0.01", min: "0.01", inputmode: "decimal", value: f.monto_original ?? "", required: true })),
      h("label", { class: "campo" }, "Moneda", moneda)),
    filaTc,
    campo("metodo_pago", "Método de pago", selectLista("metodo_pago_id", E.base.metodos, f.metodo_pago_id, "— método —")),
    detalle,
    h("label", { class: "check" }, reemb, " Lo reembolsa la empresa"), extraReemb);
  // Cálculos de ayuda: cantidad × precio -> monto; al peso, monto / precio -> cantidad
  const montoIn = bloque.querySelector("[name=monto_original]");
  const r2 = (x) => Math.round(x * 100) / 100;
  const recalcular = (origen) => {
    const c = Number(cant.value), p = Number(pu.value), m = Number(montoIn.value);
    if (unidad.value === "kg") {
      // Al peso, lo pagado manda: el peso sale de monto / precio por kg (salvo que se escriba el peso a mano)
      if (origen === "cantidad" && c > 0 && p > 0) montoIn.value = r2(c * p).toFixed(2);
      else if (p > 0 && m > 0) cant.value = (Math.round((m / p) * 1000) / 1000).toString();
    } else if (c > 0 && p > 0 && origen !== "monto") montoIn.value = r2(c * p).toFixed(2);
  };
  cant.addEventListener("change", () => recalcular("cantidad"));
  pu.addEventListener("change", () => recalcular("precio"));
  unidad.addEventListener("change", () => recalcular("unidad"));
  montoIn.addEventListener("change", () => recalcular("monto"));
  return bloque;
}
function leerFila(b) {
  const v = (n) => b.querySelector(`[name=${n}]`);
  const moneda = v("moneda").value;
  const nOnull = (n) => (v(n).value === "" ? null : Number(v(n).value));
  const cantidad = nOnull("cantidad"), precio = nOnull("precio_unitario");
  return { lugar: v("lugar").value.trim() || null, producto: v("producto").value.trim() || null,
    cantidad: cantidad || (precio ? 1 : null), unidad: v("unidad").value, precio_unitario: precio || null,
    fecha_gasto: v("fecha_gasto").value, tipo: v("tipo").value,
    categoria_id: v("categoria_id").value ? Number(v("categoria_id").value) : null, descripcion: v("descripcion").value.trim(),
    moneda, monto_original: Number(v("monto_original").value), tipo_cambio: moneda === "PEN" ? 1 : Number(v("tipo_cambio").value),
    metodo_pago_id: v("metodo_pago_id").value ? Number(v("metodo_pago_id").value) : null, reembolsable: v("reembolsable").checked,
    proyecto_id: v("reembolsable").checked && v("proyecto_id").value ? Number(v("proyecto_id").value) : null,
    concepto: v("reembolsable").checked ? v("concepto").value.trim() || null : null };
}

function formularioMovimientos(filas, marcados = [], motivo) {
  const cont = h("form", { class: "tarjeta", id: "formulario", novalidate: true });
  const lista = h("div", {});
  const pintar = () => lista.replaceChildren(...filas.map((f, i) =>
    bloqueFila(f, marcados, i, filas.length > 1 ? () => { filas = leerTodas(); filas.splice(i, 1); pintar(); } : null)));
  const leerTodas = () => [...lista.querySelectorAll(".fila-form")].map(leerFila);
  pintar();
  const err = h("ul", { class: "mensajes" });
  const guardar = h("button", { class: "primario", type: "submit" }, "Guardar");
  cont.addEventListener("submit", async (e) => {
    e.preventDefault(); err.replaceChildren();
    cargando(guardar, true, "Guardando…");
    try {
      const r = await api.funcion({ accion: "guardar_manual", filas: leerTodas() });
      if (r._status === 422) { err.replaceChildren(...r.errores.map((x) => h("li", { class: "error" }, "✗ ", x))); cargando(guardar, false); return; }
      if (r._status !== 200) throw new Error(r.error || `Error ${r._status}`);
      E.dictado = null; prepararDeshacer(r.lote_id, r.guardados); irA("dictar");
    } catch (x) { toast(x.message); cargando(guardar, false); }
  });
  cont.append(...[h("h2", {}, "Completar a mano"),
    motivo?.length ? h("div", { class: "aviso" }, h("p", {}, "Revisa lo marcado en rojo suave:"), h("ul", {}, motivo.map((m) => h("li", {}, m)))) : null,
    lista, h("button", { type: "button", class: "enlace", onclick: () => { filas = [...leerTodas(), filaVacia()]; pintar(); } }, "+ Agregar otro movimiento"),
    err, h("div", { class: "fila-botones" },
      h("button", { type: "button", class: "secundario", onclick: () => { E.dictado = null; irA("dictar"); } }, "Cancelar"), guardar)].filter(Boolean));
  return cont;
}

// ───────────── MOVIMIENTOS ─────────────
async function vistaMovimientos(v) {
  const cab = h("div", { class: "mes" },
    h("button", { class: "secundario", "aria-label": "Mes anterior", onclick: () => { E.mes = moverMes(E.mes, -1); irA("movimientos"); } }, "‹"),
    h("h2", {}, nombreMes(E.mes)),
    h("button", { class: "secundario", "aria-label": "Mes siguiente", disabled: E.mes >= hoyLima().slice(0, 7), onclick: () => { E.mes = moverMes(E.mes, 1); irA("movimientos"); } }, "›"));
  const q = h("input", { type: "search", id: "buscar", placeholder: "Buscar en todo el historial (taxi, Plaza Vea, leche…)", enterkeyhint: "search" });
  const buscador = h("form", { class: "buscador", onsubmit: async (e) => {
    e.preventDefault(); if (q.value.trim().length < 2) return;
    const zona = $("#vista"); zona.replaceChildren(buscador, h("p", { class: "centro suave" }, "Buscando…"));
    try {
      const res = await api.buscar(q.value.trim());
      const tot = res.filter((m) => m.tipo === "Gasto").reduce((a, m) => a + m.monto_pen, 0);
      zona.replaceChildren(buscador,
        h("p", { class: "suave" }, `${res.length}${res.length === 200 ? "+" : ""} resultados · gastos por ${soles(tot)} `,
          h("button", { type: "button", class: "enlace", onclick: () => irA("movimientos") }, "volver al mes")),
        listaMovimientos(res, true));
    } catch (x) { toast(x.message); }
  } }, q);
  v.append(buscador, cab, h("p", { class: "centro suave" }, "Cargando…"));
  let movs;
  try { movs = await api.movimientos(`${E.mes}-01`, finDeMes(E.mes)); } catch (x) { v.lastChild.textContent = x.message; return; }
  const gastos = movs.filter((m) => m.tipo === "Gasto" || m.tipo === "Inversión");
  const totG = gastos.reduce((s, m) => s + m.monto_pen, 0);
  const totE = movs.filter((m) => esEntrada(m.tipo)).reduce((s, m) => s + m.monto_pen, 0);
  const porCat = {};
  for (const m of gastos) porCat[m.categoria || m.tipo] = (porCat[m.categoria || m.tipo] || 0) + m.monto_pen;
  const max = Math.max(1, ...Object.values(porCat));
  const resumen = h("section", { class: "tarjeta" },
    h("div", { class: "kpis" }, h("div", {}, h("span", { class: "suave" }, "Gastos"), h("strong", {}, soles(totG))),
      h("div", {}, h("span", { class: "suave" }, "Entradas"), h("strong", { class: "positivo" }, soles(totE))),
      h("div", {}, h("span", { class: "suave" }, "Neto"), h("strong", {}, soles(totE - totG)))),
    h("div", { class: "barras" }, Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([c, x]) =>
      h("div", { class: "barra" }, h("span", { class: "et" }, c), h("span", { class: "pista" }, h("span", { class: "relleno", style: `width:${(x / max) * 100}%` })),
        h("span", { class: "val" }, soles(x))))));
  v.lastChild.replaceWith(resumen, movs.length ? listaMovimientos(movs) : h("p", { class: "centro suave" }, "Sin movimientos este mes."));
}

function listaMovimientos(movs, conAnio = false) {
  let fecha = "";
  const lista = h("ul", { class: "lista-mov" });
  for (const m of movs) {
    if (m.fecha_gasto !== fecha) { fecha = m.fecha_gasto; lista.append(h("li", { class: "dia" }, conAnio ? fecha.split("-").reverse().join("/") : ddmm(fecha))); }
    lista.append(h("li", { class: "mov", onclick: () => detalleMovimiento(m) },
      h("div", {}, h("div", {}, m.descripcion), h("div", { class: "suave pequeño" },
        [m.subcategoria || m.tipo, m.metodo, m.lugar, m.reembolsable ? `🧾 ${m.estado_reembolso}` : null].filter(Boolean).join(" · "))),
      h("strong", { class: esEntrada(m.tipo) ? "positivo" : "" }, `${esEntrada(m.tipo) ? "+" : ""}${monto(m.monto_original, m.moneda)}`)));
  }
  return lista;
}

async function detalleMovimiento(m) {
  const dato = (k, x) => (x ? h("div", { class: "dato" }, h("span", { class: "suave" }, k), h("span", {}, x)) : null);
  const accion = await modal(m.descripcion, h("div", {},
    dato("Fecha", m.fecha_gasto), dato("Tipo", m.tipo), dato("Categoría", m.categoria && `${m.categoria} / ${m.subcategoria}`),
    dato("Monto", monto(m.monto_original, m.moneda)), m.moneda !== "PEN" ? dato("En soles", `${soles(m.monto_pen)} (TC ${m.tipo_cambio})`) : null,
    dato("Método", m.metodo), dato("Lugar", m.lugar), dato("Producto", m.producto),
    m.cantidad && m.precio_unitario ? dato("Cantidad", `${m.cantidad.toLocaleString("es-PE", { maximumFractionDigits: 3 })} ${m.unidad || "und"} × ${soles(m.precio_unitario)}`)
      : m.cantidad && m.cantidad !== 1 ? dato("Cantidad", `${m.cantidad} ${m.unidad || "und"}`) : null,
    m.reembolsable ? dato("Reembolso", `${m.estado_reembolso} · ${m.proyecto || "sin proyecto"}`) : null,
    dato("Concepto", m.concepto), dato("Origen", m.origen)),
  [{ texto: "Borrar", valor: "borrar", clase: "peligro" }, { texto: "Editar", valor: "editar" }, { texto: "Cerrar", valor: null, clase: "primario" }]);
  if (accion === "borrar" && await confirmar("¿Borrar este movimiento?", `${m.descripcion} · ${monto(m.monto_original, m.moneda)}. No se puede deshacer.`, "Borrar")) {
    try { await api.borrarMovimiento(m.id); toast("Movimiento borrado"); irA("movimientos"); } catch (x) { toast(x.message); }
  }
  if (accion === "editar") editarMovimiento(m);
}
function editarMovimiento(m) {
  const v = $("#vista");
  const bloque = bloqueFila({ ...m, categoria_id: m.categoria_id ?? "", metodo_pago_id: m.metodo_pago_id ?? "", proyecto_id: m.proyecto_id ?? "" }, [], 0);
  const err = h("p", { class: "error" });
  const guardar = h("button", { class: "primario", type: "submit" }, "Guardar cambios");
  const form = h("form", { class: "tarjeta", onsubmit: async (e) => {
    e.preventDefault(); const f = leerFila(bloque);
    if (f.cantidad && f.precio_unitario && Math.abs(f.cantidad * f.precio_unitario - f.monto_original) > 0.01) {
      err.textContent = `Cantidad × precio da ${fmt.format(f.cantidad * f.precio_unitario)}, no ${fmt.format(f.monto_original)}.`; return;
    }
    if (!(f.monto_original > 0) || !f.descripcion || !f.metodo_pago_id || (f.tipo === "Gasto" && !f.categoria_id) || !(f.tipo_cambio > 0)) {
      err.textContent = "Revisa monto, descripción, método, categoría y tipo de cambio."; return;
    }
    cargando(guardar, true, "Guardando…");
    try {
      await api.actualizarMovimiento(m.id, { fecha_gasto: f.fecha_gasto, tipo: f.tipo, categoria_id: f.categoria_id, descripcion: f.descripcion,
        moneda: f.moneda, monto_original: f.monto_original, tipo_cambio: f.tipo_cambio,
        monto_pen: Math.round(f.monto_original * f.tipo_cambio * 100) / 100, metodo_pago_id: f.metodo_pago_id,
        reembolsable: f.reembolsable, proyecto_id: f.proyecto_id, concepto: f.concepto,
        lugar: f.lugar, producto: f.producto, cantidad: f.cantidad, unidad: f.unidad, precio_unitario: f.precio_unitario,
        estado_reembolso: f.reembolsable ? (m.estado_reembolso || "Pendiente") : null });
      toast("Cambios guardados"); irA("movimientos");
    } catch (x) { err.textContent = x.message; cargando(guardar, false); }
  } }, h("h2", {}, "Editar movimiento"), bloque, err,
  h("div", { class: "fila-botones" }, h("button", { type: "button", class: "secundario", onclick: () => irA("movimientos") }, "Cancelar"), guardar));
  v.replaceChildren(form);
}

// ───────────── ANÁLISIS ─────────────
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesCorto = (ym) => `${MES_CORTO[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;
const diasDelMes = (ym) => Number(finDeMes(ym).slice(8, 10));
const r2 = (x) => Math.round(x * 100) / 100;

/** Acumulado día a día de un mes: [[día, acumulado], ...] hasta `hastaDia`. */
function acumuladoDiario(diario, ym, hastaDia) {
  const porDia = {}; diario.filter((d) => d.fecha.startsWith(ym)).forEach((d) => (porDia[Number(d.fecha.slice(8, 10))] = d.gasto));
  const pts = []; let acc = 0;
  for (let dia = 1; dia <= hastaDia; dia++) { acc += porDia[dia] || 0; pts.push([dia, r2(acc)]); }
  return pts;
}

async function vistaAnalisis(v) {
  v.append(h("p", { class: "centro suave" }, "Calculando…"));
  try { await api.asegurarMes(); } catch { /* si falla, se muestra lo que haya */ }
  const hoy = hoyLima(), ym = hoy.slice(0, 7), diaHoy = Number(hoy.slice(8, 10));
  let metas, resumen, diario, presup;
  try {
    [metas, resumen, diario, presup] = await Promise.all([api.metas(), api.resumenMensual(),
      api.gastoDiario(`${moverMes(ym, -6)}-01`), api.presupuestos()]);
  } catch (x) { v.lastChild.textContent = x.message; return; }
  const metaDe = (m) => metas.find((x) => x.mes.startsWith(m));
  const metaAct = metaDe(ym);
  const porMes = {}; // mes -> {gasto, reemb, devuelto, cats{}}
  for (const r of resumen) {
    const o = (porMes[r.mes] ||= { gasto: 0, reemb: 0, devuelto: 0, cats: {} });
    o.gasto += r.gasto; o.reemb += r.reembolsable; o.devuelto += r.devuelto;
    if (r.gasto) o.cats[r.categoria] = (o.cats[r.categoria] || 0) + r.gasto;
  }
  const meses = Object.keys(porMes).sort();

  // 1) Este mes frente a la meta
  const actual = acumuladoDiario(diario, ym, diaHoy);
  const gastado = actual.length ? actual[actual.length - 1][1] : 0;
  const meta = metaAct?.meta ?? null;
  const proyeccion = r2((gastado / Math.max(1, diaHoy)) * diasDelMes(ym));
  const prev6 = [1, 2, 3, 4, 5, 6].map((k) => moverMes(ym, -k)).filter((m) => porMes[m]);
  const promedio = [];
  for (let dia = 1; dia <= diasDelMes(ym); dia++) {
    const vals = prev6.map((m) => { const a = acumuladoDiario(diario, m, Math.min(dia, diasDelMes(m))); return a.length ? a[a.length - 1][1] : 0; });
    if (vals.length) promedio.push([dia, r2(vals.reduce((x, y) => x + y, 0) / vals.length)]);
  }
  const pasado = meta !== null && gastado > meta;
  const kpi = (et, val, clase) => h("div", {}, h("span", { class: "suave" }, et), h("strong", { class: clase || "" }, val));
  const seccionMes = h("section", { class: "tarjeta" }, h("h2", {}, `Este mes · ${nombreMes(ym)}`),
    h("div", { class: "kpis" }, kpi("Gastado", soles(gastado)), kpi("Meta", meta === null ? "—" : soles(meta)),
      pasado ? kpi("Te pasaste por", soles(gastado - meta), "alerta") : kpi("Te queda", meta === null ? "—" : soles(meta - gastado), "positivo")),
    h("p", { class: `estado ${proyeccion > (meta ?? Infinity) ? "mal" : "bien"}` },
      proyeccion > (meta ?? Infinity) ? "⚠ " : "✓ ",
      `A este ritmo cerrarías el mes en ${soles(proyeccion)}`, meta !== null ? (proyeccion > meta ? ", por encima de la meta." : ", dentro de la meta.") : "."),
    lineas({ titulo: "Gasto acumulado del mes", series: [
      { nombre: "Este mes", color: COLORES.gasto, puntos: actual, etiqueta: true },
      ...(promedio.length ? [{ nombre: `Promedio ${prev6.length} meses`, color: COLORES.promedio, puntos: promedio, etiqueta: true }] : [])],
    refs: meta !== null ? [{ y: meta, nombre: "Meta" }] : [], xMin: 1, xMax: diasDelMes(ym), etiquetaX: (d) => `día ${d}`, formato: soles }),
    h("p", { class: "suave pequeño" }, "No incluye lo reembolsable: eso va aparte, más abajo."));

  // 2) Crecimiento: gasto de cada mes con su meta, y total acumulado
  const ult12 = meses.filter((m) => m <= ym).slice(-12);
  let acum = 0; const acumPts = meses.filter((m) => m <= ym).map((m, i) => [i, r2((acum += porMes[m].gasto))]);
  const todos = meses.filter((m) => m <= ym);
  const seccionCrec = h("section", { class: "tarjeta" }, h("h2", {}, "Gasto mensual"),
    barras({ nombre: "Gasto", nombreMarca: "Meta", formato: soles, titulo: "Gasto de cada mes con su meta",
      barras: ult12.map((m) => { const mt = metaDe(m)?.meta; const g = r2(porMes[m].gasto);
        return { etiqueta: mesCorto(m), valor: g, marca: mt,
          detalle: mt ? `<div>${m === ym ? "Mes en curso" : g <= mt ? "✓ Cumplió" : "⚠ Se pasó"}</div>` : "" }; }) }),
    h("h3", {}, `Total acumulado desde ${nombreMes(todos[0] || ym)}`),
    lineas({ titulo: "Gasto total acumulado", series: [{ nombre: "Acumulado", color: COLORES.gasto, puntos: acumPts, etiqueta: true }],
      xMin: 0, xMax: Math.max(1, acumPts.length - 1), etiquetaX: (i) => mesCorto(todos[i] || ym), formato: soles }));

  // 3) Reembolsables, aparte: lo que va sumando y lo que falta cobrar
  let porCobrar = 0; const cobrarPts = todos.map((m, i) => [i, r2((porCobrar += porMes[m].reemb - porMes[m].devuelto))]);
  const reembMeses = ult12.filter((m) => porMes[m].reemb > 0 || porMes[m].devuelto > 0);
  const seccionReemb = h("section", { class: "tarjeta" }, h("h2", {}, "Reembolsables (aparte)"),
    h("div", { class: "kpis" }, kpi("Por cobrar hoy", soles(Math.max(0, porCobrar)), porCobrar > 0 ? "alerta" : ""),
      kpi("Este mes", soles(porMes[ym]?.reemb || 0)), kpi("Últimos 12 meses", soles(ult12.reduce((a, m) => a + porMes[m].reemb, 0)))),
    reembMeses.length ? barras({ nombre: "Pagado por ti", color: COLORES.reembolso, formato: soles, titulo: "Reembolsables por mes",
      barras: ult12.map((m) => ({ etiqueta: mesCorto(m), valor: r2(porMes[m].reemb), detalle: `<div>Devuelto: <b>${soles(porMes[m].devuelto)}</b></div>` })) }) : null,
    h("h3", {}, "Por cobrar acumulado"),
    lineas({ titulo: "Saldo por cobrar a la empresa", series: [{ nombre: "Por cobrar", color: COLORES.reembolso, puntos: cobrarPts.map(([i, y]) => [i, Math.max(0, y)]), etiqueta: true }],
      xMin: 0, xMax: Math.max(1, cobrarPts.length - 1), etiquetaX: (i) => mesCorto(todos[i] || ym), formato: soles }),
    h("p", { class: "suave pequeño" }, "Sube cuando pagas algo reembolsable y baja cuando la empresa te devuelve."));

  // 4) Presupuestos por categoría
  const seccionPres = seccionPresupuestos(porMes, ym, presup, meta);

  // 5) Reporte del mes anterior y 6) cómo se calculó la meta
  const rep = metaAct?.reporte;
  const seccionRep = rep && rep.mes ? h("section", { class: "tarjeta" }, h("h2", {}, `Reporte de ${nombreMes(rep.mes)}`),
    h("p", { class: `estado ${rep.cumplio ? "bien" : "mal"}` }, rep.cumplio ? "✓ Cumpliste la meta" : "⚠ No cumpliste la meta",
      `: gastaste ${soles(rep.gasto)} con meta de ${soles(rep.meta)} (${rep.cumplio ? "sobraron" : "te pasaste por"} ${soles(Math.abs(rep.diferencia))}).`),
    rep.variacion_vs_promedio_pct !== null && rep.variacion_vs_promedio_pct !== undefined
      ? h("p", {}, `Frente a tu promedio de 12 meses (${soles(rep.promedio_12m)}): ${rep.variacion_vs_promedio_pct > 0 ? "+" : ""}${rep.variacion_vs_promedio_pct}%.`) : null,
    rep.dia_supero_meta ? h("p", {}, `Pasaste la meta el ${rep.dia_supero_meta.split("-").reverse().join("/")}.`) : null,
    h("table", { class: "tabla" }, h("thead", {}, h("tr", {}, h("th", {}, "Categoría"), h("th", {}, "Gasto"), h("th", {}, "Prom. 6m"), h("th", {}, "Presup."))),
      h("tbody", {}, (rep.por_categoria || []).slice(0, 8).map((c) => h("tr", {}, h("td", {}, c.categoria), h("td", {}, fmt.format(c.gasto)),
        h("td", { class: c.promedio_6m && c.gasto > c.promedio_6m * 1.2 ? "alerta" : "" }, c.promedio_6m ? fmt.format(c.promedio_6m) : "—"),
        h("td", { class: c.presupuesto && c.gasto > c.presupuesto ? "alerta" : "" }, c.presupuesto ? fmt.format(c.presupuesto) : "—"))))),
    h("h3", {}, "Mayores gastos"),
    h("ul", { class: "simple" }, (rep.mayores_gastos || []).map((g) => h("li", {}, `${ddmm(g.fecha)} · ${g.descripcion} · `, h("strong", {}, soles(g.monto))))),
    rep.reembolsables ? h("p", { class: "suave" }, `Reembolsables del mes: ${soles(rep.reembolsables.gastado_mes)} · por cobrar al cierre: ${soles(rep.reembolsables.por_cobrar_al_cierre)}.`) : null) : null;

  const c = metaAct?.calculo;
  const seccionCalc = c ? h("details", { class: "tarjeta" }, h("summary", {}, "¿Cómo se calculó la meta de este mes?"),
    h("p", { class: "pequeño" }, c.tope
      ? `Mediana de los últimos ${c.meses.length} meses: ${soles(c.mediana)}. Tope de mes "normal" (mediana × 1,25): ${soles(c.tope)}. Promedio de los meses normales: ${soles(c.promedio_normales)}. Meta = promedio redondeado hacia arriba a la centena − S/ 200 = ${soles(c.meta)}.`
      : c.metodo),
    h("ul", { class: "simple pequeño" }, (c.meses || []).map((m) => h("li", { class: m.incluido === false ? "tachado" : "" },
      `${nombreMes(m.mes)}: ${soles(m.gasto)}${m.incluido === false ? " (fuera: mes atípico)" : ""}`))),
    h("p", { class: "suave pequeño" }, "Se calcula sola el día 1 de cada mes y no cambia durante el mes.")) : null;

  v.lastChild.replaceWith(...[seccionMes, seccionCrec, seccionReemb, seccionPres, seccionRep, seccionCalc, seccionPrecios()].filter(Boolean));
}

function seccionPresupuestos(porMes, ym, presup, meta) {
  const sec = h("section", { class: "tarjeta" });
  const previos = [1, 2, 3, 4, 5, 6].map((k) => moverMes(ym, -k)).filter((m) => porMes[m]);
  const cats = [...new Set([...presup.map((p) => p.categoria), ...previos.flatMap((m) => Object.keys(porMes[m].cats)),
    ...Object.keys(porMes[ym]?.cats || {})])].filter((c) => c !== "Sin categoría");
  const sugerido = (cat) => { const vals = previos.map((m) => porMes[m].cats[cat] || 0).sort((a, b) => a - b); const n = vals.length;
    const med = n ? (n % 2 ? vals[(n - 1) / 2] : (vals[n / 2 - 1] + vals[n / 2]) / 2) : 0; return Math.ceil(med / 10) * 10; };
  const pres = Object.fromEntries(presup.map((p) => [p.categoria, p.monto]));
  const mostrar = () => {
    const gastoCat = porMes[ym]?.cats || {};
    const filas = cats.map((c) => ({ c, g: gastoCat[c] || 0, p: pres[c] || 0 })).sort((a, b) => (b.p ? b.g / b.p : 0) - (a.p ? a.g / a.p : 0) || b.g - a.g);
    const suma = Object.values(pres).reduce((a, x) => a + x, 0);
    sec.replaceChildren(h("h2", {}, "Presupuestos por categoría"),
      h("p", { class: "suave pequeño" }, suma ? `Tus presupuestos suman ${soles(suma)}${meta !== null ? ` · meta del mes ${soles(meta)}` : ""}.` : "Aún no tienes presupuestos. Pulsa «Editar» y luego «Sugerir según mi historial»."),
      h("ul", { class: "presup" }, filas.filter((f) => f.g > 0 || f.p > 0).map((f) => {
        const pct = f.p ? (f.g / f.p) * 100 : 0;
        return h("li", {}, h("div", { class: "linea1" }, h("span", {}, f.c),
          h("span", { class: f.p && f.g > f.p ? "alerta" : "" }, f.p ? `${f.g > f.p ? "⚠ " : ""}${soles(f.g)} de ${soles(f.p)}` : `${soles(f.g)} · sin presupuesto`)),
        f.p ? h("div", { class: "pista" }, h("span", { class: `relleno ${f.g > f.p ? "pasado" : ""}`, style: `width:${Math.min(100, pct)}%` })) : null);
      })),
      h("button", { class: "secundario ancho", id: "editar-presupuestos", onclick: editar }, "Editar presupuestos"));
  };
  const editar = () => {
    const inputs = cats.map((c) => ({ c, inp: h("input", { type: "number", min: "0", step: "10", inputmode: "decimal", value: pres[c] || "", placeholder: `sugerido ${sugerido(c)}` }) }));
    const total = h("strong", {});
    const sumar = () => { total.textContent = soles(inputs.reduce((a, x) => a + (Number(x.inp.value) || 0), 0)); };
    inputs.forEach((x) => x.inp.addEventListener("input", sumar)); sumar();
    sec.replaceChildren(h("h2", {}, "Editar presupuestos"),
      h("p", { class: "suave pequeño" }, "Monto mensual en soles por categoría. Vacío = sin presupuesto. El sugerido es la mediana de tus últimos 6 meses."),
      h("button", { class: "enlace", id: "sugerir", onclick: () => { inputs.forEach((x) => (x.inp.value = sugerido(x.c) || "")); sumar(); } }, "Sugerir según mi historial"),
      h("div", { class: "presup-form" }, inputs.map((x) => h("label", { class: "campo fila-presup" }, h("span", {}, x.c), x.inp))),
      h("p", { class: "derecha" }, "Total: ", total, meta !== null ? ` · meta ${soles(meta)}` : ""),
      h("div", { class: "fila-botones" }, h("button", { class: "secundario", onclick: mostrar }, "Cancelar"),
        h("button", { class: "primario", id: "guardar-presupuestos", onclick: async () => {
          const lista = inputs.map((x) => ({ categoria: x.c, monto: Number(x.inp.value) || 0 }));
          try { await api.guardarPresupuestos(lista); lista.forEach((p) => { if (p.monto > 0) pres[p.categoria] = p.monto; else delete pres[p.categoria]; });
            toast("Presupuestos guardados"); mostrar(); } catch (e) { toast(e.message); }
        } }, "Guardar")));
  };
  mostrar();
  return sec;
}

function seccionPrecios() {
  const sec = h("section", { class: "tarjeta" }, h("h2", {}, "Precios por producto"));
  const q = h("input", { type: "search", id: "buscar-producto", placeholder: "Busca un producto (leche, manzana…)" });
  const res = h("div", {});
  let compras = null;
  const pintar = async () => {
    if (!compras) { res.replaceChildren(h("p", { class: "suave" }, "Cargando…")); compras = await api.compras(); }
    const t = q.value.trim().toLowerCase();
    const grupos = {};
    for (const c of compras) if (!t || c.producto.toLowerCase().includes(t)) (grupos[c.producto.toLowerCase()] ||= []).push(c);
    const lista = Object.values(grupos).sort((a, b) => (a[0].fecha_gasto < b[0].fecha_gasto ? 1 : -1)).slice(0, 30);
    if (!compras.length) return res.replaceChildren(h("p", { class: "suave" }, "Todavía no hay productos: aparecen cuando dictas compras con producto y precio."));
    res.replaceChildren(h("ul", { class: "lista-mov" }, lista.map((g) => {
      const u = g[0], precios = g.filter((x) => x.precio_unitario).map((x) => x.precio_unitario);
      const det = h("div", { class: "historial", hidden: true }, h("table", { class: "tabla" },
        h("thead", {}, h("tr", {}, h("th", {}, "Fecha"), h("th", {}, "Lugar"), h("th", {}, "Precio"), h("th", {}, "Cant."))),
        h("tbody", {}, g.map((x) => h("tr", {}, h("td", {}, ddmm(x.fecha_gasto) + "/" + x.fecha_gasto.slice(2, 4)), h("td", {}, x.lugar || "—"),
          h("td", {}, x.precio_unitario ? `${fmt.format(x.precio_unitario)}${x.unidad === "kg" ? "/kg" : x.unidad === "L" ? "/L" : ""}` : "—"),
          h("td", {}, x.cantidad ? `${x.cantidad.toLocaleString("es-PE", { maximumFractionDigits: 3 })} ${x.unidad || ""}` : "—"))))));
      return h("li", { class: "mov columna", onclick: () => (det.hidden = !det.hidden) },
        h("div", { class: "linea1" }, h("span", {}, u.producto), h("strong", {}, u.precio_unitario ? `${soles(u.precio_unitario)}${u.unidad === "kg" ? "/kg" : ""}` : soles(u.monto_pen))),
        h("div", { class: "suave pequeño" }, `${g.length} compra${g.length > 1 ? "s" : ""} · última ${ddmm(u.fecha_gasto)}${u.lugar ? " en " + u.lugar : ""}` +
          (precios.length > 1 ? ` · mín ${fmt.format(Math.min(...precios))} / máx ${fmt.format(Math.max(...precios))}` : "")), det);
    })));
  };
  q.addEventListener("input", () => { clearTimeout(q._t); q._t = setTimeout(pintar, 250); });
  sec.append(q, res, h("p", { class: "suave pequeño" }, "Se agrupan por el nombre tal como se dictó; el catálogo de la 2.1 unirá variantes."));
  pintar().catch((e) => res.replaceChildren(h("p", { class: "error" }, e.message)));
  return sec;
}

// ───────────── REEMBOLSOS ─────────────
async function vistaReembolsos(v) {
  v.append(h("p", { class: "centro suave" }, "Cargando…"));
  let items, devs;
  try { [items, devs] = await Promise.all([api.reembolsables(), api.devoluciones()]); } catch (x) { v.lastChild.textContent = x.message; return; }
  const pend = items.filter((m) => m.estado_reembolso === "Pendiente");
  const rep = items.filter((m) => m.estado_reembolso === "Reportado");
  const marcas = new Set(pend.map((m) => m.id));
  const total = h("strong", {});
  const actualizar = () => { total.textContent = soles(pend.filter((m) => marcas.has(m.id)).reduce((s, m) => s + m.monto_pen, 0)); };
  const filaItem = (m, conCheck) => h("li", { class: "mov" },
    conCheck ? h("input", { type: "checkbox", checked: true, "aria-label": m.descripcion,
      onchange: (e) => { e.target.checked ? marcas.add(m.id) : marcas.delete(m.id); actualizar(); } }) : null,
    h("div", { class: "crece" }, h("div", {}, m.descripcion), h("div", { class: "suave pequeño" }, `${ddmm(m.fecha_gasto)} · ${m.proyecto || "sin proyecto"}${m.concepto ? " · " + m.concepto : ""}`)),
    h("strong", {}, soles(m.monto_pen)),
    !conCheck ? h("button", { class: "enlace pequeño", onclick: async () => {
      if (await confirmar("¿Marcar como rechazado?", `${m.descripcion}: Pedelta no lo va a devolver.`, "Rechazado")) {
        await api.marcarEstado(m.id, "Rechazado"); irA("reembolsos");
      }
    } }, "Rechazado") : null);
  actualizar();
  const btnPdf = h("button", { class: "primario ancho", id: "generar-pdf", disabled: !pend.length, onclick: async () => {
    const sel = pend.filter((m) => marcas.has(m.id));
    if (!sel.length) return toast("Marca al menos un gasto");
    if (!await confirmar("Generar el reporte", `${sel.length} gastos por ${soles(sel.reduce((s, m) => s + m.monto_pen, 0))}. Quedarán como «Reportado».`, "Generar PDF")) return;
    try { await api.crearReporte(sel.map((m) => m.id), hoyLima()); generarPdf(sel); toast("Reporte generado"); irA("reembolsos"); }
    catch (x) { toast(x.message); }
  } }, "Generar reporte PDF");
  v.lastChild.replaceWith(
    h("section", { class: "tarjeta" }, h("h2", {}, `Pendientes de reportar (${pend.length})`),
      pend.length ? h("ul", { class: "lista-mov" }, pend.map((m) => filaItem(m, true))) : h("p", { class: "suave" }, "Nada pendiente."),
      pend.length ? h("p", { class: "derecha" }, "Seleccionado: ", total) : null, btnPdf),
    h("section", { class: "tarjeta" }, h("h2", {}, `Reportados, esperando devolución (${rep.length})`),
      rep.length ? h("ul", { class: "lista-mov" }, rep.map((m) => filaItem(m, false))) : h("p", { class: "suave" }, "Nada esperando.")),
    seccionConciliar(devs.filter((d) => d.monto_pen - d.conciliado > 0.004), [...rep, ...pend]));
}

function seccionConciliar(devs, items) {
  const s = h("section", { class: "tarjeta" }, h("h2", {}, "Registrar una devolución"));
  if (!devs.length) return s.append(h("p", { class: "suave" }, "Cuando llegue la plata, díctala primero (ej.: «me devolvió Pedelta 453 al BBVA débito») y luego vuelve aquí para decir qué gastos cubre.")), s;
  if (!items.length) return s.append(h("p", { class: "suave" }, "No hay gastos reportados o pendientes para conciliar.")), s;
  const sel = h("select", { id: "devolucion" }, devs.map((d) => h("option", { value: d.id },
    `${ddmm(d.fecha_gasto)} · ${d.descripcion} · ${soles(d.monto_pen)}${d.conciliado ? ` (quedan ${soles(d.monto_pen - d.conciliado)})` : ""}`)));
  const filas = items.map((m) => {
    const chk = h("input", { type: "checkbox" });
    const inp = h("input", { type: "number", step: "0.01", min: "0.01", max: m.monto_pen, value: m.monto_pen, class: "monto-chico" });
    return { m, chk, inp, nodo: h("li", { class: "mov" }, chk, h("div", { class: "crece" }, h("div", {}, m.descripcion),
      h("div", { class: "suave pequeño" }, `${ddmm(m.fecha_gasto)} · ${m.estado_reembolso}`)), inp) };
  });
  const dif = h("p", { class: "derecha" });
  const recalcular = () => {
    const d = devs.find((x) => x.id === sel.value); const saldo = d.monto_pen - d.conciliado;
    const suma = filas.filter((f) => f.chk.checked).reduce((s2, f) => s2 + Number(f.inp.value || 0), 0);
    const diff = Math.round((saldo - suma) * 100) / 100;
    dif.replaceChildren("Devolución: ", h("strong", {}, soles(saldo)), " · Gastos: ", h("strong", {}, soles(suma)),
      " · Diferencia: ", h("strong", { class: Math.abs(diff) < 0.005 ? "positivo" : "alerta" }, soles(diff)));
  };
  // Propuesta inicial: los reportados más antiguos que caben en la devolución (se puede cambiar a mano)
  const proponer = () => {
    const d = devs.find((x) => x.id === sel.value); let resto = d.monto_pen - d.conciliado;
    for (const f of filas) {
      f.inp.value = f.m.monto_pen;
      f.chk.checked = f.m.estado_reembolso === "Reportado" && f.m.monto_pen <= resto + 0.005;
      if (f.chk.checked) resto -= f.m.monto_pen;
    }
    recalcular();
  };
  sel.addEventListener("change", proponer);
  [...filas.flatMap((f) => [f.chk, f.inp])].forEach((x) => x.addEventListener("input", recalcular));
  proponer();
  const btn = h("button", { class: "primario ancho", id: "conciliar", onclick: async () => {
    const elegidos = filas.filter((f) => f.chk.checked).map((f) => ({ id: f.m.id, monto: Math.round(Number(f.inp.value) * 100) / 100, total: f.m.monto_pen }));
    if (!elegidos.length || elegidos.some((x) => !(x.monto > 0) || x.monto > x.total + 0.005)) return toast("Revisa los montos marcados");
    if (!await confirmar("Conciliar la devolución", `${elegidos.length} gastos quedarán como reembolsados.`, "Conciliar")) return;
    try { await api.conciliar(sel.value, elegidos); toast("Devolución conciliada"); irA("reembolsos"); } catch (x) { toast(x.message); }
  } }, "Conciliar");
  s.append(h("label", { class: "campo" }, "Devolución recibida", sel), h("p", { class: "suave pequeño" }, "¿Qué gastos cubre? (puedes poner un monto parcial)"),
    h("ul", { class: "lista-mov" }, filas.map((f) => f.nodo)), dif, btn);
  return s;
}

function generarPdf(items) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const tot = items.reduce((s, m) => s + m.monto_pen, 0);
  doc.setFontSize(15); doc.text("Gastos reembolsables", 40, 48);
  doc.setFontSize(10); doc.text(`${E.email} · Corte al ${hoyLima().split("-").reverse().join("/")}`, 40, 66);
  doc.autoTable({
    startY: 84, styles: { fontSize: 9, cellPadding: 4 }, headStyles: { fillColor: [41, 82, 74] },
    head: [["Fecha", "Proyecto", "Concepto", "Descripción", "Método", "Monto S/"]],
    body: items.map((m) => [m.fecha_gasto.split("-").reverse().join("/"), m.proyecto || "—", m.concepto || "—", m.descripcion, m.metodo, fmt.format(m.monto_pen)]),
    foot: [["", "", "", "", "Total", fmt.format(tot)]], footStyles: { fillColor: [235, 240, 238], textColor: 20, fontStyle: "bold" },
    columnStyles: { 5: { halign: "right" } },
  });
  doc.save(`reembolsos_${hoyLima()}.pdf`);
}

// ───────────── RECORRIDO (trazabilidad) ─────────────
async function vistaRecorrido(v) {
  v.append(h("p", { class: "centro suave" }, "Cargando…"));
  let recs, costo;
  try { [recs, costo] = await Promise.all([api.recorridos(60), api.costoMes(`${hoyLima().slice(0, 7)}-01T00:00:00-05:00`)]); }
  catch (x) { v.lastChild.textContent = x.message; return; }
  const ETQ = { listo: "listo", con_dudas: "con dudas", formulario: "a formulario" };
  v.lastChild.replaceWith(
    h("section", { class: "tarjeta" }, h("h2", {}, "Este mes"), h("p", {}, `${costo.llamadas} llamadas a la IA · US$ ${costo.total.toFixed(4)}`)),
    h("ul", { class: "lista-rec" }, recs.map((r) => h("li", { class: "tarjeta rec" },
      h("div", { class: "linea1" }, h("span", { class: "suave pequeño" },
        new Date(r.creado_en).toLocaleString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
        r.ronda === 2 ? " · ronda 2" : ""), h("span", { class: `chip ${r.resultado}` }, ETQ[r.resultado] || r.resultado)),
      h("p", {}, r.texto),
      listaMensajes({ errores: r.errores || [], dudas: r.dudas || [], notas: r.notas || [] }),
      r.costo_usd ? h("p", { class: "suave pequeño derecha" }, `US$ ${Number(r.costo_usd).toFixed(5)}`) : null))),
    ...(recs.length ? [] : [h("p", { class: "centro suave" }, "Todavía no hay dictados.")]));
}

// ───────────── MÁS: respaldo, contraseña, salir ─────────────
function vistaMas(v) {
  const ult = leerLocal("gg-ultimo-respaldo");
  const btnR = h("button", { class: "primario ancho", id: "respaldo", onclick: async () => {
    cargando(btnR, true, "Preparando el Excel…");
    try { await descargarRespaldo(); guardarLocal("gg-ultimo-respaldo", String(Date.now())); toast("Respaldo descargado"); irA("mas"); }
    catch (x) { toast(x.message); cargando(btnR, false); }
  } }, "Descargar respaldo (Excel)");
  const n1 = h("input", { type: "password", autocomplete: "new-password", placeholder: "Nueva contraseña (12+ caracteres)" });
  const n2 = h("input", { type: "password", autocomplete: "new-password", placeholder: "Repítela" });
  const err = h("p", { class: "error" });
  const btnC = h("button", { class: "secundario ancho", type: "submit" }, "Cambiar contraseña");
  v.append(
    h("section", { class: "tarjeta" }, h("h2", {}, "Respaldo"),
      h("p", { class: "suave" }, "Descarga un Excel con todos los movimientos de tu libro. Solo tú puedes descargar el tuyo."),
      h("p", { class: "pequeño" }, ult ? `Último respaldo: ${new Date(Number(ult)).toLocaleDateString("es-PE")}` : "Aún no has descargado un respaldo en este equipo."), btnR),
    h("form", { class: "tarjeta", onsubmit: async (e) => {
      e.preventDefault(); err.textContent = "";
      if (n1.value.length < 12) return (err.textContent = "Usa al menos 12 caracteres.");
      if (n1.value !== n2.value) return (err.textContent = "Las dos contraseñas no coinciden.");
      cargando(btnC, true, "Cambiando…");
      try { await api.cambiarClave(n1.value); n1.value = n2.value = ""; toast("Contraseña cambiada"); } catch (x) { err.textContent = x.message; }
      cargando(btnC, false);
    } }, h("h2", {}, "Contraseña"), n1, n2, err, btnC),
    h("section", { class: "tarjeta" }, h("h2", {}, "Recorrido de la IA"),
      h("p", { class: "suave" }, "Cada dictado con sus dudas, errores y costo."),
      h("button", { class: "secundario ancho", id: "ver-recorrido", onclick: () => irA("recorrido") }, "Ver recorrido")),
    h("section", { class: "tarjeta" }, h("p", { class: "suave" }, `Sesión: ${E.email}`),
      h("button", { class: "secundario ancho", onclick: async () => { await api.salir(); E.dictado = null; pantallaIngreso(); } }, "Cerrar sesión"),
      h("p", { class: "suave pequeño centro" }, `Gestor de Gastos ${VERSION}${DEMO ? " · demo" : ""}`)));
}

async function descargarRespaldo() {
  const movs = await api.todoElLibro();
  const filas = movs.map((m) => ({
    Fecha: m.fecha_gasto, Registrado: m.registrado_en ? new Date(m.registrado_en).toLocaleString("es-PE", { timeZone: "America/Lima" }) : "",
    Tipo: m.tipo, Categoría: m.categoria, Subcategoría: m.subcategoria, Descripción: m.descripcion, Moneda: m.moneda,
    "Monto original": m.monto_original, "Tipo de cambio": m.tipo_cambio, "Monto S/": m.monto_pen, Método: m.metodo, Lugar: m.lugar || "",
    Producto: m.producto || "", Cantidad: m.cantidad ?? "", Unidad: m.cantidad ? m.unidad : "", "Precio unitario": m.precio_unitario ?? "",
    Reembolsable: m.reembolsable ? "Sí" : "", Proyecto: m.proyecto, Concepto: m.concepto || "", "Estado reembolso": m.estado_reembolso || "",
    "Monto reembolsado": m.monto_reembolsado ?? "", Origen: m.origen,
  }));
  const ws = window.XLSX.utils.json_to_sheet(filas);
  ws["!cols"] = [10, 18, 10, 18, 22, 40, 7, 12, 12, 12, 13, 14, 24, 9, 7, 12, 12, 26, 22, 16, 14, 10].map((w) => ({ wch: w }));
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
  window.XLSX.writeFile(wb, `respaldo_gastos_${hoyLima()}.xlsx`);
}

window.__gg = { E, api, DEMO }; // para pruebas
iniciar();
