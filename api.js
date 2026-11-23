// Acceso a Supabase con la sesión del usuario. Todo pasa por la seguridad por libro (RLS):
// la app solo puede leer y escribir lo del propio libro. La clave pública es la única que va aquí.
const SELECT_MOV = "*, categorias(categoria, subcategoria), metodos_pago(nombre), proyectos(nombre)";

function plano(m) {
  return {
    ...m,
    categoria: m.categorias?.categoria ?? "", subcategoria: m.categorias?.subcategoria ?? "",
    metodo: m.metodos_pago?.nombre ?? "", proyecto: m.proyectos?.nombre ?? "",
    monto_original: Number(m.monto_original), monto_pen: Number(m.monto_pen),
    tipo_cambio: Number(m.tipo_cambio), monto_reembolsado: m.monto_reembolsado === null ? null : Number(m.monto_reembolsado),
    cantidad: m.cantidad === null ? null : Number(m.cantidad), precio_unitario: m.precio_unitario === null ? null : Number(m.precio_unitario),
  };
}
function ok(r) {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export function crearApi({ SUPABASE_URL, CLAVE_PUBLICA }) {
  const sb = window.supabase.createClient(SUPABASE_URL, CLAVE_PUBLICA, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "gg-sesion" },
  });
  let libroId = null;

  const api = {
    async sesion() {
      const { data } = await sb.auth.getSession();
      return data.session ? { email: data.session.user.email } : null;
    },
    async entrar(email, clave) {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: clave });
      if (error) throw new Error(error.message.includes("Invalid") ? "Correo o contraseña incorrectos" : error.message);
    },
    async salir() { await sb.auth.signOut(); libroId = null; },
    async cambiarClave(nueva) { ok(await sb.auth.updateUser({ password: nueva })); },

    async cargarBase() {
      const mi = ok(await sb.from("miembros_libro").select("libro_id, rol, libros(nombre)").order("rol"));
      if (!mi.length) throw new Error("Tu usuario no tiene un libro asignado");
      libroId = mi[0].libro_id;
      const [cat, met, proy, tc] = await Promise.all([
        sb.from("categorias").select("id, categoria, subcategoria").eq("activa", true).order("id"),
        sb.from("metodos_pago").select("id, nombre").eq("libro_id", libroId).eq("activo", true).order("nombre"),
        sb.from("proyectos").select("id, nombre").eq("libro_id", libroId).eq("activo", true).order("nombre"),
        sb.from("tipos_cambio").select("moneda, fecha, valor").order("fecha", { ascending: false }).limit(20),
      ]);
      return {
        libro: { id: libroId, nombre: mi[0].libros?.nombre ?? "Mi libro" },
        categorias: ok(cat), metodos: ok(met), proyectos: ok(proy),
        tiposCambio: ok(tc).map((t) => ({ ...t, valor: Number(t.valor) })),
      };
    },

    /** Llama a la función del servidor; devuelve el JSON con _status. */
    async funcion(cuerpo) {
      const { data } = await sb.auth.getSession();
      if (!data.session) throw new Error("La sesión expiró; vuelve a entrar");
      const r = await fetch(`${SUPABASE_URL}/functions/v1/dictado`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: CLAVE_PUBLICA,
          Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ ...cuerpo, libro_id: libroId }),
      });
      let j = {};
      try { j = await r.json(); } catch { /* sin cuerpo */ }
      return { ...j, _status: r.status };
    },

    async movimientos(desde, hasta) {
      return ok(await sb.from("movimientos").select(SELECT_MOV).eq("libro_id", libroId)
        .gte("fecha_gasto", desde).lte("fecha_gasto", hasta)
        .order("fecha_gasto", { ascending: false }).order("registrado_en", { ascending: false })).map(plano);
    },
    async actualizarMovimiento(id, campos) {
      ok(await sb.from("movimientos").update(campos).eq("id", id).select("id"));
    },
    async borrarMovimiento(id) {
      const filas = ok(await sb.from("movimientos").delete().eq("id", id).select("id"));
      if (!filas.length) throw new Error("No se pudo borrar");
    },

    async reembolsables() {
      return ok(await sb.from("movimientos").select(SELECT_MOV).eq("libro_id", libroId).eq("reembolsable", true)
        .in("estado_reembolso", ["Pendiente", "Reportado"]).order("fecha_gasto")).map(plano);
    },
    async devoluciones() {
      const desde = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
      const devs = ok(await sb.from("movimientos").select(SELECT_MOV).eq("libro_id", libroId).eq("tipo", "Reembolso")
        .gte("fecha_gasto", desde).order("fecha_gasto", { ascending: false })).map(plano);
      const conc = devs.length
        ? ok(await sb.from("conciliaciones").select("devolucion_id, monto_cubierto").in("devolucion_id", devs.map((d) => d.id)))
        : [];
      return devs.map((d) => ({
        ...d, conciliado: conc.filter((c) => c.devolucion_id === d.id).reduce((s, c) => s + Number(c.monto_cubierto), 0),
      }));
    },
    async crearReporte(ids, fechaCorte) {
      const rep = ok(await sb.from("reportes_reembolso").insert({ libro_id: libroId, fecha_corte: fechaCorte })
        .select("id").single());
      ok(await sb.from("movimientos").update({ estado_reembolso: "Reportado", reporte_id: rep.id }).in("id", ids).select("id"));
      return rep.id;
    },
    async conciliar(devolucionId, items) {
      ok(await sb.from("conciliaciones").insert(items.map((i) => ({
        devolucion_id: devolucionId, movimiento_id: i.id, monto_cubierto: i.monto,
      }))));
      for (const i of items) {
        const estado = i.monto + 0.005 >= i.total ? "Reembolsado" : "Reembolsado parcial";
        ok(await sb.from("movimientos").update({ estado_reembolso: estado, monto_reembolsado: i.monto }).eq("id", i.id).select("id"));
      }
    },
    async marcarEstado(id, estado) {
      ok(await sb.from("movimientos").update({ estado_reembolso: estado }).eq("id", id).select("id"));
    },

    async recorridos(limite = 60) {
      return ok(await sb.from("recorridos").select("id, creado_en, texto, ronda, resultado, errores, dudas, notas, costo_usd, modelo")
        .eq("libro_id", libroId).order("creado_en", { ascending: false }).limit(limite));
    },
    async costoMes(desdeISO) {
      const r = ok(await sb.from("recorridos").select("costo_usd").eq("libro_id", libroId).gte("creado_en", desdeISO));
      return { llamadas: r.length, total: r.reduce((s, x) => s + Number(x.costo_usd || 0), 0) };
    },

    // ---------- análisis ----------
    async asegurarMes() { ok(await sb.rpc("asegurar_mes")); },
    async metas() {
      return ok(await sb.from("metas_mensuales").select("mes, meta, tope, calculo, reporte").eq("libro_id", libroId)
        .order("mes", { ascending: false }).limit(24)).map((m) => ({ ...m, meta: Number(m.meta), tope: m.tope === null ? null : Number(m.tope) }));
    },
    async resumenMensual() {
      return ok(await sb.rpc("resumen_mensual", { p_libro: libroId })).map((r) => ({ ...r,
        gasto: Number(r.gasto), reembolsable: Number(r.reembolsable), devuelto: Number(r.devuelto) }));
    },
    async gastoDiario(desde) {
      return ok(await sb.rpc("gasto_diario", { p_libro: libroId, p_desde: desde })).map((r) => ({ fecha: r.fecha, gasto: Number(r.gasto) }));
    },
    async presupuestos() {
      return ok(await sb.from("presupuestos").select("categoria, monto_mensual_pen").eq("libro_id", libroId))
        .map((p) => ({ categoria: p.categoria, monto: Number(p.monto_mensual_pen) }));
    },
    async guardarPresupuestos(lista) {
      const borrar = lista.filter((p) => !(p.monto > 0)).map((p) => p.categoria);
      const poner = lista.filter((p) => p.monto > 0).map((p) => ({ libro_id: libroId, categoria: p.categoria, monto_mensual_pen: p.monto }));
      if (poner.length) ok(await sb.from("presupuestos").upsert(poner, { onConflict: "libro_id,categoria" }).select("categoria"));
      if (borrar.length) ok(await sb.from("presupuestos").delete().eq("libro_id", libroId).in("categoria", borrar).select("categoria"));
    },
    async compras() {
      return ok(await sb.from("movimientos").select("fecha_gasto, producto, lugar, cantidad, unidad, precio_unitario, monto_pen")
        .eq("libro_id", libroId).not("producto", "is", null).order("fecha_gasto", { ascending: false }).limit(2000))
        .map((c) => ({ ...c, cantidad: c.cantidad === null ? null : Number(c.cantidad),
          precio_unitario: c.precio_unitario === null ? null : Number(c.precio_unitario), monto_pen: Number(c.monto_pen) }));
    },
    async buscar(texto) {
      const t = texto.replace(/[%,()]/g, " ").trim();
      return ok(await sb.from("movimientos").select(SELECT_MOV).eq("libro_id", libroId)
        .or(`descripcion.ilike.%${t}%,producto.ilike.%${t}%,lugar.ilike.%${t}%,concepto.ilike.%${t}%`)
        .order("fecha_gasto", { ascending: false }).limit(200)).map(plano);
    },

    /** Todo el libro, de 1000 en 1000, para el respaldo. */
    async todoElLibro() {
      const filas = [];
      for (let desde = 0; ; desde += 1000) {
        const pag = ok(await sb.from("movimientos").select(SELECT_MOV).eq("libro_id", libroId)
          .order("fecha_gasto").order("registrado_en").range(desde, desde + 999)).map(plano);
        filas.push(...pag);
        if (pag.length < 1000) break;
      }
      return filas;
    },
  };
  return api;
}
